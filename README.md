# Salemo Resolve Tudo — versão com IA

Aplicação web Node.js com:
- Registo e início de sessão.
- Chat com IA usando a API da OpenAI.
- Histórico de conversas por utilizador.
- Painel de administrador para consultar utilizadores, conversas e pedidos de pagamento.
- Pedidos de pagamento manual (M-Pesa, e-Mola ou transferência) com confirmação pelo administrador.

## Antes de começar
É necessário um computador ou alojamento que execute Node.js 20+. O ficheiro HTML sozinho não basta para proteger contas, guardar histórico no servidor ou chamar a IA em segurança.

## Instalação local
1. Instale Node.js 20 ou superior: https://nodejs.org/
2. Extraia o ZIP para uma pasta.
3. Abra o terminal nessa pasta e execute:
   ```bash
   npm install
   ```
4. Copie `.env.example` para `.env`.
5. Edite `.env` e preencha:
   - `JWT_SECRET`: uma chave longa e aleatória.
   - `OPENAI_API_KEY`: a sua chave da API OpenAI, criada na plataforma da API. A subscrição do ChatGPT não inclui automaticamente crédito da API.
   - `ADMIN_EMAIL` e `ADMIN_PASSWORD`: credenciais fortes para o administrador.
   - `PAYMENT_NUMBER` e `PAYMENT_HOLDER`: os seus dados reais para receber pagamentos.
6. Inicie:
   ```bash
   npm start
   ```
7. Abra http://localhost:3000 no navegador.

Se `OPENAI_API_KEY` estiver vazia, o site continua a funcionar, mas o chat mostra uma mensagem de configuração necessária.

## Publicar online com Render
1. Crie um repositório privado no GitHub e envie os ficheiros do projeto (não envie o `.env`).
2. Crie uma conta em https://render.com/ e escolha **New Web Service** para ligar o repositório.
3. Use `npm install` como build command e `npm start` como start command. O `render.yaml` ajuda a configurar.
4. Nas variáveis de ambiente, configure `OPENAI_API_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `PAYMENT_NUMBER` e `PAYMENT_HOLDER`.
5. Ative armazenamento persistente para a pasta `data/` ou substitua o armazenamento JSON por uma base de dados gerida. Sem disco persistente, os dados locais podem desaparecer após reinícios ou novas implantações.
6. Teste registo, login, chat, histórico e pedido de pagamento antes de divulgar o site.

## Como funciona o pagamento
Esta versão **não cobra automaticamente**. O utilizador envia um pedido com método, valor e referência; o administrador confirma ou rejeita no painel. Para cobrança automática, é necessário integrar uma API oficial de pagamentos (por exemplo, do fornecedor local), obter credenciais comerciais e configurar webhooks seguros. Nunca peça PIN, senha ou código OTP de M-Pesa/e-Mola.

## Segurança e limitações importantes
- Não publique com as credenciais de exemplo.
- Não partilhe a chave da OpenAI nem a coloque no frontend.
- Defina limites de utilização e acompanhe os custos da API.
- Para produção, use uma base de dados gerida, backups, monitorização e uma política de privacidade.
- A IA pode errar; não substitui profissionais médicos, jurídicos ou financeiros.
- Este é um ponto de partida funcional, não uma auditoria de segurança. Antes de aceitar muitos utilizadores ou pagamentos, peça uma revisão técnica.
