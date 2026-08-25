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
let bans = new Map();
let acceptances = [];
let serverSettings = { serverName: 'linnmar unknown', serverTag: ADMIN_TAG, accentColor: '#5865f2', backgroundColor: '#202225', announcement: '', discordEnabled: process.env.DISCORD_BRIDGE_ENABLED === 'true', discordGuildId: process.env.DISCORD_GUILD_ID || '', discordChannelId: process.env.DISCORD_CHANNEL_ID || '' };
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
const validColor = c => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c : null;
const getToken = req => req.headers.authorization?.replace('Bearer ', '') || req.cookies?.sid;
const findUser = username => users.find(x => x.username.toLowerCase() === String(username).toLowerCase());
const safeUser = (u) => ({ username: u.username, tag: u.tag || 'member', role: u.role || 'member', avatar: u.avatar || null, backgroundImage: u.backgroundImage || null, displayName: u.displayName || u.username, bio: u.bio || '', status: u.status || 'online', accentColor: u.accentColor || '#5865f2', backgroundColor: u.backgroundColor || '#202225', createdAt: u.createdAt, termsAcceptedAt: u.termsAcceptedAt || null });
const persistUser = user => { const i = users.findIndex(x => x.username === user.username); if(i>=0) users[i]=user; else users.push(user); save('users.json', users); };
const isBanned = username => { const b=bans.get(username); if(!b) return false; if(b.expiresAt && new Date(b.expiresAt)<=new Date()){ bans.delete(username); save('banned.json',[...bans.values()]); return false;} return true; };
const forceLogout = username => { for(const [id,session] of sessions) if(session.username===username) sessions.delete(id); io.emit('session:revoked',{username}); };
const sanitizeFilename = name => String(name).replace(/[^a-zA-Z0-9._-]/g,'_');
async function storeBuffer(buffer, originalName, mimetype='application/octet-stream') { const objectPath=`${Date.now()}-${randomUUID()}-${sanitizeFilename(originalName)}`; if(supabase){ const result=await supabase.storage.from(STORAGE_BUCKET).upload(objectPath,buffer,{contentType:mimetype,upsert:false}); if(result.error) throw result.error; return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath).data.publicUrl; } const localPath=path.join(UPLOAD_DIR,objectPath); fs.writeFileSync(localPath,buffer); return `/uploads/${objectPath}`; }
const recordAcceptance = (username, req) => {
  const entry = { id: randomUUID(), username, termsVersion: TERMS_VERSION, acceptedAt: now(), ip: req.ip, userAgent: req.get('user-agent') || null };
  acceptances.push(entry); acceptances = acceptances.slice(-10000); save('terms-acceptances.json', acceptances); return entry;
};
function requireSession(req, res, next) {
  const sid = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.sid;
  const session = sessions.get(sid);
  if (!session || isBanned(session.username)) return res.status(401).json({ error: 'Unauthorized' });
  req.user = session; next();
}
function requireAdmin(req, res, next) {
  if (!req.user || req.user.username !== ADMIN_USERNAME || req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

app.get('/api/config', (req, res) => res.json({ name: serverSettings.serverName, tag: serverSettings.serverTag, termsVersion: TERMS_VERSION, termsUrl: '/terms.html', maxFileMB: MAX_FILE_MB, discordBridge: serverSettings.discordEnabled }));
app.post('/api/auth/login', (req, res) => {
  const { username, password, accepted } = req.body || {};
  if (!accepted) return res.status(400).json({ error: 'You must affirmatively accept the Terms of Service to continue.' });
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });
  if (isBanned(username)) return res.status(403).json({ error: 'This account is banned.' });
  if (username === ADMIN_USERNAME) {
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Invalid login.' });
  } else {
    let user = users.find(x => x.username.toLowerCase() === username.toLowerCase());
    if (!user) {
      user = { username, tag: 'member', role: 'member', password, createdAt: now(), termsVersion: TERMS_VERSION, accentColor:'#5865f2', backgroundColor:'#202225', displayName:username, bio:'', status:'online', avatar:null, backgroundImage:null }; 
      users.push(user); save('users.json', users);
    }
    if (user.password !== password) return res.status(401).json({ error: 'Invalid login.' });
  }
  const acceptance = recordAcceptance(username, req);
  const existingUser = users.find(x => x.username === username);
  if (existingUser) { existingUser.termsVersion = TERMS_VERSION; existingUser.termsAcceptedAt = acceptance.acceptedAt; save('users.json', users); }
  const role = username === ADMIN_USERNAME ? 'admin' : (existingUser?.role || 'member');
  if(username === ADMIN_USERNAME) {
    const admin = findUser(ADMIN_USERNAME) || { username: ADMIN_USERNAME, tag: ADMIN_TAG, role:'admin', password: ADMIN_PASSWORD, createdAt: now(), displayName:ADMIN_USERNAME, bio:'', status:'online', accentColor:'#5865f2', backgroundColor:'#202225', avatar:null, backgroundImage:null };
    admin.tag=ADMIN_TAG; admin.role='admin'; admin.password=ADMIN_PASSWORD; persistUser(admin);
  }
  const sessionId = randomUUID();
  const session = { sessionId, username, tag: username === ADMIN_USERNAME ? ADMIN_TAG : (existingUser?.tag || 'member'), role, termsVersion: TERMS_VERSION, termsAcceptedAt: acceptance.acceptedAt, createdAt: now() };
  sessions.set(sessionId, session);
  res.json({ token: sessionId, user: session });
});
app.get('/api/me', requireSession, (req, res) => { const u=findUser(req.user.username); res.json({ user: { ...req.user, ...(u ? safeUser(u) : {}) } }); });
app.get('/api/users', requireSession, (req,res)=>res.json(users.map(safeUser).concat([{username:ADMIN_USERNAME,tag:ADMIN_TAG,role:'admin',displayName:ADMIN_USERNAME,accentColor:'#5865f2',backgroundColor:'#202225',avatar:null,backgroundImage:null}].filter(x=>!users.some(u=>u.username===x.username)))));
app.post('/api/auth/logout', requireSession, (req, res) => { sessions.delete(getToken(req)); res.json({ ok: true }); });
app.get('/api/messages', requireSession, (req, res) => res.json(messages.slice(-300)));
app.post('/api/discord/incoming', (req, res) => {
  if (process.env.DISCORD_BRIDGE_SECRET && req.headers['x-bridge-secret'] !== process.env.DISCORD_BRIDGE_SECRET) return res.status(403).json({ error: 'Forbidden' });
  const { author, text, attachment } = req.body || {};
  if (!author || !String(text || '').trim()) return res.status(400).json({ error: 'Invalid message' });
  const msg = { id: randomUUID(), channel: 'general', text: String(text).slice(0, 4000), author: { username: `Discord: ${author}`, tag: 'discord' }, createdAt: now(), edited: false, replyTo: null, attachment: attachment || null, reactions: {} };
  messages.push(msg); messages = messages.slice(-5000); save('messages.json', messages); io.to('channel:general').emit('message:new', msg); res.json({ ok: true });
});

