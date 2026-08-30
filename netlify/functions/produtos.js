// netlify/functions/produtos.js
// Rota pública usada pela loja (script.js). Só mostra produtos com estoque disponível.

const { sql } = require('../../lib/db');

// Mesma conversão usada em admin-produtos.js: o banco guarda
// largura/altura/profundidade como colunas soltas, o front-end usa um
// objeto `dimensoes` aninhado. É aqui também que `colecao` e `peso_kg`
// chegam até o carrinho da loja, que precisa deles pra calcular o frete.
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
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido' }) };
    }

    try {
        const result = await sql`SELECT * FROM produtos WHERE estoque_total > 0;`;
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result.rows.map(formatarProduto)),
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
