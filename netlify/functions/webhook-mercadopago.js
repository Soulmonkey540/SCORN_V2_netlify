// netlify/functions/webhook-mercadopago.js
const { sql } = require('../../lib/db');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const { enviarNotificacaoWhatsApp } = require('../../lib/whatsapp');

const mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

exports.handler = async function (event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 200, body: 'ok' };
    }

    try {
        let body = {};
        try { body = JSON.parse(event.body || '{}'); } catch { /* ignora corpo malformado */ }

        const paymentId = body?.data?.id || (event.queryStringParameters && event.queryStringParameters['data.id']);
        if (!paymentId) {
            return { statusCode: 200, body: 'sem payment id, ignorado' };
        }

        const payment = new Payment(mpClient);
        const pagamento = await payment.get({ id: paymentId });

        if (pagamento.status !== 'approved') {
            return { statusCode: 200, body: 'status não aprovado ainda' };
        }

        const numeroPedido = pagamento.external_reference;
        if (!numeroPedido) {
            return { statusCode: 200, body: 'sem external_reference' };
        }

        const resultadoPedido = await sql`
            SELECT * FROM pedidos WHERE numero_pedido = ${numeroPedido};
        `;
        const pedido = resultadoPedido.rows[0];

        if (!pedido) {
            console.error('Webhook: pedido não encontrado para', numeroPedido);
            return { statusCode: 200, body: 'pedido não encontrado' };
        }

        if (pedido.estoque_baixado) {
            return { statusCode: 200, body: 'já processado' };
        }

        const itensResultado = await sql`
            SELECT * FROM pedido_itens WHERE pedido_id = ${pedido.id};
        `;
        const itens = itensResultado.rows;

        for (const item of itens) {
            await sql`
                UPDATE produtos
                SET estoque_total = GREATEST(estoque_total - ${item.quantidade}, 0)
                WHERE id = ${item.produto_id};
            `;
        }

        await sql`
            UPDATE pedidos
            SET status = 'pago', estoque_baixado = true, pago_em = now()
            WHERE id = ${pedido.id};
        `;

        const resultadoWhats = await enviarNotificacaoWhatsApp({
            numeroPedido: pedido.numero_pedido,
            itens,
            precoTotal: pedido.total,
            enderecoEntrega: pedido.endereco_entrega,
            nomeCliente: pedido.nome_cliente,
        });

        if (!resultadoWhats.enviado) {
            console.error('Falha ao enviar WhatsApp para pedido', numeroPedido, resultadoWhats);
        }

        return { statusCode: 200, body: 'processado com sucesso' };

    } catch (error) {
        console.error('Erro no webhook do Mercado Pago:', error);
        return { statusCode: 200, body: 'erro interno registrado' };
    }
};
