require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const JWT_SECRET = process.env.JWT_SECRET || "";
const APP_NAME = process.env.APP_NAME || "Salemo Resolve Tudo";

if (process.env.NODE_ENV === "production" && (!JWT_SECRET || JWT_SECRET.length < 32)) {
  console.error("ERRO: defina JWT_SECRET com pelo menos 32 caracteres em produção.");
  process.exit(1);
}
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({users:[], conversations:[], payments:[]}, null, 2));

function loadDb() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); }
  catch { return {users:[], conversations:[], payments:[]}; }
}
let db = loadDb();
function saveDb() {
  const temp = DB_FILE + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(db, null, 2), { mode: 0o600 });
  fs.renameSync(temp, DB_FILE);
}
function id() { return crypto.randomUUID(); }
function safeUser(user) { return {id:user.id, name:user.name, email:user.email, role:user.role, createdAt:user.createdAt}; }
function tokenFor(user) {
  return jwt.sign({sub:user.id}, JWT_SECRET || "local-development-only-change-me", {expiresIn:"7d"});
}
function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  try {
    const payload = jwt.verify(token, JWT_SECRET || "local-development-only-change-me");
    const user = db.users.find(u => u.id === payload.sub);
    if (!user) return res.status(401).json({error:"Sessão inválida. Entre novamente."});
    req.user = user;
    next();
  } catch { return res.status(401).json({error:"Inicie sessão para continuar."}); }
}
function admin(req, res, next) {
  if (!req.user || req.user.role !== "admin") return res.status(403).json({error:"Acesso reservado ao administrador."});
  next();
}
const apiLimiter = rateLimit({windowMs: 15 * 60 * 1000, limit: 160, standardHeaders: "draft-7", legacyHeaders: false});
const chatLimiter = rateLimit({windowMs: 60 * 1000, limit: 12, standardHeaders: "draft-7", legacyHeaders: false,
  message:{error:"Muitas mensagens em pouco tempo. Aguarde um minuto."}});

app.disable("x-powered-by");
app.use(helmet({contentSecurityPolicy: {
  directives: {
    defaultSrc:["'self'"], scriptSrc:["'self'"], styleSrc:["'self'","'unsafe-inline'"],
    imgSrc:["'self'","data:"], connectSrc:["'self'"], objectSrc:["'none'"],
    upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null
  }
}}));
app.use(express.json({limit:"40kb"}));
app.use("/api", apiLimiter);
app.use(express.static(path.join(__dirname, "public")));

function ensureAdmin() {
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  if (!email || !password || password.startsWith("MUDE_")) {
    console.warn("Admin não foi criado: configure ADMIN_EMAIL e ADMIN_PASSWORD em .env.");
    return;
  }
  if (db.users.some(u => u.email === email)) return;
  const adminUser = {id:id(), name:process.env.ADMIN_NAME || "Administrador", email,
    passwordHash:bcrypt.hashSync(password, 12), role:"admin", createdAt:new Date().toISOString()};
  db.users.push(adminUser); saveDb();
  console.log("Conta de administrador criada para:", email);
}
ensureAdmin();

app.get("/api/health", (_req,res) => res.json({ok:true, app:APP_NAME}));
app.get("/api/config", (_req,res) => res.json({
  appName:APP_NAME,
  paymentMethods:(process.env.PAYMENT_METHODS || "M-Pesa,e-Mola,Transferência bancária").split(",").map(x=>x.trim()).filter(Boolean),
  paymentNumber:process.env.PAYMENT_NUMBER || "",
  paymentHolder:process.env.PAYMENT_HOLDER || "",
  paymentInstructions:process.env.PAYMENT_INSTRUCTIONS || "Envie o pagamento e guarde a referência.",
  aiConfigured:Boolean(process.env.OPENAI_API_KEY)
}));

