// admin.js — dashboard de gerenciamento de produtos

const API_LOGIN = '/api/admin/login';
const API_LOGOUT = '/api/admin/logout';
const API_PRODUTOS_ADMIN = '/api/admin/produtos';

const loginScreen = document.getElementById('login-screen');
const adminPanel = document.getElementById('admin-panel');
const loginForm = document.getElementById('login-form');
const loginErro = document.getElementById('login-erro');

const produtoOverlay = document.getElementById('produto-overlay');
const produtoModal = document.getElementById('produto-modal');
const produtoForm = document.getElementById('produto-form');
const produtoErro = document.getElementById('produto-erro');

let produtosCache = [];

// --- LOGIN ---
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginErro.textContent = '';

    const email = document.getElementById('login-email').value;
    const senha = document.getElementById('login-senha').value;

    try {
        const resp = await fetch(API_LOGIN, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, senha })
        });
        const dados = await resp.json();

        if (!resp.ok) {
            loginErro.textContent = dados.error || 'Erro ao entrar';
            return;
        }

        mostrarPainel();
    } catch (error) {
        loginErro.textContent = 'Erro de conexão';
    }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch(API_LOGOUT, { method: 'POST' });
    loginScreen.style.display = 'flex';
    adminPanel.style.display = 'none';
});

function mostrarPainel() {
    loginScreen.style.display = 'none';
    adminPanel.style.display = 'block';
    carregarProdutos();
}

// --- LISTAGEM ---
async function carregarProdutos() {
    try {
        const resp = await fetch(API_PRODUTOS_ADMIN);
        if (resp.status === 401) {
            // sessão expirou
            loginScreen.style.display = 'flex';
            adminPanel.style.display = 'none';
            return;
        }
        produtosCache = await resp.json();
        renderizarTabela();
    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
    }
}

function renderizarTabela() {
    const tbody = document.getElementById('admin-produtos-tbody');
    tbody.innerHTML = produtosCache.map(p => `
        <tr>
            <td>${p.nome}</td>
            <td>${p.tipo}</td>
            <td>${Number(p.preco).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
            <td>${(p.tamanhos || []).join(', ')}</td>
            <td>${p.estoque_total}</td>
            <td>${p.destaque ? 'Sim' : 'Não'}</td>
            <td>${p.novidade ? 'Sim' : 'Não'}</td>
            <td>
                <button class="admin-acoes-btn admin-editar-btn" onclick="abrirModalEdicao(${p.id})">Editar</button>
                <button class="admin-acoes-btn admin-remover-btn" onclick="removerProduto(${p.id})">Remover</button>
            </td>
        </tr>
    `).join('');
}

// --- MODAL CRIAR/EDITAR ---
document.getElementById('novo-produto-btn').addEventListener('click', () => abrirModalCriacao());
document.getElementById('fechar-modal-btn').addEventListener('click', fecharModal);
produtoOverlay.addEventListener('click', fecharModal);

function abrirModalCriacao() {
    produtoForm.reset();
    document.getElementById('produto-id').value = '';
    document.getElementById('produto-modal-titulo').textContent = 'Novo Produto';
    produtoErro.textContent = '';
    abrirModal();
}

function abrirModalEdicao(id) {
    const produto = produtosCache.find(p => p.id === id);
    if (!produto) return;

    document.getElementById('produto-id').value = produto.id;
    document.getElementById('produto-nome').value = produto.nome;
    document.getElementById('produto-tipo').value = produto.tipo;
    document.getElementById('produto-preco').value = produto.preco;
    document.getElementById('produto-tamanhos').value = (produto.tamanhos || []).join(',');
    document.getElementById('produto-estoque').value = produto.estoque_total;
    document.getElementById('produto-img').value = produto.img || '';
    document.getElementById('produto-destaque').checked = !!produto.destaque;
    document.getElementById('produto-novidade').checked = !!produto.novidade;

    document.getElementById('produto-modal-titulo').textContent = 'Editar Produto';
    produtoErro.textContent = '';
    abrirModal();
}

function abrirModal() {
    produtoOverlay.classList.add('active');
    produtoModal.classList.add('open');
}
function fecharModal() {
    produtoOverlay.classList.remove('active');
    produtoModal.classList.remove('open');
}

produtoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    produtoErro.textContent = '';

    const id = document.getElementById('produto-id').value;
    const payload = {
        nome: document.getElementById('produto-nome').value,
        tipo: document.getElementById('produto-tipo').value,
        preco: parseFloat(document.getElementById('produto-preco').value),
        tamanhos: document.getElementById('produto-tamanhos').value.split(',').map(t => t.trim()).filter(Boolean),
        estoque_total: parseInt(document.getElementById('produto-estoque').value, 10),
        img: document.getElementById('produto-img').value,
        destaque: document.getElementById('produto-destaque').checked,
        novidade: document.getElementById('produto-novidade').checked,
    };

    try {
        const resp = await fetch(API_PRODUTOS_ADMIN, {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(id ? { ...payload, id: Number(id) } : payload)
        });
        const dados = await resp.json();

        if (!resp.ok) {
            produtoErro.textContent = dados.error || 'Erro ao salvar produto';
            return;
        }

        fecharModal();
        carregarProdutos();
    } catch (error) {
        produtoErro.textContent = 'Erro de conexão';
    }
});

async function removerProduto(id) {
    if (!confirm('Tem certeza que deseja remover este produto?')) return;

    try {
        const resp = await fetch(`${API_PRODUTOS_ADMIN}?id=${id}`, { method: 'DELETE' });
        if (!resp.ok) {
            const dados = await resp.json();
            alert(dados.error || 'Erro ao remover produto');
            return;
        }
        carregarProdutos();
    } catch (error) {
        alert('Erro de conexão');
    }
}

// Ao carregar a página, tenta buscar produtos — se a sessão for válida,
// o backend responde 200 e já mostramos o painel; se não, mostra login.
(async function init() {
    const resp = await fetch(API_PRODUTOS_ADMIN);
    if (resp.ok) {
        mostrarPainel();
    }
})();
