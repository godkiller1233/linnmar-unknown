import fs from 'node:fs';
import path from 'node:path';

for (const dir of ['data', 'uploads']) fs.mkdirSync(dir, { recursive: true });
if (!fs.existsSync('data/messages.json')) fs.writeFileSync('data/messages.json', '[]');
if (!fs.existsSync('data/users.json')) fs.writeFileSync('data/users.json', '[]');
if (!fs.existsSync('.env')) fs.copyFileSync('.env.example', '.env');
console.log('Setup complete. Edit .env before starting the server.');