app.post("/api/register", async (req,res) => {
  const name = String(req.body.name || "").trim().slice(0,80);
  const email = String(req.body.email || "").trim().toLowerCase().slice(0,180);
  const password = String(req.body.password || "");
  if (name.length < 2) return res.status(400).json({error:"Escreva o seu nome (mínimo 2 caracteres)."});
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:"Introduza um email válido."});
  if (password.length < 10) return res.status(400).json({error:"A senha deve ter pelo menos 10 caracteres."});
  if (db.users.some(u=>u.email===email)) return res.status(409).json({error:"Este email já tem uma conta."});
  const user={id:id(),name,email,passwordHash:await bcrypt.hash(password,12),role:"user",createdAt:new Date().toISOString()};
  db.users.push(user); saveDb();
  res.status(201).json({token:tokenFor(user),user:safeUser(user)});
});
app.post("/api/login", async (req,res) => {
  const email=String(req.body.email||"").trim().toLowerCase();
  const password=String(req.body.password||"");
  const user=db.users.find(u=>u.email===email);
  if (!user || !(await bcrypt.compare(password,user.passwordHash))) return res.status(401).json({error:"Email ou senha incorretos."});
  res.json({token:tokenFor(user),user:safeUser(user)});
});
app.get("/api/me",auth,(req,res)=>res.json({user:safeUser(req.user)}));

