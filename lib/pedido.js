// lib/pedido.js
function gerarNumeroPedido() {
    const agora = new Date();
    const data = agora.toISOString().slice(0, 10).replace(/-/g, ''); // 20260820
    const aleatorio = Math.floor(1000 + Math.random() * 9000); // 4 dígitos
    return `SCORN-${data}-${aleatorio}`;
}

module.exports = { gerarNumeroPedido };
