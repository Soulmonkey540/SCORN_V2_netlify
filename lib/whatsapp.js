// lib/whatsapp.js
// Envio de notificação via CallMeBot.
//
// IMPORTANTE sobre o CallMeBot (limitações a ter em mente):
// - Ele manda a mensagem para O SEU número (o número que você cadastrou
//   no CallMeBot), não para o número do cliente. Serve como um "aviso"
//   pra você, dono da loja, saber que chegou pedido novo.
// - Tem limite informal de uso (uso pessoal/baixo volume). Se a loja
//   crescer e isso passar a falhar/atrasar, migre pra WhatsApp Cloud API
//   (API oficial da Meta) — a função abaixo é a única coisa que precisa
//   trocar, o resto do sistema não muda.
// - Requer que você tenha ativado o bot no seu WhatsApp (passo a passo
//   está no README-SETUP.md).

async function enviarNotificacaoWhatsApp({ numeroPedido, itens, precoTotal, enderecoEntrega, nomeCliente }) {
    const telefone = process.env.CALLMEBOT_PHONE;   // seu número, formato internacional, ex: 5538999999999
    const apiKey = process.env.CALLMEBOT_APIKEY;    // apikey gerada pelo CallMeBot

    if (!telefone || !apiKey) {
        console.error('CALLMEBOT_PHONE ou CALLMEBOT_APIKEY não configurados. Notificação não enviada.');
        return { enviado: false, motivo: 'credenciais ausentes' };
    }

    const listaItens = itens.map(i => `- ${i.quantidade}x ${i.nome_produto} (R$ ${Number(i.preco_unitario).toFixed(2)})`).join('\n');

    const texto =
        `🛒 *Novo pedido pago - SCORN*\n` +
        `Pedido: ${numeroPedido}\n` +
        `Cliente: ${nomeCliente}\n\n` +
        `Itens:\n${listaItens}\n\n` +
        `Total pago: R$ ${Number(precoTotal).toFixed(2)}\n` +
        `Endereço de entrega: ${enderecoEntrega}`;

    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(telefone)}&text=${encodeURIComponent(texto)}&apikey=${encodeURIComponent(apiKey)}`;

    try {
        const resposta = await fetch(url);
        const corpo = await resposta.text();
        return { enviado: resposta.ok, statusCode: resposta.status, corpo };
    } catch (erro) {
        console.error('Erro ao enviar WhatsApp via CallMeBot:', erro);
        return { enviado: false, motivo: erro.message };
    }
}

module.exports = { enviarNotificacaoWhatsApp };
