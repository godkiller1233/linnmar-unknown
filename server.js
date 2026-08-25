import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import { initStorage, loadState, saveState, closeStorage } from './storage.js';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const MAX_FILE_MB = Number(process.env.MAX_FILE_MB || 50);
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'unknown';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'CHANGE_ME_NOW';
const ADMIN_TAG = process.env.ADMIN_TAG || 'official';
const TERMS_VERSION = process.env.TERMS_VERSION || '1.0';
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

let messages = [];
let users = [];
let banned = new Set();
let acceptances = [];
const sessions = new Map();
const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;
const STORAGE_BUCKET = process.env.SUPABASE_BUCKET || 'linnmar-files';

const save = (name, value) => saveState(name.replace('.json', ''), value);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.get('/healthz', (req, res) => res.status(200).json({ ok: true, service: 'linnmar-unknown' }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024 }
});

const now = () => new Date().toISOString();
const safeUser = (u) => ({ username: u.username, tag: u.tag, avatar: u.avatar || null, createdAt: u.createdAt });
const recordAcceptance = (username, req) => {
  const entry = { id: randomUUID(), username, termsVersion: TERMS_VERSION, acceptedAt: now(), ip: req.ip, userAgent: req.get('user-agent') || null };
  acceptances.push(entry); acceptances = acceptances.slice(-10000); save('terms-acceptances.json', acceptances); return entry;
};
function requireSession(req, res, next) {
  const sid = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.sid;
  const session = sessions.get(sid);
  if (!session || banned.has(session.username)) return res.status(401).json({ error: 'Unauthorized' });
  req.user = session; next();
}
function requireAdmin(req, res, next) {
  if (!req.user || req.user.username !== ADMIN_USERNAME || req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

app.get('/api/config', (req, res) => res.json({ name: 'linnmar unknown', tag: ADMIN_TAG, termsVersion: TERMS_VERSION, termsUrl: '/terms.html', maxFileMB: MAX_FILE_MB, discordBridge: process.env.DISCORD_BRIDGE_ENABLED === 'true' }));
app.post('/api/auth/login', (req, res) => {
  const { username, password, accepted } = req.body || {};
  if (!accepted) return res.status(400).json({ error: 'You must affirmatively accept the Terms of Service to continue.' });
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });
  if (banned.has(username)) return res.status(403).json({ error: 'This account is banned.' });
  if (username === ADMIN_USERNAME) {
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Invalid login.' });
  } else {
    let user = users.find(x => x.username.toLowerCase() === username.toLowerCase());
    if (!user) {
      user = { username, tag: 'member', role: 'member', password, createdAt: now(), termsVersion: TERMS_VERSION }; 
      users.push(user); save('users.json', users);
    }
    if (user.password !== password) return res.status(401).json({ error: 'Invalid login.' });
  }
  const acceptance = recordAcceptance(username, req);
  const existingUser = users.find(x => x.username === username);
  if (existingUser) { existingUser.termsVersion = TERMS_VERSION; existingUser.termsAcceptedAt = acceptance.acceptedAt; save('users.json', users); }
  const role = username === ADMIN_USERNAME ? 'admin' : (existingUser?.role || 'member');
  const sessionId = randomUUID();
  const session = { sessionId, username, tag: username === ADMIN_USERNAME ? ADMIN_TAG : (existingUser?.tag || 'member'), role, termsVersion: TERMS_VERSION, termsAcceptedAt: acceptance.acceptedAt, createdAt: now() };
  sessions.set(sessionId, session);
  res.json({ token: sessionId, user: session });
});
app.get('/api/me', requireSession, (req, res) => res.json({ user: req.user }));
app.post('/api/auth/logout', requireSession, (req, res) => { sessions.delete(req.headers.authorization?.replace('Bearer ', '')); res.json({ ok: true }); });
app.get('/api/messages', requireSession, (req, res) => res.json(messages.slice(-300)));
app.post('/api/discord/incoming', (req, res) => {
  if (process.env.DISCORD_BRIDGE_SECRET && req.headers['x-bridge-secret'] !== process.env.DISCORD_BRIDGE_SECRET) return res.status(403).json({ error: 'Forbidden' });
  const { author, text, attachment } = req.body || {};
  if (!author || !String(text || '').trim()) return res.status(400).json({ error: 'Invalid message' });
  const msg = { id: randomUUID(), channel: 'general', text: String(text).slice(0, 4000), author: { username: `Discord: ${author}`, tag: 'discord' }, createdAt: now(), edited: false, replyTo: null, attachment: attachment || null, reactions: {} };
  messages.push(msg); messages = messages.slice(-5000); save('messages.json', messages); io.to('channel:general').emit('message:new', msg); res.json({ ok: true });
});

app.post('/api/files', requireSession, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  const objectPath = `${Date.now()}-${randomUUID()}-${safeName}`;
  try {
    let url;
    if (supabase) {
      const result = await supabase.storage.from(STORAGE_BUCKET).upload(objectPath, req.file.buffer, {
        contentType: req.file.mimetype || 'application/octet-stream',
        upsert: false
      });
      if (result.error) throw result.error;
      const publicResult = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath);
      url = publicResult.data.publicUrl;
    } else {
      const localPath = path.join(UPLOAD_DIR, objectPath);
      fs.writeFileSync(localPath, req.file.buffer);
      url = `/uploads/${objectPath}`;
    }
    const file = { id: randomUUID(), name: req.file.originalname, url, size: req.file.size, uploadedBy: req.user.username, createdAt: now() };
    res.json(file);
  } catch (error) {
    console.error('Upload failed:', error);
    res.status(500).json({ error: 'File storage is not configured or the upload failed.' });
  }
});

