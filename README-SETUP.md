# SCORN — Guia de Setup (Netlify)

Este guia assume que você já tem uma conta no [Netlify](https://netlify.com) e
que o projeto está num repositório Git (GitHub, GitLab ou Bitbucket).

---

## 1. Rodar o schema no banco (Supabase)

1. No painel do [Supabase](https://supabase.com), abra seu projeto → **SQL Editor**.
2. Copie o conteúdo do arquivo `schema.sql` (na raiz do projeto) e execute
   **um bloco `CREATE TABLE` de cada vez** (o editor do Supabase, assim como
   o do banco antigo, não aceita múltiplos comandos numa só execução).
   - Isso cria as tabelas `produtos`, `pedidos`, `pedido_itens` e `admins`.
   - É seguro rodar mais de uma vez — usa `IF NOT EXISTS`.

---

## 2. Criar o usuário admin

O login do dashboard usa email + senha, com a senha guardada como **hash**
na tabela `admins`.

1. No seu computador, com Node instalado, dentro da pasta do projeto:
   ```bash
   npm install
   node scripts/gerar-hash-senha.js "SuaSenhaForteAqui123"
   ```
2. Copie o hash gerado (tipo `$2a$10$abcdef...`).
3. No **SQL Editor** do Supabase, rode:
   ```sql
   INSERT INTO admins (email, senha_hash)
   VALUES ('seuemail@exemplo.com', '$2a$10$COLE_O_HASH_AQUI');
   ```

---

## 3. Conectar o projeto ao Netlify

1. No painel do Netlify, clique em **Add new site → Import an existing project**.
2. Conecte sua conta Git e selecione o repositório do projeto.
3. Nas configurações de build, confirme:
   - **Build command:** deixe em branco (não há build a rodar)
   - **Publish directory:** `public`
   - **Functions directory:** `netlify/functions`
   
   (Essas três já estão configuradas no arquivo `netlify.toml` do projeto,
   então o Netlify deve preencher isso sozinho.)
4. Clique em **Deploy site**.

---

## 4. Variáveis de ambiente no Netlify

No painel do site → **Site configuration → Environment variables**, adicione:

| Nome | Valor / onde conseguir |
|---|---|
| `POSTGRES_URL` | A connection string do seu banco Supabase. No painel do Supabase: **Project Settings → Database → Connection string** (escolha o modo "Transaction" / pooler, geralmente porta `6543`). |
| `NODE_TLS_REJECT_UNAUTHORIZED` | `0` — necessário para a conexão SSL do Supabase funcionar corretamente em ambiente serverless. |
| `SESSION_SECRET` | Uma string aleatória longa. Gere com `openssl rand -hex 32` no terminal. |
| `MP_ACCESS_TOKEN` | Token do Mercado Pago (veja seção 5). |
| `SITE_URL` | A URL pública do seu site no Netlify, ex: `https://seusite.netlify.app` (sem barra no final). |
| `CALLMEBOT_PHONE` | Seu número de WhatsApp com DDI, ex: `5538999999999`. |
| `CALLMEBOT_APIKEY` | Chave gerada pelo CallMeBot (veja seção 6). |

Depois de adicionar, vá em **Deploys → Trigger deploy → Deploy site** para
essas variáveis passarem a valer.

---

## 5. Configurar o Mercado Pago (gerador do PIX)

1. Crie uma conta em [mercadopago.com.br](https://www.mercadopago.com.br).
2. Acesse o [Painel de Desenvolvedores](https://www.mercadopago.com.br/developers/panel)
   e crie uma aplicação.
3. Copie o **Access Token** (use o de teste enquanto estiver validando o fluxo).
4. Cole em `MP_ACCESS_TOKEN` no Netlify.

O Mercado Pago chama automaticamente `https://SEUSITE.netlify.app/api/webhook-mercadopago`
sempre que o status de um pagamento mudar — isso já está configurado no
código, usando a variável `SITE_URL`.

---

## 6. Configurar o CallMeBot (aviso via WhatsApp)

1. No WhatsApp, adicione **+34 644 84 71 87** aos contatos.
2. Envie a mensagem exata: `I allow callmebot to send me messages`
3. Copie a **API Key** que o bot responder.
4. Configure `CALLMEBOT_PHONE` e `CALLMEBOT_APIKEY` no Netlify.

---

## 7. Testando o fluxo completo

1. Acesse `https://SEUSITE.netlify.app/admin.html`, logue.
2. Cadastre um produto de teste com estoque.
3. Acesse a loja (`https://SEUSITE.netlify.app`), adicione ao carrinho,
   preencha os dados de entrega, finalize via PIX.
4. Use uma [conta de teste do Mercado Pago](https://www.mercadopago.com.br/developers/pt/docs/checkout-api/additional-content/your-integrations/test/accounts)
   pra simular o pagamento, se estiver usando credenciais de teste.
5. Confira se o estoque caiu e se a mensagem chegou no WhatsApp.

Se algo não funcionar, o primeiro lugar pra olhar é **Netlify → seu site →
aba Functions**, clique na função relevante (ex: `webhook-mercadopago`) pra
ver os logs de execução.

---

## Sobre a estrutura de pastas

```
/public              ← tudo aqui é servido publicamente pelo site
    index.html, admin.html, style.css, script.js, admin.css, admin.js
/netlify/functions    ← as funções de backend (API)
    produtos.js, checkout.js, webhook-mercadopago.js,
    admin-login.js, admin-logout.js, admin-produtos.js
/lib                  ← código compartilhado entre as funções (NÃO fica público)
    db.js, auth.js, whatsapp.js, pedido.js
schema.sql             ← comandos SQL (não fica público, só fica no repositório)
netlify.toml           ← configuração do Netlify
```

Diferente da estrutura anterior, agora só o que está dentro de `/public`
fica acessível pela internet — `lib/`, `schema.sql`, `package.json` etc.
ficam só no repositório, não em nenhuma URL do site.