app.post('/api/files', requireSession, upload.single('file'), async (req,res)=>{
  if(!req.file) return res.status(400).json({error:'No file uploaded.'});
  try { const url=await storeBuffer(req.file.buffer,req.file.originalname,req.file.mimetype); res.json({id:randomUUID(),name:req.file.originalname,url,size:req.file.size,uploadedBy:req.user.username,createdAt:now()}); }
  catch(e){ console.error('Upload failed:',e); res.status(500).json({error:'File storage is not configured or the upload failed.'}); }
});

app.get('/api/profile', requireSession, (req,res)=>{ const u=findUser(req.user.username); if(!u) return res.status(404).json({error:'Profile not found.'}); res.json(safeUser(u)); });
app.put('/api/profile', requireSession, (req,res)=>{ const u=findUser(req.user.username); if(!u) return res.status(404).json({error:'Profile not found.'}); const {displayName,bio,accentColor,backgroundColor,status}=req.body||{}; u.displayName=String(displayName||u.username).trim().slice(0,40)||u.username; u.bio=String(bio||'').trim().slice(0,240); if(validColor(accentColor))u.accentColor=accentColor; if(validColor(backgroundColor))u.backgroundColor=backgroundColor; if(['online','idle','dnd','invisible'].includes(status))u.status=status; persistUser(u); const updated=safeUser(u); io.emit('profile:updated',updated); res.json(updated); });
app.post('/api/profile/avatar', requireSession, upload.single('image'), async (req,res)=>{ const u=findUser(req.user.username); if(!req.file||!/^image\//.test(req.file.mimetype)) return res.status(400).json({error:'Please select an image.'}); try{u.avatar=await storeBuffer(req.file.buffer,`avatar-${u.username}-${req.file.originalname}`,req.file.mimetype); persistUser(u); const updated=safeUser(u); io.emit('profile:updated',updated); res.json(updated);}catch(e){res.status(500).json({error:'Profile image upload failed.'});} });
app.post('/api/profile/background', requireSession, upload.single('image'), async (req,res)=>{ const u=findUser(req.user.username); if(!req.file||!/^image\//.test(req.file.mimetype)) return res.status(400).json({error:'Please select an image.'}); try{u.backgroundImage=await storeBuffer(req.file.buffer,`background-${u.username}-${req.file.originalname}`,req.file.mimetype); persistUser(u); const updated=safeUser(u); io.emit('profile:updated',updated); res.json(updated);}catch(e){res.status(500).json({error:'Profile background upload failed.'});} });

app.get('/api/admin/stats', requireSession, requireAdmin, (req,res)=>res.json({users:users.length,messages:messages.length,activeSessions:sessions.size,files:supabase?null:fs.readdirSync(UPLOAD_DIR).length,banned:[...bans.values()],termsVersion:TERMS_VERSION,acceptances:acceptances.length,storageMode:supabase?'supabase':'local',databaseMode:process.env.DATABASE_URL?'postgres':'local'}));
app.get('/api/admin/dashboard', requireSession, requireAdmin, (req,res)=>res.json({ stats:{users:users.length,messages:messages.length,activeSessions:sessions.size,files:supabase?null:fs.readdirSync(UPLOAD_DIR).length,banned:[...bans.values()].filter(b=>!b.expiresAt||new Date(b.expiresAt)>new Date()).length,termsVersion:TERMS_VERSION,acceptances:acceptances.length}, bans:[...bans.values()].filter(b=>!b.expiresAt||new Date(b.expiresAt)>new Date()), users:users.map(u=>({...safeUser(u),banned:isBanned(u.username)})), settings:{...serverSettings,botTokenSet:Boolean(process.env.DISCORD_BOT_TOKEN),bridgeSecretSet:Boolean(process.env.DISCORD_BRIDGE_SECRET)} }));
app.get('/api/admin/discord', requireSession, requireAdmin, (req,res)=>res.json({botTokenSet:Boolean(process.env.DISCORD_BOT_TOKEN),guildId:serverSettings.discordGuildId||process.env.DISCORD_GUILD_ID||'',channelId:serverSettings.discordChannelId||process.env.DISCORD_CHANNEL_ID||'',bridgeEnabled:Boolean(serverSettings.discordEnabled),bridgeSecretSet:Boolean(process.env.DISCORD_BRIDGE_SECRET)}));
function safeEnvWrite(entries){ try { const envPath=path.join(__dirname,'.env'); let lines=fs.existsSync(envPath)?fs.readFileSync(envPath,'utf8').split(/\r?\n/):[]; for(const [k,v] of Object.entries(entries)){ const line=`${k}=${String(v??'').replace(/\r?\n/g,'')}`; const i=lines.findIndex(x=>x.startsWith(`${k}=`)); if(i>=0)lines[i]=line;else lines.push(line); process.env[k]=String(v??''); } fs.writeFileSync(envPath,lines.filter(Boolean).join('\n')+'\n'); } catch(e){ console.warn('Environment file is not writable; keeping settings in server state.',e.message); } }
app.put('/api/admin/settings', requireSession, requireAdmin, (req,res)=>{const {serverName,serverTag,accentColor,backgroundColor,announcement}=req.body||{}; if(serverName)serverSettings.serverName=String(serverName).trim().slice(0,60);if(serverTag)serverSettings.serverTag=String(serverTag).trim().slice(0,30);if(validColor(accentColor))serverSettings.accentColor=accentColor;if(validColor(backgroundColor))serverSettings.backgroundColor=backgroundColor;serverSettings.announcement=String(announcement||'').slice(0,500);save('server-settings.json',serverSettings);io.emit('server:settings',serverSettings);res.json({ok:true,settings:serverSettings});});
app.put('/api/admin/discord', requireSession, requireAdmin, (req,res)=>{const {botToken,guildId,channelId,enabled,bridgeSecret}=req.body||{}; if(botToken)process.env.DISCORD_BOT_TOKEN=String(botToken); if(bridgeSecret)process.env.DISCORD_BRIDGE_SECRET=String(bridgeSecret); process.env.DISCORD_GUILD_ID=String(guildId||''); process.env.DISCORD_CHANNEL_ID=String(channelId||''); process.env.DISCORD_BRIDGE_ENABLED=enabled?'true':'false'; serverSettings.discordEnabled=Boolean(enabled);serverSettings.discordGuildId=String(guildId||'');serverSettings.discordChannelId=String(channelId||'');save('server-settings.json',serverSettings);safeEnvWrite({DISCORD_BOT_TOKEN:botToken||process.env.DISCORD_BOT_TOKEN||'',DISCORD_GUILD_ID:process.env.DISCORD_GUILD_ID,DISCORD_CHANNEL_ID:process.env.DISCORD_CHANNEL_ID,DISCORD_BRIDGE_ENABLED:process.env.DISCORD_BRIDGE_ENABLED,DISCORD_BRIDGE_SECRET:process.env.DISCORD_BRIDGE_SECRET||''});res.json({ok:true,restartRequired:true,botTokenSet:Boolean(process.env.DISCORD_BOT_TOKEN)});});
app.post('/api/admin/ban', requireSession, requireAdmin, (req,res)=>{const {username,reason,durationHours}=req.body||{};const target=findUser(username);if(!target||username===ADMIN_USERNAME)return res.status(400).json({error:'Invalid user.'});const hours=Math.max(0,Number(durationHours||0));const ban={username:target.username,reason:String(reason||'No reason provided').slice(0,300),expiresAt:hours?new Date(Date.now()+hours*3600000).toISOString():null,createdAt:now(),by:req.user.username};bans.set(target.username,ban);save('banned.json',[...bans.values()]);forceLogout(target.username);io.emit('system:notice',{text:`${target.username} was banned by an administrator.`});res.json({ok:true,ban});});
app.post('/api/admin/unban', requireSession, requireAdmin, (req,res)=>{const {username}=req.body||{};bans.delete(username);save('banned.json',[...bans.values()]);res.json({ok:true});});
app.post('/api/admin/logout-user', requireSession, requireAdmin, (req,res)=>{forceLogout(req.body?.username);res.json({ok:true});});
app.post('/api/admin/user-role', requireSession, requireAdmin, (req,res)=>{const {username,role,tag}=req.body||{};const u=findUser(username);if(!u||username===ADMIN_USERNAME||!['member','moderator'].includes(role))return res.status(400).json({error:'Invalid user.'});u.role=role;if(tag)u.tag=String(tag).slice(0,30);persistUser(u);forceLogout(username);const updated=safeUser(u);io.emit('profile:updated',updated);res.json({ok:true,user:updated});});
app.delete('/api/admin/user/:username', requireSession, requireAdmin, (req,res)=>{const username=req.params.username;if(username===ADMIN_USERNAME)return res.status(400).json({error:'Cannot delete built-in admin.'});users=users.filter(u=>u.username!==username);save('users.json',users);bans.delete(username);save('banned.json',[...bans.values()]);forceLogout(username);res.json({ok:true});});
app.post('/api/admin/broadcast', requireSession, requireAdmin, (req,res)=>{const text=String(req.body?.text||'').trim().slice(0,500);if(!text)return res.status(400).json({error:'Announcement required.'});const msg={id:randomUUID(),channel:'general',text,author:{username:'SERVER',tag:'official'},createdAt:now(),edited:false,system:true,reactions:{}};messages.push(msg);messages=messages.slice(-5000);save('messages.json',messages);io.to('channel:general').emit('message:new',msg);res.json({ok:true,message:msg});});
app.post('/api/admin/clear-messages', requireSession, requireAdmin, (req,res)=>{messages=[];save('messages.json',messages);io.emit('messages:cleared');res.json({ok:true});});
app.delete('/api/admin/messages/:id', requireSession, requireAdmin, (req,res)=>{const old=messages.length;messages=messages.filter(m=>m.id!==req.params.id);save('messages.json',messages);if(messages.length!==old)io.emit('message:deleted',req.params.id);res.json({ok:true});});

io.on('connection', (socket) => {
  socket.on('auth', ({ token }) => {
    const session = sessions.get(token);
    if (!session || isBanned(session.username)) return socket.disconnect(true);
    socket.data.user = session;
    socket.join('channel:general');
    const profile=findUser(session.username); socket.emit('ready', { user: { ...session, ...(profile?safeUser(profile):{}) }, online: [...new Set([...io.sockets.sockets.values()].filter(s => s.data.user).map(s => s.data.user.username))] });
    socket.broadcast.emit('presence', { username: session.username, online: true });
  });
  socket.on('message:send', (payload) => {
    const user = socket.data.user; if (!user || isBanned(user.username)) return;
    const text = String(payload?.text || '').trim().slice(0, 4000); if (!text) return;
    const profile = findUser(user.username); const msg = { id: randomUUID(), channel: 'general', text, author: { username: user.username, displayName: profile?.displayName || user.username, tag: user.tag, avatar: profile?.avatar || null, accentColor: profile?.accentColor || '#5865f2' }, createdAt: now(), edited: false, replyTo: payload?.replyTo || null, attachment: payload?.attachment || null, reactions: {} };
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
const loadedBans = await loadState('banned', []); bans = new Map(Array.isArray(loadedBans) ? loadedBans.map(x => typeof x === 'string' ? [x,{username:x,reason:'No reason provided',expiresAt:null,createdAt:now()}] : [x.username,x]) : []);
acceptances = await loadState('terms-acceptances', []);
serverSettings = { ...serverSettings, ...(await loadState('server-settings', {})) };

server.listen(PORT, '0.0.0.0', () => console.log(`Linnmar Unknown running on port ${PORT}`));

process.on('SIGTERM', async () => {
  await closeStorage();
  process.exit(0);
});

