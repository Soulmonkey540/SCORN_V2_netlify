// netlify/functions/checkout.js
const { sql } = require('../../lib/db');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const { gerarNumeroPedido } = require('../../lib/pedido');
const { calcularFretePorColecao } = require('../../lib/superfrete');

// Cada coleção pode ter uma conta Mercado Pago própria (decisão já
// registrada no CLAUDE.md: MP_ACCESS_TOKEN_FROSTY / MP_ACCESS_TOKEN_SAKAMI).
// Enquanto o token específico de uma coleção não existir, cai de volta pro
// token único (MP_ACCESS_TOKEN) — assim o checkout continua funcionando
// com uma conta só até vocês configurarem a segunda.
function tokenMercadoPago(colecao) {
    const chaveEspecifica = `MP_ACCESS_TOKEN_${colecao.toUpperCase()}`;
    return process.env[chaveEspecifica] || process.env.MP_ACCESS_TOKEN;
}

exports.handler = async function (event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido' }) };
    }

    const { itensIds, nomeCliente, telefoneCliente, enderecoEntrega, emailCliente, cepDestino } = JSON.parse(event.body || '{}');

    if (!Array.isArray(itensIds) || itensIds.length === 0) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Carrinho vazio' }) };
    }
    if (!nomeCliente || !telefoneCliente || !enderecoEntrega) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Nome, telefone e endereço de entrega são obrigatórios' }) };
    }

    const cepLimpo = String(cepDestino || '').replace(/\D/g, '');
    if (cepLimpo.length !== 8) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Informe um CEP de destino válido para calcular o frete' }) };
    }

    try {
        // 1) Valida carrinho e estoque direto no banco — nunca confia no
        //    preço/coleção/peso que vier do navegador.
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
            if (!produto.colecao) {
                return { statusCode: 400, body: JSON.stringify({ error: `Produto "${produto.nome}" está sem coleção cadastrada — não é possível calcular o frete` }) };
            }
        }

        // 2) Separa os itens por coleção — cada coleção presente no
        //    carrinho vira um pedido (e um PIX) independente, porque cada
        //    uma tem frete e (no futuro) conta Mercado Pago próprios.
        const produtosPorColecao = produtosDb.reduce((agrupado, produto) => {
            if (!agrupado[produto.colecao]) agrupado[produto.colecao] = [];
            agrupado[produto.colecao].push(produto);
            return agrupado;
        }, {});

        // 3) Calcula o frete de cada coleção ANTES de criar qualquer
        //    pedido no banco — se uma cotação falhar, nada foi gravado
        //    ainda e podemos simplesmente devolver erro.
        const cotacoesPorColecao = {};
        for (const colecao of Object.keys(produtosPorColecao)) {
            const itensParaFrete = produtosPorColecao[colecao].map(p => ({
                colecao: p.colecao,
                peso_kg: p.peso_kg,
                preco: p.preco,
                quantidade: contagem[p.id],
            }));

            const cotacao = await calcularFretePorColecao(colecao, cepLimpo, itensParaFrete);

            if (!cotacao.disponivel || cotacao.opcoes.length === 0) {
                return {
                    statusCode: 422,
                    body: JSON.stringify({
                        error: `Não foi possível calcular o frete da coleção "${colecao}" para esse CEP${cotacao.motivo ? `: ${cotacao.motivo}` : ''}`,
                    }),
                };
            }

            cotacoesPorColecao[colecao] = cotacao.opcoes[0]; // opção mais barata
        }

        // 4) Só agora cria os pedidos + cobra o PIX de cada coleção. Se
        //    UMA coleção falhar (banco ou Mercado Pago), tudo que já foi
        //    criado nesta tentativa é revertido em vez de ficar
        //    "aguardando_pix" órfão — ver reverterPedidosCriados() abaixo.
        const pedidosGerados = [];
        const pedidosCriadosNestaTentativa = []; // { pedidoId, numeroPedido, colecao, paymentId }

        try {
            for (const colecao of Object.keys(produtosPorColecao)) {
                const produtosDaColecao = produtosPorColecao[colecao];
                const frete = cotacoesPorColecao[colecao];

                const subtotal = produtosDaColecao.reduce(
                    (acc, p) => acc + Number(p.preco) * contagem[p.id],
                    0
                );
                const total = subtotal + frete.preco;
                const numeroPedido = gerarNumeroPedido();

                const pedidoCriado = await sql`
                    INSERT INTO pedidos (numero_pedido, nome_cliente, telefone_cliente, endereco_entrega, total, status)
                    VALUES (${numeroPedido}, ${nomeCliente}, ${telefoneCliente}, ${enderecoEntrega}, ${total}, 'aguardando_pix')
                    RETURNING id;
                `;
                const pedidoId = pedidoCriado.rows[0].id;

                // Registrado ANTES de chamar o Mercado Pago — se der erro
                // logo em seguida, esse pedido (ainda sem pagamento) já
                // entra na lista do que precisa ser revertido.
                const registro = { pedidoId, numeroPedido, colecao, paymentId: null };
                pedidosCriadosNestaTentativa.push(registro);

                for (const produto of produtosDaColecao) {
                    const quantidade = contagem[produto.id];
                    await sql`
                        INSERT INTO pedido_itens (pedido_id, produto_id, nome_produto, preco_unitario, quantidade)
                        VALUES (${pedidoId}, ${produto.id}, ${produto.nome}, ${produto.preco}, ${quantidade});
                    `;
                }

                const mpClient = new MercadoPagoConfig({ accessToken: tokenMercadoPago(colecao) });
                const payment = new Payment(mpClient);
                const pagamentoMp = await payment.create({
                    body: {
                        transaction_amount: Number(total.toFixed(2)),
                        description: `Pedido ${numeroPedido} - SCORN (${colecao})`,
                        payment_method_id: 'pix',
                        payer: {
                            email: emailCliente || 'cliente@sememail.com',
                            first_name: nomeCliente,
                        },
                        external_reference: numeroPedido,
                        notification_url: `${process.env.SITE_URL}/api/webhook-mercadopago`,
                    },
                });

                registro.paymentId = pagamentoMp.id;

                await sql`
                    UPDATE pedidos SET mp_payment_id = ${String(pagamentoMp.id)} WHERE id = ${pedidoId};
                `;

                pedidosGerados.push({
                    colecao,
                    numeroPedido,
                    subtotal,
                    frete: frete.preco,
                    fretePrazoDias: frete.prazoDias,
                    total,
                    qrCode: pagamentoMp.point_of_interaction?.transaction_data?.qr_code,
                    qrCodeBase64: pagamentoMp.point_of_interaction?.transaction_data?.qr_code_base64,
                    paymentId: pagamentoMp.id,
                });
            }
        } catch (erroColecao) {
            console.error('Falha ao gerar PIX de uma das coleções — revertendo pedidos já criados nesta tentativa:', erroColecao);
            await reverterPedidosCriados(pedidosCriadosNestaTentativa);
            return {
                statusCode: 502,
                body: JSON.stringify({ error: 'Não foi possível gerar o PIX de uma das coleções do carrinho. Nenhuma cobrança ficou pendente — pode tentar novamente.' }),
            };
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pedidos: pedidosGerados }),
        };

    } catch (error) {
        console.error('Erro no checkout:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Erro ao gerar cobrança PIX' }) };
    }
};

