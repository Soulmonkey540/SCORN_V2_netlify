-- ============================================================
-- SCORN — Schema do banco (Vercel Postgres)
-- Rode este arquivo no painel do Vercel Postgres (aba "Query")
-- ou via `psql` usando a POSTGRES_URL do projeto.
-- Pode rodar tudo de uma vez, é seguro rodar de novo (IF NOT EXISTS).
-- ============================================================

-- Tabela de produtos (caso ainda não exista no seu banco).
-- Se você já tem essa tabela criada, PULE este bloco e vá para "pedidos".
CREATE TABLE IF NOT EXISTS produtos (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    tipo TEXT NOT NULL,               -- 'camiseta' | 'calca' | 'casaco'
    preco NUMERIC(10,2) NOT NULL,
    tamanhos TEXT[] NOT NULL,         -- ex: ARRAY['P','M','G']
    destaque BOOLEAN NOT NULL DEFAULT false,
    novidade BOOLEAN NOT NULL DEFAULT false,
    img TEXT,
    estoque_total INTEGER NOT NULL DEFAULT 0,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migração: coleção (Frosty/Sakami) + peso e dimensões da embalagem para
-- entrega, usados futuramente no cálculo de frete via Superfrete.
-- Rode este bloco separado se a tabela "produtos" já existia antes —
-- ADD COLUMN IF NOT EXISTS é seguro rodar de novo.
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS colecao TEXT CHECK (colecao IN ('frosty', 'sakami'));
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS peso_kg NUMERIC(6,2);
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS largura_cm NUMERIC(6,1);
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS altura_cm NUMERIC(6,1);
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS profundidade_cm NUMERIC(6,1);

-- Tabela de pedidos
CREATE TABLE IF NOT EXISTS pedidos (
    id SERIAL PRIMARY KEY,
    numero_pedido TEXT UNIQUE NOT NULL,     -- ex: "SCORN-20260820-0001"
    nome_cliente TEXT NOT NULL,
    telefone_cliente TEXT NOT NULL,
    endereco_entrega TEXT NOT NULL,
    total NUMERIC(10,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'aguardando_pix',
        -- valores usados: 'aguardando_pix' | 'pago' | 'cancelado' | 'expirado'
    mp_payment_id TEXT,                     -- id do pagamento no Mercado Pago
    estoque_baixado BOOLEAN NOT NULL DEFAULT false, -- evita baixa duplicada
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    pago_em TIMESTAMPTZ
);

-- Itens de cada pedido (snapshot do produto no momento da compra)
CREATE TABLE IF NOT EXISTS pedido_itens (
    id SERIAL PRIMARY KEY,
    pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    produto_id INTEGER NOT NULL REFERENCES produtos(id),
    nome_produto TEXT NOT NULL,   -- snapshot do nome (caso produto mude/seja removido depois)
    preco_unitario NUMERIC(10,2) NOT NULL,
    quantidade INTEGER NOT NULL DEFAULT 1
);

-- Índices úteis
CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos(status);
CREATE INDEX IF NOT EXISTS idx_pedido_itens_pedido ON pedido_itens(pedido_id);

-- Tabela de admins (login do dashboard)
CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    senha_hash TEXT NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
