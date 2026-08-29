// --- NAVEGAÇÃO ---
const menuLinks = {
    'destaques-link': 'destaques-content',
    'novidades-link': 'novidades-content',
    'carrinho-link': 'carrinho-content'
};

const linkElements = document.querySelectorAll('.menu-link');
const contentViews = document.querySelectorAll('.content-view');

function mostrarView(viewId) {
    contentViews.forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
}

linkElements.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();

        linkElements.forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        mostrarView(menuLinks[link.id]);

        if (link.id === 'carrinho-link') renderizarCarrinho();
    });
});

// Clicar na logo abre o catálogo completo (com filtros)
document.getElementById('logo-container').addEventListener('click', () => {
    linkElements.forEach(l => l.classList.remove('active'));
    mostrarView('catalogo-content');
});

// --- DADOS (Netlify) ---
const API_URL_PRODUTOS = '/api/produtos';
const API_URL_CHECKOUT = '/api/checkout';

const state = { produtos: [], carrinho: [] };

async function fetchProdutos() {
    try {
        const response = await fetch(API_URL_PRODUTOS);
        if (!response.ok) throw new Error('Falha ao buscar produtos');
        const data = await response.json();

        state.produtos = data.map(p => ({ ...p, preco: Number(p.preco) }));

        aplicarFiltros();
        renderizarSecaoCustomizada(state.produtos.filter(p => p.destaque), 'destaques-container');
        renderizarSecaoCustomizada(state.produtos.filter(p => p.novidade), 'novidades-container');
    } catch (error) {
        console.error("Erro:", error);
        document.getElementById('catalog-container').innerHTML = '<p>Não foi possível carregar os produtos no momento.</p>';
    }
}

// --- RENDERIZAÇÃO ---
function criarCardProduto(produto) {
    const preco = produto.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    return `
        <div class="product-card">
            <img src="${produto.img}" alt="${produto.nome}" class="product-img">
            <div class="product-info">
                <h4 class="product-name">${produto.nome}</h4>
                <p class="product-price">${preco}</p>
            </div>
            <button class="add-btn" onclick="adicionarAoCarrinho(${produto.id})">Comprar</button>
        </div>
    `;
}

function aplicarFiltros() {
    const tipo = document.getElementById('filter-type').value;
    const tam = document.getElementById('filter-size').value;

    const filtrados = state.produtos.filter(p =>
        (tipo === 'all' || p.tipo === tipo) && (tam === 'all' || p.tamanhos.includes(tam))
    );
    renderizarSecaoCustomizada(filtrados, 'catalog-container');
}

function renderizarSecaoCustomizada(produtos, containerId) {
    const container = document.getElementById(containerId);
    if (produtos.length === 0) {
        container.innerHTML = '<p>Nenhum produto encontrado.</p>';
        return;
    }

    const grid = document.createElement('div');
    grid.className = 'product-grid';
    grid.innerHTML = produtos.map(p => criarCardProduto(p)).join('');

    container.innerHTML = '';
    container.appendChild(grid);
}

// --- CARRINHO ---
function adicionarAoCarrinho(id) {
    const prod = state.produtos.find(p => p.id === id);
    if (prod) {
        state.carrinho.push({ ...prod, cartId: Date.now() });
        document.getElementById('cart-count').textContent = state.carrinho.length;

        const link = document.getElementById('carrinho-link');
        link.style.transform = 'scale(1.1)';
        setTimeout(() => link.style.transform = 'scale(1)', 200);
    }
}

function removerDoCarrinho(cartId) {
    state.carrinho = state.carrinho.filter(item => item.cartId !== cartId);
    document.getElementById('cart-count').textContent = state.carrinho.length;
    renderizarCarrinho();
}

