// netlify/functions/admin-produtos.js
// CRUD de produtos para o dashboard de admin. Protegido por sessão.

const { sql } = require('../../lib/db');
const { exigirSessaoAdmin } = require('../../lib/auth');

exports.handler = async function (event) {
    try {
        exigirSessaoAdmin(event);
    } catch (erro) {
        return {
            statusCode: erro.status || 401,
            body: JSON.stringify({ error: erro.message }),
        };
    }

    try {
        if (event.httpMethod === 'GET') {
            const resultado = await sql`SELECT * FROM produtos ORDER BY id DESC;`;
            return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(resultado.rows) };
        }

        if (event.httpMethod === 'POST') {
            const { nome, tipo, preco, tamanhos, destaque, novidade, img, estoque_total } = JSON.parse(event.body || '{}');

            if (!nome || !tipo || preco === undefined || !Array.isArray(tamanhos)) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Campos obrigatórios: nome, tipo, preco, tamanhos (array)' }) };
            }

            const resultado = await sql`
                INSERT INTO produtos (nome, tipo, preco, tamanhos, destaque, novidade, img, estoque_total)
                VALUES (
                    ${nome}, ${tipo}, ${preco}, ${tamanhos},
                    ${!!destaque}, ${!!novidade}, ${img || null}, ${estoque_total || 0}
                )
                RETURNING *;
            `;
            return { statusCode: 201, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(resultado.rows[0]) };
        }

        if (event.httpMethod === 'PUT') {
            const { id, nome, tipo, preco, tamanhos, destaque, novidade, img, estoque_total } = JSON.parse(event.body || '{}');

            if (!id) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Campo "id" é obrigatório' }) };
            }

            const resultado = await sql`
                UPDATE produtos SET
                    nome = ${nome},
                    tipo = ${tipo},
                    preco = ${preco},
                    tamanhos = ${tamanhos},
                    destaque = ${!!destaque},
                    novidade = ${!!novidade},
                    img = ${img || null},
                    estoque_total = ${estoque_total}
                WHERE id = ${id}
                RETURNING *;
            `;

            if (resultado.rows.length === 0) {
                return { statusCode: 404, body: JSON.stringify({ error: 'Produto não encontrado' }) };
            }
            return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(resultado.rows[0]) };
        }

        if (event.httpMethod === 'DELETE') {
            const id = event.queryStringParameters && event.queryStringParameters.id;
            if (!id) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Parâmetro "id" é obrigatório' }) };
            }

            await sql`DELETE FROM produtos WHERE id = ${id};`;
            return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
        }

        return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido' }) };

    } catch (error) {
        console.error('Erro na API de produtos (admin):', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Erro ao processar requisição' }) };
    }
};
