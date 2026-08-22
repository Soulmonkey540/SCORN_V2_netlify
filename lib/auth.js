// lib/auth.js
// Sessão simples de admin usando JWT em cookie httpOnly.
// Adaptado pro formato do Netlify Functions, que passa um objeto "event"
// (em vez do "request" do Node/Vercel).

const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'scorn_admin_session';
const SEGREDO = process.env.SESSION_SECRET;

function criarTokenSessao(admin) {
    return jwt.sign(
        { adminId: admin.id, email: admin.email },
        SEGREDO,
        { expiresIn: '12h' }
    );
}

function cookieDeLogin(token) {
    return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200`;
}

function cookieDeLogout() {
    return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

function lerCookie(event, nome) {
    const raw = (event.headers && (event.headers.cookie || event.headers.Cookie)) || '';
    const partes = raw.split(';').map(p => p.trim());
    for (const parte of partes) {
        const [chave, ...resto] = parte.split('=');
        if (chave === nome) return resto.join('=');
    }
    return null;
}

// Valida a sessão a partir do "event" do Netlify Functions.
function exigirSessaoAdmin(event) {
    const token = lerCookie(event, COOKIE_NAME);
    if (!token) {
        const erro = new Error('Não autenticado');
        erro.status = 401;
        throw erro;
    }
    try {
        return jwt.verify(token, SEGREDO);
    } catch (e) {
        const erro = new Error('Sessão inválida ou expirada');
        erro.status = 401;
        throw erro;
    }
}

module.exports = {
    criarTokenSessao,
    cookieDeLogin,
    cookieDeLogout,
    exigirSessaoAdmin,
};
