# CLAUDE.md — Projeto SCORN

Documento de contexto do projeto, pra qualquer sessão futura (Claude ou
humano) entender rápido o que já existe, como foi construído, e o que
ainda falta.

---

## O que é o projeto

Loja virtual de roupas (streetwear/estética anime), em português, vendendo
via PIX, com um painel administrativo próprio pra gerenciar produtos.

**Nome:** SCORN

---

## Stack atual

| Camada | Tecnologia |
|---|---|
| Frontend | HTML/CSS/JS puro (sem framework) |
| Hospedagem | **Netlify** (site + funções serverless) |
| Backend | Netlify Functions (Node.js, formato `exports.handler`) |
| Banco de dados | **Supabase** (Postgres), acessado via `pg` (não via `@vercel/postgres`) |
| Armazenamento de imagens | Supabase Storage (bucket `produtos-imagens`) |
| Pagamento | Mercado Pago (PIX) |
| Notificação | CallMeBot (WhatsApp) |

### Histórico de hospedagem (importante saber por quê mudou)

1. **Começou no Vercel**, usando `@vercel/postgres` (driver específico do Neon).
2. O banco criado pelo Vercel na verdade usa **Supabase por baixo dos panos**
   — `@vercel/postgres` não é compatível com isso, causou erro de DNS
   (`getaddrinfo ENOTFOUND api.pooler.supabase.com`). Trocamos pra `pg`
   (biblioteca padrão), com `ssl: { rejectUnauthorized: false }` e a env var
   `NODE_TLS_REJECT_UNAUTHORIZED=0` pra lidar com o certificado do pooler
   do Supabase.
3. **Migramos do Vercel pro Netlify inteiramente**, porque:
   - O plano gratuito do Vercel (Hobby) proíbe uso comercial.
   - Cloudflare Pages (alternativa cogitada) foi descartado: seu limite de
     CPU no plano grátis (10ms) quebraria o `bcrypt` do login (que
     propositalmente é lento).
   - Render (outra alternativa) foi descartado por ter "sono" após 15min de
     inatividade (30-60s de espera na primeira requisição).
   - **Netlify** venceu: permite uso comercial no grátis, roda um ambiente
     Node.js completo (sem trocar `bcrypt`/`pg`), e não tem esse "sono".

---

## Estrutura de pastas

```
/public                  ← só isso fica público na internet
    index.html            ← loja (visual novo, neo-brutalista P&B)
    admin.html             ← painel administrativo
    style.css               ← estilos da loja (+ variáveis usadas pelo admin)
    admin.css                ← estilos específicos do admin
    script.js                 ← lógica da loja
    admin.js                   ← lógica do painel admin
    logo.png                    ← logo oficial (fornecida pelo usuário)

/netlify/functions        ← backend (Netlify Functions)
    produtos.js             ← GET público: lista produtos com estoque > 0
    checkout.js              ← POST: cria pedido + gera cobrança PIX
    webhook-mercadopago.js    ← POST: confirma pagamento, baixa estoque, envia WhatsApp
    admin-login.js             ← POST: login do admin (JWT em cookie)
    admin-logout.js             ← POST: logout
    admin-produtos.js            ← GET/POST/PUT/DELETE: CRUD de produtos (protegido)
    admin-upload-imagem.js        ← POST: recebe imagem em base64, sobe pro Supabase Storage

/lib                       ← código compartilhado (NÃO fica público)
    db.js                     ← conexão Postgres via `pg`
    auth.js                    ← sessão JWT do admin (cookie httpOnly)
    whatsapp.js                 ← envio via CallMeBot
    pedido.js                    ← gera número único de pedido
    supabaseStorage.js            ← upload de imagem pro Supabase Storage

schema.sql                  ← comandos SQL das tabelas (não fica público)
netlify.toml                 ← config do Netlify (publish dir, functions dir, redirects /api/*)
package.json                  ← dependências: pg, mercadopago, bcryptjs, jsonwebtoken, @supabase/supabase-js
README-SETUP.md                ← guia passo a passo de configuração
.gitignore                      ← ignora node_modules, .netlify, .env
```

