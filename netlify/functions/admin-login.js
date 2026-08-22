// netlify/functions/admin-login.js
const { sql } = require('../../lib/db');
const bcrypt = require('bcryptjs');
const { criarTokenSessao, cookieDeLogin } = require('../../lib/auth');

exports.handler = async function (event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido' }) };
    }

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch {
        return { statusCode: 400, body: JSON.stringify({ error: 'Corpo da requisição inválido' }) };
    }

    const { email, senha } = body;
    if (!email || !senha) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Informe email e senha' }) };
    }

    try {
        const resultado = await sql`SELECT * FROM admins WHERE email = ${email};`;
        const admin = resultado.rows[0];

        if (!admin) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Credenciais inválidas' }) };
        }

        const senhaOk = await bcrypt.compare(senha, admin.senha_hash);
        if (!senhaOk) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Credenciais inválidas' }) };
        }

        const token = criarTokenSessao(admin);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Set-Cookie': cookieDeLogin(token),
            },
            body: JSON.stringify({ ok: true, email: admin.email }),
        };

    } catch (error) {
        console.error('Erro no login:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Erro ao fazer login' }) };
    }
};
