// Redefine a senha de uma conta.
// Uso: npm run reset-password -- email@exemplo.com novaSenha
import bcrypt from 'bcryptjs';
import { closeDb, db } from '../server/db.js';

const [email, password] = process.argv.slice(2);
if (!email || !password || password.length < 8) {
  console.log('Uso: npm run reset-password -- email@exemplo.com novaSenha  (mínimo 8 caracteres)');
  process.exit(1);
}

const { changes } = await db.run('UPDATE users SET password_hash = ? WHERE email = ?', [
  await bcrypt.hash(password, 10),
  email.trim().toLowerCase(),
]);

console.log(changes ? `Senha de ${email} alterada.` : `Nenhuma conta encontrada com o e-mail ${email}.`);
await closeDb();