---

## Banco de dados (tabelas)

- **`produtos`** — id, nome, tipo, preco, tamanhos (array), destaque, novidade,
  img (URL), estoque_total
- **`pedidos`** — numero_pedido, nome_cliente, telefone_cliente,
  endereco_entrega, total, status (`aguardando_pix`/`pago`/etc),
  mp_payment_id, estoque_baixado (evita processar duplicado), pago_em
- **`pedido_itens`** — snapshot de cada item comprado (nome/preço no momento
  da compra, não muda se o produto for editado depois)
- **`admins`** — email, senha_hash (bcrypt)

---

## Fluxo de compra (como funciona hoje)

1. Cliente navega pelo catálogo (ou destaques/novidades), adiciona ao carrinho
2. No carrinho, preenche nome/telefone/endereço (texto livre — CEP estruturado
   ainda não implementado, ver "Pausado" abaixo)
3. Clica "Finalizar via PIX" → `checkout.js` valida estoque e preços **direto
   no banco** (nunca confia no que vem do navegador), cria o pedido, gera
   cobrança PIX no Mercado Pago, mostra QR Code + código copia-e-cola
4. Cliente paga → Mercado Pago chama `webhook-mercadopago.js` automaticamente
5. Webhook confirma pagamento aprovado, **baixa o estoque**, marca pedido como
   pago, e **envia notificação via WhatsApp** (CallMeBot) com número do
   pedido, itens, total e endereço

---

## Painel admin (`/admin.html`)

- Login com email/senha (hash bcrypt, sessão JWT em cookie httpOnly/secure/
  samesite=strict, expira em 12h)
- CRUD completo de produtos (criar/editar/remover)
- Upload de imagem: comprime/redimensiona no navegador (canvas, máx 1600px,
  JPEG 80%) antes de enviar → sobe pro Supabase Storage → preenche a URL
  automaticamente
- Toda rota de dados do admin exige sessão válida (`exigirSessaoAdmin`) —
  sem login, a API responde 401 pra tudo

---

## Variáveis de ambiente necessárias (configuradas no Netlify)

| Nome | Uso |
|---|---|
| `POSTGRES_URL` | Connection string do Supabase (pooler, modo transaction) |
| `NODE_TLS_REJECT_UNAUTHORIZED=0` | Necessário pro certificado SSL do Supabase funcionar |
| `SESSION_SECRET` | Assina o JWT de sessão do admin |
| `MP_ACCESS_TOKEN` | Token do Mercado Pago |
| `SITE_URL` | URL pública do site (usada no webhook do Mercado Pago) |
| `CALLMEBOT_PHONE` / `CALLMEBOT_APIKEY` | Notificação WhatsApp |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Upload de imagens (chave com acesso total — nunca expor no front-end) |

Passo a passo completo de cada uma está no `README-SETUP.md`.

---

## Design visual — histórico e estado atual

1. **V1:** tema claro/escuro alternável, visual genérico
2. **V2:** pedido de redesign com inspiração numa imagem de referência
   (fundo preto, logo serifada ornamentada, mood anime) → paleta escura
   única com azul de destaque, fonte `Cormorant Garamond` + `Inter`,
   modo claro removido (site fixo escuro)
