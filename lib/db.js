// lib/db.js
// Conexão com o banco Postgres (Supabase, criado automaticamente pelo Vercel).
// Usamos a biblioteca "pg" (node-postgres), que funciona com qualquer Postgres
// padrão — diferente de "@vercel/postgres", que só funciona com Neon.

const { Pool } = require('pg');

// O pooler do Supabase apresenta um certificado que o Node, por padrão,
// não reconhece como "confiável" (comum em bancos serverless). Como a
// conexão em si já é validada pela própria string de conexão (usuário,
// senha, host exatos), desativamos a validação estrita do certificado.
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: {
        rejectUnauthorized: false,
    },
});

// Mantém a mesma sintaxe "sql`SELECT ...`" usada no resto do código,
// pra não precisar reescrever todas as queries — só troca o motor por baixo.
function sql(strings, ...values) {
    let texto = '';
    strings.forEach((parte, i) => {
        texto += parte;
        if (i < values.length) texto += `$${i + 1}`;
    });
    return pool.query(texto, values);
}

module.exports = { sql, pool };
