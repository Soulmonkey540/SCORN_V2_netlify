// netlify/functions/calcular-frete.js
// POST público: recebe o CEP de destino e os itens do carrinho (cada um
// com colecao/peso_kg/preco/quantidade) e devolve o frete calculado
// separadamente por coleção — cada coleção usa uma conta SuperFrete
// diferente, então o carrinho pode virar mais de uma cotação.

const { calcularFreteCarrinho } = require('../../lib/superfrete');

exports.handler = async function (event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido' }) };
    }

    try {
        const { cepDestino, itens } = JSON.parse(event.body || '{}');

        const cepLimpo = String(cepDestino || '').replace(/\D/g, '');
        if (cepLimpo.length !== 8) {
            return { statusCode: 400, body: JSON.stringify({ error: 'CEP de destino inválido' }) };
        }
        if (!Array.isArray(itens) || itens.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Carrinho vazio' }) };
        }
        if (itens.some(item => !item.colecao)) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Todo item do carrinho precisa ter "colecao" (frosty ou sakami)' }) };
        }

        const fretes = await calcularFreteCarrinho(cepLimpo, itens);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fretes }),
        };
    } catch (error) {
        console.error('Erro ao calcular frete:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Erro ao calcular frete' }) };
    }
};
