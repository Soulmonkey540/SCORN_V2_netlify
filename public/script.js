// public/script.js — lógica da loja (catálogo, filtros, carrinho, frete e checkout PIX)

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
const API_URL_FRETE = '/api/calcular-frete';

const state = { produtos: [], carrinho: [], freteSelecionado: null };

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
        resetarFrete();

        const link = document.getElementById('carrinho-link');
        link.style.transform = 'scale(1.1)';
        setTimeout(() => link.style.transform = 'scale(1)', 200);
    }
}

function removerDoCarrinho(cartId) {
    state.carrinho = state.carrinho.filter(item => item.cartId !== cartId);
    document.getElementById('cart-count').textContent = state.carrinho.length;
    resetarFrete();
    renderizarCarrinho();
}

function resetarFrete() {
    state.freteSelecionado = null;
    const resultadoEl = document.getElementById('frete-resultado');
    if (resultadoEl) resultadoEl.innerHTML = '';
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

    if (state.freteSelecionado) {
        total += Object.values(state.freteSelecionado).reduce((soma, valor) => soma + valor, 0);
    }

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

// --- FRETE (SuperFrete) ---
document.getElementById('calcular-frete-btn').addEventListener('click', calcularFrete);

async function calcularFrete() {
    const resultadoEl = document.getElementById('frete-resultado');
    const cep = document.getElementById('input-cep-frete').value.replace(/\D/g, '');

    if (state.carrinho.length === 0) {
        resultadoEl.innerHTML = '<p class="frete-indisponivel">Adicione itens ao carrinho primeiro.</p>';
        return;
    }
    if (cep.length !== 8) {
        resultadoEl.innerHTML = '<p class="frete-indisponivel">Informe um CEP válido.</p>';
        return;
    }

    resultadoEl.innerHTML = '<p>Calculando frete...</p>';

    try {
        const itens = state.carrinho.map(item => ({
            colecao: item.colecao,
            peso_kg: item.peso_kg,
            preco: item.preco,
            quantidade: 1,
        }));

        const resposta = await fetch(API_URL_FRETE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cepDestino: cep, itens })
        });
        const dados = await resposta.json();

        if (!resposta.ok) {
            resultadoEl.innerHTML = `<p class="frete-indisponivel">${dados.error || 'Erro ao calcular frete'}</p>`;
            return;
        }

        renderizarFrete(dados.fretes);
    } catch (error) {
        console.error('Erro ao calcular frete:', error);
        resultadoEl.innerHTML = '<p class="frete-indisponivel">Erro de conexão ao calcular frete.</p>';
    }
}

function renderizarFrete(fretes) {
    const resultadoEl = document.getElementById('frete-resultado');
    state.freteSelecionado = {};

    const nomeColecao = (colecao) => colecao === 'frosty' ? 'Frosty' : colecao === 'sakami' ? 'Sakami' : colecao;

    const blocosHtml = fretes.map(frete => {
        if (!frete.disponivel) {
            return `<p class="frete-indisponivel">${nomeColecao(frete.colecao)}: ${frete.motivo}</p>`;
        }
        if (frete.opcoes.length === 0) {
            return `<p class="frete-indisponivel">${nomeColecao(frete.colecao)}: nenhuma opção de frete pra esse CEP.</p>`;
        }

        // Usa a opção mais barata de cada coleção pra compor o total exibido.
        state.freteSelecionado[frete.colecao] = frete.opcoes[0].preco;

        const opcoesHtml = frete.opcoes.map(op => {
            const preco = op.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            return `<li>${op.servico}${op.transportadora ? ' — ' + op.transportadora : ''} — ${preco} (${op.prazoDias} dias úteis)</li>`;
        }).join('');

        return `
            <div class="frete-colecao">
                <p class="frete-colecao-titulo">${nomeColecao(frete.colecao)}</p>
                <ul>${opcoesHtml}</ul>
            </div>
        `;
    }).join('');

    resultadoEl.innerHTML = blocosHtml;
    renderizarCarrinho();
}

// --- CHECKOUT / PIX ---
document.getElementById('checkout-btn').addEventListener('click', async () => {
    if (state.carrinho.length === 0) return alert("Adicione itens ao carrinho!");

    const nome = document.getElementById('input-nome')?.value.trim();
    const telefone = document.getElementById('input-telefone')?.value.trim();
    const endereco = document.getElementById('input-endereco')?.value.trim();
    const cep = document.getElementById('input-cep-frete')?.value.replace(/\D/g, '');

    if (!nome || !telefone || !endereco) {
        alert("Preencha nome, telefone e endereço de entrega para continuar.");
        return;
    }
    if (!cep || cep.length !== 8) {
        alert("Calcule o frete (informe um CEP válido) antes de finalizar.");
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
            enderecoEntrega: endereco,
            cepDestino: cep,
        };

        const response = await fetch(API_URL_CHECKOUT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const dados = await response.json();

        if (!response.ok) {
            throw new Error(dados.error || 'Erro ao gerar cobrança PIX');
        }

        // O carrinho pode virar mais de um pedido/PIX (um por coleção,
        // se o carrinho tiver Frosty e Sakami juntos).
        exibirQrCodePix(dados.pedidos);

        state.carrinho = [];
        state.freteSelecionado = null;
        document.getElementById('cart-count').textContent = '0';

    } catch (error) {
        console.error(error);
        alert(error.message || "Erro ao processar pedido.");
    } finally {
        btn.textContent = "Finalizar via PIX";
        btn.disabled = false;
    }
});

const NOME_COLECAO = { frosty: 'Frosty', sakami: 'Sakami' };

function exibirQrCodePix(pedidos) {
    const container = document.getElementById('cart-items');
    const totalGeral = pedidos.reduce((soma, p) => soma + p.total, 0);
    const totalFormatado = totalGeral.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const maisDeUmPedido = pedidos.length > 1;

    const blocosHtml = pedidos.map(pedido => {
        const totalPedido = Number(pedido.total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const freteFormatado = Number(pedido.frete).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const tituloColecao = maisDeUmPedido ? ` — ${NOME_COLECAO[pedido.colecao] || pedido.colecao}` : '';

        return `
            <div class="pix-container">
                <h4>Pedido ${pedido.numeroPedido}${tituloColecao}</h4>
                <p>Escaneie o QR Code abaixo ou use o código "copia e cola" para pagar via PIX.</p>
                ${pedido.qrCodeBase64 ? `<img class="pix-qrcode" src="data:image/png;base64,${pedido.qrCodeBase64}" alt="QR Code PIX">` : ''}
                <p class="pix-total">${totalPedido}</p>
                <p class="pix-frete-info">inclui ${freteFormatado} de frete</p>
                <textarea class="pix-copia-cola" readonly onclick="this.select()">${pedido.qrCode || ''}</textarea>
            </div>
        `;
    }).join('<hr class="pix-divisor">');

    const avisoFinal = maisDeUmPedido
        ? '<p class="pix-aviso">Seu carrinho teve itens de mais de uma coleção, por isso foram gerados PIX separados — assim que cada pagamento for confirmado, você receberá a atualização daquele pedido.</p>'
        : '<p class="pix-aviso">Assim que o pagamento for confirmado, você receberá a atualização do pedido.</p>';

    container.innerHTML = blocosHtml + avisoFinal;
    document.getElementById('cart-total-price').textContent = totalFormatado;
}

// Init
document.getElementById('filter-type').addEventListener('change', aplicarFiltros);
document.getElementById('filter-size').addEventListener('change', aplicarFiltros);
document.addEventListener('DOMContentLoaded', fetchProdutos);
