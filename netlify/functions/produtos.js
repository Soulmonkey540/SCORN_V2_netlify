// netlify/functions/produtos.js
// Rota pública usada pela loja (script.js). Só mostra produtos com estoque disponível.

const { sql } = require('../../lib/db');

exports.handler = async function (event) {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido' }) };
    }

    try {
        const result = await sql`SELECT * FROM produtos WHERE estoque_total > 0;`;
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result.rows),
        };
    } catch (error) {
        console.error('Erro ao buscar produtos:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Erro ao buscar produtos' }),
        };
    }
};