// Desfaz os pedidos criados numa tentativa de checkout que falhou no meio
// do caminho: cancela o PIX no Mercado Pago (se já tinha sido gerado) e
// marca o pedido como "cancelado" no banco — nunca deixa "aguardando_pix"
// pendurado por uma falha que o cliente nem viu.
async function reverterPedidosCriados(pedidosCriados) {
    for (const pedido of pedidosCriados) {
        if (pedido.paymentId) {
            try {
                const mpClient = new MercadoPagoConfig({ accessToken: tokenMercadoPago(pedido.colecao) });
                const payment = new Payment(mpClient);
                await payment.cancel({ id: pedido.paymentId });
            } catch (erroCancelamento) {
                // Não interrompe a reversão dos demais pedidos por causa
                // disso — o mais importante é o pedido não ficar válido
                // no nosso próprio banco. Fica registrado no log pra
                // conferência manual no painel do Mercado Pago.
                console.error(`Não foi possível cancelar o pagamento ${pedido.paymentId} (pedido ${pedido.numeroPedido}) no Mercado Pago:`, erroCancelamento);
            }
        }

        try {
            await sql`UPDATE pedidos SET status = 'cancelado' WHERE id = ${pedido.pedidoId};`;
        } catch (erroDb) {
            console.error(`Falha ao marcar pedido ${pedido.numeroPedido} (id ${pedido.pedidoId}) como cancelado:`, erroDb);
        }
    }
}