app.get('/api/admin/stats', requireSession, requireAdmin, (req, res) => {
  res.json({ users: users.length + 1, messages: messages.length, activeSessions: sessions.size, files: supabase ? null : fs.readdirSync(UPLOAD_DIR).length, banned: [...banned], termsVersion: TERMS_VERSION, acceptances: acceptances.length, storageMode: supabase ? 'supabase' : 'local', databaseMode: process.env.DATABASE_URL ? 'postgres' : 'local' });
});
app.post('/api/admin/ban', requireSession, requireAdmin, (req, res) => {
  const { username } = req.body || {};
  if (!username || username === ADMIN_USERNAME) return res.status(400).json({ error: 'Invalid username.' });
  banned.add(username); save('banned.json', [...banned]); io.emit('system:notice', { text: `${username} was banned by an administrator.` }); res.json({ ok: true });
});
app.post('/api/admin/unban', requireSession, requireAdmin, (req, res) => {
  const { username } = req.body || {}; banned.delete(username); save('banned.json', [...banned]); res.json({ ok: true });
});
app.delete('/api/admin/messages/:id', requireSession, requireAdmin, (req, res) => {
  const old = messages.length; messages = messages.filter(m => m.id !== req.params.id); save('messages.json', messages); if (messages.length !== old) io.emit('message:deleted', req.params.id); res.json({ ok: true });
});

io.on('connection', (socket) => {
  socket.on('auth', ({ token }) => {
    const session = sessions.get(token);
    if (!session || banned.has(session.username)) return socket.disconnect(true);
    socket.data.user = session;
    socket.join('channel:general');
    socket.emit('ready', { user: session, online: [...new Set([...io.sockets.sockets.values()].filter(s => s.data.user).map(s => s.data.user.username))] });
    socket.broadcast.emit('presence', { username: session.username, online: true });
  });
  socket.on('message:send', (payload) => {
    const user = socket.data.user; if (!user || banned.has(user.username)) return;
    const text = String(payload?.text || '').trim().slice(0, 4000); if (!text) return;
    const msg = { id: randomUUID(), channel: 'general', text, author: { username: user.username, tag: user.tag }, createdAt: now(), edited: false, replyTo: payload?.replyTo || null, attachment: payload?.attachment || null, reactions: {} };
    messages.push(msg); messages = messages.slice(-5000); save('messages.json', messages);
    io.to('channel:general').emit('message:new', msg);
    if (process.env.DISCORD_BRIDGE_ENABLED === 'true') {
      const outbox = path.join(DATA_DIR, 'discord-outbox.jsonl');
      fs.appendFileSync(outbox, JSON.stringify(msg) + '\n');
    }
  });
  socket.on('message:edit', ({ id, text }) => {
    const user = socket.data.user; const m = messages.find(x => x.id === id); if (!user || !m || (m.author.username !== user.username && user.role !== 'admin')) return;
    m.text = String(text || '').trim().slice(0, 4000); m.edited = true; m.editedAt = now(); save('messages.json', messages); io.to('channel:general').emit('message:updated', m);
  });
  socket.on('message:delete', ({ id }) => {
    const user = socket.data.user; const m = messages.find(x => x.id === id); if (!user || !m || (m.author.username !== user.username && user.role !== 'admin')) return;
    messages = messages.filter(x => x.id !== id); save('messages.json', messages); io.to('channel:general').emit('message:deleted', id);
  });
  socket.on('typing', () => { if (socket.data.user) socket.broadcast.to('channel:general').emit('typing', { username: socket.data.user.username }); });
  socket.on('react', ({ id, emoji }) => {
    const user = socket.data.user; const m = messages.find(x => x.id === id); if (!user || !m || !emoji) return;
    m.reactions ||= {}; m.reactions[emoji] ||= []; const arr = m.reactions[emoji]; const i = arr.indexOf(user.username); if (i >= 0) arr.splice(i, 1); else arr.push(user.username); save('messages.json', messages); io.to('channel:general').emit('message:updated', m);
  });
  socket.on('voice:join', ({ room = 'Lobby' }) => { if (!socket.data.user) return; socket.join(`voice:${room}`); socket.data.voiceRoom = room; socket.to(`voice:${room}`).emit('voice:peer-joined', { socketId: socket.id, username: socket.data.user.username }); const peers = [...(io.sockets.adapter.rooms.get(`voice:${room}`) || [])].filter(id => id !== socket.id); socket.emit('voice:peers', peers); });
  socket.on('voice:offer', ({ to, offer }) => socket.to(to).emit('voice:offer', { from: socket.id, offer, username: socket.data.user?.username }));
  socket.on('voice:answer', ({ to, answer }) => socket.to(to).emit('voice:answer', { from: socket.id, answer }));
  socket.on('voice:ice', ({ to, candidate }) => socket.to(to).emit('voice:ice', { from: socket.id, candidate }));
  socket.on('disconnect', () => { if (socket.data.user) socket.broadcast.emit('presence', { username: socket.data.user.username, online: false }); if (socket.data.voiceRoom) socket.to(`voice:${socket.data.voiceRoom}`).emit('voice:peer-left', { socketId: socket.id }); });
});

await initStorage();
messages = await loadState('messages', []);
users = await loadState('users', []);
banned = new Set(await loadState('banned', []));
acceptances = await loadState('terms-acceptances', []);

server.listen(PORT, '0.0.0.0', () => console.log(`Linnmar Unknown running on port ${PORT}`));

process.on('SIGTERM', async () => {
  await closeStorage();
  process.exit(0);
});