3. **V3 (atual):** o usuário forneceu um **HTML/CSS prontos** com um visual
   "neo-brutalista": fundo preto puro, logo com efeito de sombra deslocada
   branca, menu horizontal centralizado (sem mais menu lateral/hambúrguer),
   rodapé com área de imagem grande. Integrei a funcionalidade real da loja
   dentro dessa estrutura, mantendo o visual exatamente como enviado.
   - **Decisão tomada:** como o novo menu não tem mais link "Catálogo",
     **clicar na logo abre o catálogo completo com filtros** (reaproveitando
     o clique que antes só resetava a tela).
   - **Carrinho deixou de ser uma gaveta lateral** (`cart-sidebar`) e virou
     mais uma seção de conteúdo trocável, como Destaques/Novidades — pra
     bater com a estrutura de `content-view` que veio no HTML enviado.
   - Variáveis de compatibilidade (`--border-color`, `--accent-color`, etc.)
     foram adicionadas ao `style.css` pra não quebrar o `admin.css`, que
     depende delas.

**Logo:** arquivo `logo.png` fornecido pelo usuário, já integrado no header
da loja e nas duas telas do admin.

**Imagem do rodapé:** o usuário pediu um GIF do personagem Eren Yeager
(Attack on Titan) olhando/apontando pro oceano nesse espaço. **Isso foi
recusado** — é uso comercial não autorizado de IP licenciada de terceiros
(Kodansha/MAPPA). Ficou um placeholder reservado no lugar, esperando uma
imagem própria/licenciada do usuário.

---

## Pausado / adiado (retomar quando o usuário pedir)

O usuário pediu pra adiar temporariamente, em prol do redesign visual:

1. **Duas coleções: "Frosty" e "Sakami"**
   - Cada produto pertenceria a uma das duas coleções
   - **PIX de cada coleção vai pra uma conta Mercado Pago diferente**
     (precisa de dois `MP_ACCESS_TOKEN`)
   - **WhatsApp de cada coleção vai pra um número diferente** (precisa de
     dois pares `CALLMEBOT_PHONE`/`CALLMEBOT_APIKEY`)
   - **Decisão já tomada:** se o carrinho tiver itens das duas coleções,
     o sistema deve **gerar 2 pedidos/PIX separados automaticamente**
     (não dá pra pagar 1 PIX só que vai pra 2 contas diferentes)

2. **Cálculo de frete via Superfrete**
   - Cada coleção tem um **CEP de origem diferente**
   - Frosty: caixa fixa 5×20×30cm, até 1kg
   - Sakami: peso variável — decisão tomada foi usar **peso por produto
     individual** (campo a adicionar no cadastro) + **sistema de faixas de
     embalagem** (P/M/G/GG) baseado no peso total do pedido, não uma caixa
     única
   - Frete precisa ser somado ao valor do PIX antes de gerar a cobrança
   - **Endereço do cliente precisa virar formulário estruturado** (CEP, rua,
     número, complemento, bairro, cidade, estado — com autopreenchimento por
     CEP) em vez do campo de texto livre atual — **já aprovado pelo
     usuário**, só não implementado ainda porque as APIs foram pausadas
   - Preciso ainda: token de API do Superfrete, CEP de origem de cada
     coleção, confirmação se o usuário já tem conta lá

**Nada dessas duas frentes foi implementado no código ainda** — só as
decisões de design foram fechadas em conversa, documentadas aqui pra não
perder o contexto.

---

## Avisos de segurança/operacionais importantes

- **Nunca desconectar/desinstalar a integração Supabase pelo painel do
  Vercel** — isso pode apagar o banco de dados inteiro (ele "pertence" ao
  Vercel nessa integração). O projeto foi migrado pro Netlify, então o
  projeto Vercel deve simplesmente ficar parado/não usado, nunca deletado
  por ali.
- `SUPABASE_SERVICE_ROLE_KEY` tem acesso total ao banco — só em variável de
  ambiente do servidor, nunca no código do front-end.
- O bucket `produtos-imagens` no Supabase Storage precisa estar marcado como
  **público**, senão as imagens não aparecem pros clientes.
- Ao rodar `schema.sql` no editor SQL do Supabase, executar **um bloco
  `CREATE TABLE` por vez** — o editor não aceita múltiplos comandos numa
  única execução (erro "cannot insert multiple commands into a prepared
  statement").
