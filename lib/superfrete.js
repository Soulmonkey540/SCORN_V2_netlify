// lib/superfrete.js
// Integração com a API de cálculo de frete da SuperFrete.
//
// IMPORTANTE: cada coleção (Frosty/Sakami) usa uma CONTA SuperFrete
// diferente (token diferente) e um CEP de origem diferente — por isso
// a config abaixo é por coleção, e o cálculo do carrinho sempre separa
// os itens por coleção antes de chamar a API (uma chamada por coleção).
//
// Confira o payload contra a doc oficial antes de ir pra produção:
// https://superfrete.readme.io/reference/calculador
// (o formato abaixo segue o padrão documentado publicamente pela
// SuperFrete no momento em que este código foi escrito.)

const SUPERFRETE_BASE_URL = process.env.SUPERFRETE_SANDBOX === 'true'
    ? 'https://sandbox.superfrete.com/api/v0'
    : 'https://api.superfrete.com/api/v0';

// Token e CEP de origem de cada coleção vêm de variáveis de ambiente —
// nunca hardcoded aqui. Configure no painel do Netlify:
//   SUPERFRETE_TOKEN_FROSTY / SUPERFRETE_CEP_ORIGEM_FROSTY
//   SUPERFRETE_TOKEN_SAKAMI / SUPERFRETE_CEP_ORIGEM_SAKAMI
const CONFIG_COLECOES = {
    frosty: {
        token: process.env.SUPERFRETE_TOKEN_FROSTY || null,
        cepOrigem: process.env.SUPERFRETE_CEP_ORIGEM_FROSTY || null,
    },
    sakami: {
        token: process.env.SUPERFRETE_TOKEN_SAKAMI || null,
        cepOrigem: process.env.SUPERFRETE_CEP_ORIGEM_SAKAMI || null,
    },
};

// Faixas de embalagem da Sakami por peso total do pedido (P/M/G/GG),
// conforme decisão já registrada no CLAUDE.md do projeto. Ajuste os
// valores de largura/altura/profundidade (cm) para as caixas reais
// que vocês vão usar.
const FAIXAS_SAKAMI = [
    { ateKg: 0.3, largura: 16, altura: 4, profundidade: 24 },      // P
    { ateKg: 1, largura: 20, altura: 8, profundidade: 30 },        // M
    { ateKg: 3, largura: 30, altura: 15, profundidade: 40 },       // G
    { ateKg: Infinity, largura: 35, altura: 25, profundidade: 45 }, // GG
];

// Frosty: caixa fixa 5x20x30cm, até 1kg (conforme CLAUDE.md).
const CAIXA_FROSTY = { largura: 20, altura: 5, profundidade: 30, pesoMaximoKg: 1 };

function configColecao(colecao) {
    const config = CONFIG_COLECOES[colecao];
    if (!config) throw new Error(`Coleção desconhecida: "${colecao}"`);
    return config;
}

// Decide as dimensões/peso do pacote a partir dos itens do pedido
// (já filtrados para uma única coleção).
function calcularEmbalagem(colecao, itens) {
    const pesoTotal = itens.reduce(
        (soma, item) => soma + (Number(item.peso_kg) || 0) * (item.quantidade || 1),
        0
    );

    if (colecao === 'frosty') {
        return {
            peso: Math.min(Math.max(pesoTotal, 0.1), CAIXA_FROSTY.pesoMaximoKg),
            largura: CAIXA_FROSTY.largura,
            altura: CAIXA_FROSTY.altura,
            comprimento: CAIXA_FROSTY.profundidade,
        };
    }

    if (colecao === 'sakami') {
        const faixa = FAIXAS_SAKAMI.find(f => pesoTotal <= f.ateKg) || FAIXAS_SAKAMI[FAIXAS_SAKAMI.length - 1];
        return {
            peso: Math.max(pesoTotal, 0.1),
            largura: faixa.largura,
            altura: faixa.altura,
            comprimento: faixa.profundidade,
        };
    }

    throw new Error(`Coleção desconhecida: "${colecao}"`);
}

// Calcula o frete de UMA coleção (uma chamada à API, com o token/CEP
// daquela coleção). Retorna disponivel:false (sem lançar erro) quando
// a coleção ainda não tem token/CEP configurados, pra não derrubar o
// cálculo das outras coleções no mesmo carrinho.
async function calcularFretePorColecao(colecao, cepDestino, itens) {
    const config = configColecao(colecao);

    if (!config.token || !config.cepOrigem) {
        return {
            colecao,
            disponivel: false,
            motivo: `Frete da coleção "${colecao}" ainda não configurado (falta token e/ou CEP de origem nas variáveis de ambiente).`,
        };
    }

    const pacote = calcularEmbalagem(colecao, itens);
    const valorDeclarado = itens.reduce(
        (soma, item) => soma + (Number(item.preco) || 0) * (item.quantidade || 1),
        0
    );

    let resposta;
    try {
        resposta = await fetch(`${SUPERFRETE_BASE_URL}/calculator`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.token}`,
                'User-Agent': 'SCORN (contato@scorn.com.br)',
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: { postal_code: config.cepOrigem },
                to: { postal_code: cepDestino },
                products: [
                    {
                        id: '1',
                        width: pacote.largura,
                        height: pacote.altura,
                        length: pacote.comprimento,
                        weight: pacote.peso,
                        insurance_value: valorDeclarado,
                        quantity: 1,
                    },
                ],
            }),
        });
    } catch (erroRede) {
        console.error(`Erro de rede ao consultar SuperFrete (${colecao}):`, erroRede);
        return { colecao, disponivel: false, motivo: 'Erro de conexão com a SuperFrete' };
    }

    if (!resposta.ok) {
        const textoErro = await resposta.text();
        console.error(`Erro SuperFrete (${colecao}):`, resposta.status, textoErro);
        return { colecao, disponivel: false, motivo: 'Erro ao consultar frete na SuperFrete' };
    }

    const opcoes = await resposta.json();

    // A API retorna uma lista de opções (PAC, Sedex etc), algumas podem
    // vir com `error` quando aquela modalidade não atende o trajeto.
    const opcoesValidas = (Array.isArray(opcoes) ? opcoes : [])
        .filter(opcao => !opcao.error)
        .map(opcao => ({
            servico: opcao.name,
            transportadora: opcao.company?.name || null,
            preco: Number(opcao.price),
            prazoDias: opcao.delivery_time,
        }))
        .sort((a, b) => a.preco - b.preco);

    return { colecao, disponivel: true, pacote, opcoes: opcoesValidas };
}

// Recebe o carrinho inteiro (itens de qualquer coleção misturados),
// separa por coleção e calcula cada uma independentemente — porque
// cada coleção vira uma cotação (e depois um PIX) separado.
async function calcularFreteCarrinho(cepDestino, itens) {
    const itensPorColecao = itens.reduce((agrupado, item) => {
        const colecao = item.colecao;
        if (!colecao) return agrupado;
        if (!agrupado[colecao]) agrupado[colecao] = [];
        agrupado[colecao].push(item);
        return agrupado;
    }, {});

    const colecoes = Object.keys(itensPorColecao);
    const resultados = await Promise.all(
        colecoes.map(colecao => calcularFretePorColecao(colecao, cepDestino, itensPorColecao[colecao]))
    );

    return resultados;
}

module.exports = { calcularFretePorColecao, calcularFreteCarrinho, calcularEmbalagem };