app.get("/api/conversations",auth,(req,res)=>{
  const conversations=db.conversations.filter(c=>c.userId===req.user.id)
    .sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))
    .map(c=>({id:c.id,title:c.title,createdAt:c.createdAt,updatedAt:c.updatedAt,messages:c.messages}));
  res.json({conversations});
});
app.post("/api/chat",auth,chatLimiter,async(req,res)=>{
  const message=String(req.body.message||"").trim();
  const conversationId=String(req.body.conversationId||"");
  if (!message) return res.status(400).json({error:"Escreva uma mensagem."});
  if (message.length>6000) return res.status(400).json({error:"A mensagem é demasiado longa (máximo 6000 caracteres)."});
  let conversation=conversationId ? db.conversations.find(c=>c.id===conversationId && c.userId===req.user.id) : null;
  if (conversationId && !conversation) return res.status(404).json({error:"Conversa não encontrada."});
  if (!conversation) {
    conversation={id:id(),userId:req.user.id,title:message.slice(0,65),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),messages:[]};
    db.conversations.push(conversation);
  }
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({error:"O chat com IA ainda não está configurado. O administrador precisa de adicionar OPENAI_API_KEY nas variáveis de ambiente."});
  conversation.messages.push({role:"user",content:message,createdAt:new Date().toISOString()});
  const history=conversation.messages.slice(-20).map(m=>({role:m.role,content:m.content}));
  const systemPrompt=`Você é o assistente do ${APP_NAME}. Responda em português claro, com empatia e passos práticos. Seja honesto sobre incertezas. Não peça senhas, PINs, códigos OTP ou dados bancários secretos. Para emergências e decisões médicas, jurídicas ou financeiras de alto risco, recomende ajuda profissional adequada.`;
  try {
    const response=await fetch("https://api.openai.com/v1/chat/completions",{
      method:"POST",headers:{"Authorization":`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},
      body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-4o-mini",messages:[{role:"system",content:systemPrompt},...history],temperature:0.6})
    });
    const data=await response.json();
    if (!response.ok) {
      conversation.messages.pop();
      saveDb();
      const msg=(data && data.error && data.error.message) ? data.error.message : "Não foi possível contactar o serviço de IA.";
      return res.status(502).json({error:`Serviço de IA: ${msg.slice(0,240)}`});
    }
    const answer=data.choices?.[0]?.message?.content?.trim();
    if (!answer) throw new Error("Resposta vazia do serviço de IA.");
    conversation.messages.push({role:"assistant",content:answer,createdAt:new Date().toISOString()});
    conversation.updatedAt=new Date().toISOString();
    saveDb();
    res.json({conversationId:conversation.id,answer,conversation:{id:conversation.id,title:conversation.title,updatedAt:conversation.updatedAt}});
  } catch(err) {
    console.error("Erro no chat:",err.message);
    if (conversation.messages.at(-1)?.role==="user") conversation.messages.pop();
    saveDb();
    res.status(502).json({error:"O assistente não conseguiu responder agora. Verifique a ligação e a configuração da API e tente novamente."});
  }
});

app.post("/api/payments",auth,async(req,res)=>{
  const method=String(req.body.method||"").trim().slice(0,50);
  const amount=Number(req.body.amount);
  const reference=String(req.body.reference||"").trim().slice(0,140);
  const methods=(process.env.PAYMENT_METHODS||"M-Pesa,e-Mola,Transferência bancária").split(",").map(x=>x.trim());
  if (!methods.includes(method)) return res.status(400).json({error:"Método de pagamento inválido."});
  if (!Number.isFinite(amount)||amount<10||amount>10000000) return res.status(400).json({error:"O valor deve estar entre 10 e 10.000.000 MZN."});
  if (reference.length<3) return res.status(400).json({error:"Introduza a referência da transação. Nunca envie PIN ou código OTP."});
  const payment={id:id(),userId:req.user.id,userEmail:req.user.email,userName:req.user.name,method,amount,reference,status:"pending",createdAt:new Date().toISOString(),reviewedAt:null};
  db.payments.push(payment);saveDb();
  res.status(201).json({payment:{id:payment.id,method,amount,status:payment.status,createdAt:payment.createdAt},message:"Pedido enviado para revisão manual. O acesso pago só deve ser ativado depois da confirmação."});
});
app.get("/api/payments",auth,(req,res)=>{
  const payments=db.payments.filter(p=>req.user.role==="admin"||p.userId===req.user.id)
    .sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  res.json({payments:payments.map(p=>req.user.role==="admin"?p:{id:p.id,method:p.method,amount:p.amount,status:p.status,createdAt:p.createdAt,reviewedAt:p.reviewedAt})});
});

app.get("/api/admin/summary",auth,admin,(req,res)=>res.json({
  users:db.users.length,conversations:db.conversations.length,payments:db.payments.length,
  pendingPayments:db.payments.filter(p=>p.status==="pending").length
}));
app.get("/api/admin/users",auth,admin,(req,res)=>res.json({users:db.users.map(safeUser).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))}));
app.get("/api/admin/conversations",auth,admin,(req,res)=>res.json({
  conversations:db.conversations.slice().sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(c=>({
    id:c.id,userId:c.userId,userEmail:db.users.find(u=>u.id===c.userId)?.email||"conta removida",
    title:c.title,createdAt:c.createdAt,updatedAt:c.updatedAt,messages:c.messages
  }))
}));
app.post("/api/admin/payments/:id/review",auth,admin,(req,res)=>{
  const payment=db.payments.find(p=>p.id===req.params.id);
  if(!payment)return res.status(404).json({error:"Pedido não encontrado."});
  const status=String(req.body.status||"");
  if(!["approved","rejected"].includes(status))return res.status(400).json({error:"Estado inválido."});
  payment.status=status;payment.reviewedAt=new Date().toISOString();payment.reviewedBy=req.user.id;saveDb();
  res.json({payment,message:status==="approved"?"Pagamento marcado como confirmado manualmente.":"Pedido de pagamento rejeitado."});
});

app.delete("/api/conversations/:id",auth,(req,res)=>{
  const index=db.conversations.findIndex(c=>c.id===req.params.id&&c.userId===req.user.id);
  if(index<0)return res.status(404).json({error:"Conversa não encontrada."});
  db.conversations.splice(index,1);saveDb();res.json({ok:true});
});
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:"Ocorreu um erro inesperado."});});

app.listen(PORT,()=>console.log(`${APP_NAME} disponível em http://localhost:${PORT}`));