function renderizarCarrinho() {
    const container = document.getElementById('cart-items');
    const totalEl = document.getElementById('cart-total-price');

    if (state.carrinho.length === 0) {
        container.innerHTML = '<p>Seu carrinho está vazio.</p>';
        totalEl.textContent = 'R$ 0,00';
        return;
    }

    let total = 0;
    const itensHtml = state.carrinho.map(item => {
        total += item.preco;
        const preco = item.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        return `
            <div class="cart-item">
                <div class="cart-item-info">
                    <h4>${item.nome}</h4>
                    <p>${preco}</p>
                </div>
                <button class="remove-btn" onclick="removerDoCarrinho(${item.cartId})">Remover</button>
            </div>
        `;
    }).join('');

    const dadosFormHtml = `
        <div class="checkout-form">
            <div class="form-group">
                <label for="input-nome">Nome:</label>
                <input type="text" id="input-nome" placeholder="Seu nome completo" value="${state.dadosCliente?.nome || ''}">
            </div>
            <div class="form-group">
                <label for="input-telefone">Telefone (WhatsApp):</label>
                <input type="tel" id="input-telefone" placeholder="(38) 99999-9999" value="${state.dadosCliente?.telefone || ''}">
            </div>
            <div class="form-group">
                <label for="input-endereco">Endereço de entrega:</label>
                <input type="text" id="input-endereco" placeholder="Rua, número, bairro, cidade" value="${state.dadosCliente?.endereco || ''}">
            </div>
        </div>
    `;

    container.innerHTML = itensHtml + dadosFormHtml;
    totalEl.textContent = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// --- CHECKOUT / PIX ---
document.getElementById('checkout-btn').addEventListener('click', async () => {
    if (state.carrinho.length === 0) return alert("Adicione itens ao carrinho!");

    const nome = document.getElementById('input-nome')?.value.trim();
    const telefone = document.getElementById('input-telefone')?.value.trim();
    const endereco = document.getElementById('input-endereco')?.value.trim();

    if (!nome || !telefone || !endereco) {
        alert("Preencha nome, telefone e endereço de entrega para continuar.");
        return;
    }

    state.dadosCliente = { nome, telefone, endereco };

    const btn = document.getElementById('checkout-btn');
    btn.textContent = "Gerando PIX...";
    btn.disabled = true;

    try {
        const payload = {
            itensIds: state.carrinho.map(item => item.id),
            nomeCliente: nome,
            telefoneCliente: telefone,
            enderecoEntrega: endereco
        };

        const response = await fetch(API_URL_CHECKOUT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const dadosPagamento = await response.json();

        if (!response.ok) {
            throw new Error(dadosPagamento.error || 'Erro ao gerar cobrança PIX');
        }

        exibirQrCodePix(dadosPagamento);

        state.carrinho = [];
        document.getElementById('cart-count').textContent = '0';

    } catch (error) {
        console.error(error);
        alert(error.message || "Erro ao processar pedido.");
    } finally {
        btn.textContent = "Finalizar via PIX";
        btn.disabled = false;
    }
});

function exibirQrCodePix({ numeroPedido, total, qrCode, qrCodeBase64 }) {
    const container = document.getElementById('cart-items');
    const totalFormatado = Number(total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    container.innerHTML = `
        <div class="pix-container">
            <h4>Pedido ${numeroPedido}</h4>
            <p>Escaneie o QR Code abaixo ou use o código "copia e cola" para pagar via PIX.</p>
            ${qrCodeBase64 ? `<img class="pix-qrcode" src="data:image/png;base64,${qrCodeBase64}" alt="QR Code PIX">` : ''}
            <p class="pix-total">${totalFormatado}</p>
            <textarea class="pix-copia-cola" readonly onclick="this.select()">${qrCode || ''}</textarea>
            <p class="pix-aviso">Assim que o pagamento for confirmado, você receberá a atualização do pedido.</p>
        </div>
    `;
    document.getElementById('cart-total-price').textContent = totalFormatado;
}

// Init
document.getElementById('filter-type').addEventListener('change', aplicarFiltros);
document.getElementById('filter-size').addEventListener('change', aplicarFiltros);
document.addEventListener('DOMContentLoaded', fetchProdutos);
