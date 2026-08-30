/**
 * Creates server/.env from the template on first run and fills in strong JWT
 * secrets, so a fresh clone boots with `npm run setup` and nothing else.
 * Existing .env files are left untouched.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, 'server', '.env');
const templatePath = path.join(root, 'server', '.env.example');

if (fs.existsSync(envPath)) {
  console.log('server/.env already exists — leaving it alone.');
  process.exit(0);
}

if (!fs.existsSync(templatePath)) {
  console.error('server/.env.example is missing; cannot bootstrap.');
  process.exit(1);
}

const secret = () => crypto.randomBytes(48).toString('hex');
const contents = fs
  .readFileSync(templatePath, 'utf8')
  .replace('replace_me_access_secret', secret())
  .replace('replace_me_refresh_secret', secret());

fs.writeFileSync(envPath, contents);
console.log('Created server/.env with freshly generated JWT secrets.');
console.log('Add your Razorpay and Shiprocket credentials there when you are ready to go live.');
