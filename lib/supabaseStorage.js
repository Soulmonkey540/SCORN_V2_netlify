// lib/supabaseStorage.js
// Upload de arquivos para o Supabase Storage, usando a chave de serviço
// (que tem permissão total — NUNCA exponha essa chave no navegador/front-end,
// ela só é usada aqui, no backend).

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const NOME_BUCKET = 'produtos-imagens';

async function uploadImagem(buffer, nomeArquivoOriginal, contentType) {
    const extensao = (nomeArquivoOriginal.split('.').pop() || 'jpg').toLowerCase();
    const nomeUnico = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensao}`;

    const { error } = await supabase.storage
        .from(NOME_BUCKET)
        .upload(nomeUnico, buffer, { contentType, upsert: false });

    if (error) {
        throw new Error(`Erro ao enviar para o Supabase Storage: ${error.message}`);
    }

    const { data } = supabase.storage.from(NOME_BUCKET).getPublicUrl(nomeUnico);
    return data.publicUrl;
}

module.exports = { uploadImagem };
