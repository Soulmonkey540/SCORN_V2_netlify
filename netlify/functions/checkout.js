// netlify/functions/checkout.js
const { sql } = require('../../lib/db');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const { gerarNumeroPedido } = require('../../lib/pedido');

const mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

exports.handler = async function (event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido' }) };
    }

    const { itensIds, nomeCliente, telefoneCliente, enderecoEntrega, emailCliente } = JSON.parse(event.body || '{}');

    if (!Array.isArray(itensIds) || itensIds.length === 0) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Carrinho vazio' }) };
    }
    if (!nomeCliente || !telefoneCliente || !enderecoEntrega) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Nome, telefone e endereço de entrega são obrigatórios' }) };
    }

    try {
        const contagem = {};
        for (const id of itensIds) contagem[id] = (contagem[id] || 0) + 1;
        const idsUnicos = Object.keys(contagem).map(Number);

        const resultadoProdutos = await sql`
            SELECT * FROM produtos WHERE id = ANY(${idsUnicos});
        `;
        const produtosDb = resultadoProdutos.rows;

        if (produtosDb.length !== idsUnicos.length) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Um ou mais produtos não foram encontrados' }) };
        }

        for (const produto of produtosDb) {
            const quantidadePedida = contagem[produto.id];
            if (produto.estoque_total < quantidadePedida) {
                return { statusCode: 409, body: JSON.stringify({ error: `Estoque insuficiente para "${produto.nome}"` }) };
            }
        }

        const total = produtosDb.reduce((acc, p) => acc + Number(p.preco) * contagem[p.id], 0);
        const numeroPedido = gerarNumeroPedido();

        const pedidoCriado = await sql`
            INSERT INTO pedidos (numero_pedido, nome_cliente, telefone_cliente, endereco_entrega, total, status)
            VALUES (${numeroPedido}, ${nomeCliente}, ${telefoneCliente}, ${enderecoEntrega}, ${total}, 'aguardando_pix')
            RETURNING id;
        `;
        const pedidoId = pedidoCriado.rows[0].id;

        for (const produto of produtosDb) {
            const quantidade = contagem[produto.id];
            await sql`
                INSERT INTO pedido_itens (pedido_id, produto_id, nome_produto, preco_unitario, quantidade)
                VALUES (${pedidoId}, ${produto.id}, ${produto.nome}, ${produto.preco}, ${quantidade});
            `;
        }

        const payment = new Payment(mpClient);
        const pagamentoMp = await payment.create({
            body: {
                transaction_amount: Number(total.toFixed(2)),
                description: `Pedido ${numeroPedido} - SCORN`,
                payment_method_id: 'pix',
                payer: {
                    email: emailCliente || 'cliente@sememail.com',
                    first_name: nomeCliente,
                },
                external_reference: numeroPedido,
                notification_url: `${process.env.SITE_URL}/api/webhook-mercadopago`,
            },
        });

        await sql`
            UPDATE pedidos SET mp_payment_id = ${String(pagamentoMp.id)} WHERE id = ${pedidoId};
        `;

        const qrCode = pagamentoMp.point_of_interaction?.transaction_data?.qr_code;
        const qrCodeBase64 = pagamentoMp.point_of_interaction?.transaction_data?.qr_code_base64;

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                numeroPedido,
                total,
                qrCode,
                qrCodeBase64,
                paymentId: pagamentoMp.id,
            }),
        };

    } catch (error) {
        console.error('Erro no checkout:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Erro ao gerar cobrança PIX' }) };
    }
};
