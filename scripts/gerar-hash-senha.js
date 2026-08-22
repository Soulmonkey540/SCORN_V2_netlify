// Script local para gerar o hash de senha do admin.
// Rode assim no seu terminal (não precisa subir isso pro Vercel):
//
//   node scripts/gerar-hash-senha.js "minhaSenhaForte123"
//
// Copie o hash gerado e use no INSERT da tabela `admins` (veja README-SETUP.md).

const bcrypt = require('bcryptjs');

const senha = process.argv[2];

if (!senha) {
    console.log('Uso: node scripts/gerar-hash-senha.js "suaSenha"');
    process.exit(1);
}

const hash = bcrypt.hashSync(senha, 10);
console.log('\nHash gerado (copie este valor):\n');
console.log(hash);
console.log('');
