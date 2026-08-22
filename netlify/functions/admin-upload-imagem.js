// netlify/functions/admin-upload-imagem.js
// Recebe uma imagem em base64 (já comprimida no navegador) e sobe pro
// Supabase Storage, retornando a URL pública gerada.

const { exigirSessaoAdmin } = require('../../lib/auth');
const { uploadImagem } = require('../../lib/supabaseStorage');

exports.handler = async function (event) {
    try {
        exigirSessaoAdmin(event);
    } catch (erro) {
        return { statusCode: erro.status || 401, body: JSON.stringify({ error: erro.message }) };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido' }) };
    }

    try {
        const { fileName, contentType, fileBase64 } = JSON.parse(event.body || '{}');

        if (!fileName || !contentType || !fileBase64) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Arquivo incompleto' }) };
        }

        const buffer = Buffer.from(fileBase64, 'base64');

        // Limite de segurança extra (mesmo já comprimindo no navegador)
        const TAMANHO_MAXIMO = 5 * 1024 * 1024; // 5MB
        if (buffer.length > TAMANHO_MAXIMO) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Imagem muito grande (máximo 5MB após compressão)' }) };
        }

        const url = await uploadImagem(buffer, fileName, contentType);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
        };

    } catch (error) {
        console.error('Erro no upload de imagem:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Erro ao enviar imagem' }) };
    }
};
