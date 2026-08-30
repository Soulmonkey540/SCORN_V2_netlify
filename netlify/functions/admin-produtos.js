// netlify/functions/admin-produtos.js
// CRUD de produtos para o dashboard de admin. Protegido por sessão.

const { sql } = require('../../lib/db');
const { exigirSessaoAdmin } = require('../../lib/auth');

// O banco guarda largura/altura/profundidade como colunas planas; o
// front-end trabalha com um objeto `dimensoes` aninhado. Esse helper
// faz a conversão na saída (GET/POST/PUT), sem mexer no formato do banco.
function formatarProduto(row) {
    const { largura_cm, altura_cm, profundidade_cm, ...resto } = row;
    return {
        ...resto,
        dimensoes: {
            largura_cm: largura_cm !== null ? Number(largura_cm) : null,
            altura_cm: altura_cm !== null ? Number(altura_cm) : null,
            profundidade_cm: profundidade_cm !== null ? Number(profundidade_cm) : null,
        },
    };
}

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
            const produtos = resultado.rows.map(formatarProduto);
            return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(produtos) };
        }

        if (event.httpMethod === 'POST') {
            const {
                nome, tipo, preco, tamanhos, destaque, novidade, img, estoque_total,
                colecao, peso_kg, dimensoes,
            } = JSON.parse(event.body || '{}');

            if (!nome || !tipo || preco === undefined || !Array.isArray(tamanhos)) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Campos obrigatórios: nome, tipo, preco, tamanhos (array)' }) };
            }
            if (!colecao || !['frosty', 'sakami'].includes(colecao)) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Campo "colecao" é obrigatório e deve ser "frosty" ou "sakami"' }) };
            }

            const { largura_cm, altura_cm, profundidade_cm } = dimensoes || {};

            const resultado = await sql`
                INSERT INTO produtos (
                    nome, tipo, preco, tamanhos, destaque, novidade, img, estoque_total,
                    colecao, peso_kg, largura_cm, altura_cm, profundidade_cm
                )
                VALUES (
                    ${nome}, ${tipo}, ${preco}, ${tamanhos},
                    ${!!destaque}, ${!!novidade}, ${img || null}, ${estoque_total || 0},
                    ${colecao}, ${peso_kg ?? null}, ${largura_cm ?? null}, ${altura_cm ?? null}, ${profundidade_cm ?? null}
                )
                RETURNING *;
            `;
            return { statusCode: 201, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formatarProduto(resultado.rows[0])) };
        }

        if (event.httpMethod === 'PUT') {
            const {
                id, nome, tipo, preco, tamanhos, destaque, novidade, img, estoque_total,
                colecao, peso_kg, dimensoes,
            } = JSON.parse(event.body || '{}');

            if (!id) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Campo "id" é obrigatório' }) };
            }
            if (colecao && !['frosty', 'sakami'].includes(colecao)) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Campo "colecao" deve ser "frosty" ou "sakami"' }) };
            }

            const { largura_cm, altura_cm, profundidade_cm } = dimensoes || {};

            const resultado = await sql`
                UPDATE produtos SET
                    nome = ${nome},
                    tipo = ${tipo},
                    preco = ${preco},
                    tamanhos = ${tamanhos},
                    destaque = ${!!destaque},
                    novidade = ${!!novidade},
                    img = ${img || null},
                    estoque_total = ${estoque_total},
                    colecao = ${colecao || null},
                    peso_kg = ${peso_kg ?? null},
                    largura_cm = ${largura_cm ?? null},
                    altura_cm = ${altura_cm ?? null},
                    profundidade_cm = ${profundidade_cm ?? null}
                WHERE id = ${id}
                RETURNING *;
            `;

            if (resultado.rows.length === 0) {
                return { statusCode: 404, body: JSON.stringify({ error: 'Produto não encontrado' }) };
            }
            return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formatarProduto(resultado.rows[0])) };
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
