// FETİH HİKAYESİ — oyun sunucusu + TikTok LIVE aktarıcı (relay)
const path = require('path');
const http = require('http');
const express = require('express');
const compression = require('compression');
const { WebSocketServer } = require('ws');
const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');

const PORT = process.env.PORT || 3000;
const app = express();
app.use(compression());
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h',
  setHeaders(res, p) { if (p.endsWith('.html') || p.endsWith('.webmanifest')) res.setHeader('Cache-Control', 'no-cache'); }
}));
app.get('/health', (_req, res) => res.json({ ok: true, t: Date.now() }));

// Profil resmi vekili: TikTok CDN görselleri CORS başlığı göndermediği için WebGL dokusu yapılamaz.
const AVATAR_HOST_OK = /(^|\.)(tiktokcdn\.com|tiktokcdn-us\.com|tiktokcdn-eu\.com|tiktok\.com|ibytedtos\.com|byteoversea\.com|muscdn\.com)$/i;
const avatarCache = new Map();
app.get('/avatar', async (req, res) => {
  try {
    const u = new URL(String(req.query.url || ''));
    if (u.protocol !== 'https:' || !AVATAR_HOST_OK.test(u.hostname)) return res.status(400).end();
    const key = u.toString();
    let hit = avatarCache.get(key);
    if (!hit) {
      const r = await fetch(key, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) return res.status(502).end();
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 2_000_000) return res.status(413).end();
      hit = { type: r.headers.get('content-type') || 'image/jpeg', buf };
      avatarCache.set(key, hit);
      if (avatarCache.size > 600) avatarCache.delete(avatarCache.keys().next().value);
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.type(hit.type).send(hit.buf);
  } catch { res.status(400).end(); }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function pic(user) {
  if (!user) return '';
  const cands = [user.profilePictureUrl, user.profilePicture?.url?.[0], user.profilePicture?.urls?.[0],
    user.avatarThumb?.urlList?.[0], user.avatarMedium?.urlList?.[0], user.avatarLarge?.urlList?.[0]];
  const u = cands.find(x => typeof x === 'string' && x.startsWith('http')) || '';
  return u;
}
function who(data) {
  const u = data?.user || data || {};
  const uniqueId = u.uniqueId || u.displayId || data?.uniqueId || String(u.userId || u.id || '');
  const nickname = u.nickname || u.nickName || data?.nickname || uniqueId || 'İzleyici';
  return { uniqueId: String(uniqueId || nickname), nickname: String(nickname), profilePictureUrl: pic(u) || data?.profilePictureUrl || '' };
}

wss.on('connection', (ws) => {
  let conn = null;
  const streaks = new Map();
  const send = (o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
  const stop = async () => {
    const c = conn; conn = null; streaks.clear();
    if (c) { try { c.removeAllListeners(); await c.disconnect(); } catch {} }
  };

  ws.on('message', async (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'ping') return send({ type: 'pong' });
    if (msg.type === 'disconnect') { await stop(); return send({ type: 'status', state: 'disconnected', text: 'Bağlantı kesildi' }); }
    if (msg.type !== 'connect') return;
    await stop();
    const username = String(msg.username || '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?tiktok\.com\/@/, '').split(/[/?]/)[0];
    if (!username) return send({ type: 'status', state: 'error', text: 'Kullanıcı adı boş' });
    const opts = { enableExtendedGiftInfo: true, processInitialData: false };
    const key = (msg.signApiKey || process.env.EULER_API_KEY || '').trim();
    if (key) opts.signApiKey = key;
    send({ type: 'status', state: 'connecting', text: `@${username} yayınına bağlanılıyor…` });
    const c = new TikTokLiveConnection(username, opts);
    conn = c;

    c.on(WebcastEvent.CHAT, d => send({ type: 'chat', ...who(d), comment: d.comment || '' }));
    c.on(WebcastEvent.LIKE, d => send({ type: 'like', ...who(d), likeCount: Number(d.likeCount || 1) }));
    c.on(WebcastEvent.FOLLOW, d => send({ type: 'follow', ...who(d) }));
    c.on(WebcastEvent.SHARE, d => send({ type: 'share', ...who(d) }));
    c.on(WebcastEvent.MEMBER, d => send({ type: 'member', ...who(d) }));
    c.on(WebcastEvent.ROOM_USER, d => send({ type: 'viewers', count: Number(d.viewerCount || d.totalUser || 0) }));
    c.on(WebcastEvent.GIFT, d => {
      const w = who(d);
      const giftId = String(d.giftId || d.gift?.id || '');
      const giftName = d.giftDetails?.giftName || d.extendedGiftInfo?.name || d.gift?.name || '';
      const giftType = Number(d.giftDetails?.giftType ?? d.gift?.type ?? d.extendedGiftInfo?.type ?? 0);
      const repeat = Math.max(1, Number(d.repeatCount || 1));
      let count = repeat;
      if (giftType === 1) {
        const k = `${w.uniqueId}|${giftId}|${d.groupId || ''}`;
        const last = streaks.get(k) || 0;
        count = Math.max(0, repeat - last);
        if (d.repeatEnd) streaks.delete(k); else streaks.set(k, repeat);
        if (streaks.size > 2000) streaks.clear();
      }
      if (count > 0) send({ type: 'gift', ...w, giftId, giftName, repeatCount: count, diamondCount: Number(d.extendedGiftInfo?.diamond_count || d.gift?.diamondCount || 0) });
    });
    c.on(ControlEvent.DISCONNECTED, () => { if (conn === c) send({ type: 'status', state: 'disconnected', text: 'Yayın bağlantısı koptu' }); });
    c.on(WebcastEvent.STREAM_END, () => send({ type: 'status', state: 'disconnected', text: 'Yayın sona erdi' }));
    c.on(ControlEvent.ERROR, e => console.error('tiktok error', e?.message || e));

    try {
      const st = await c.connect();
      if (conn !== c) return;
      send({ type: 'status', state: 'connected', text: `@${username} yayınına bağlandı`, roomId: st?.roomId });
    } catch (e) {
      if (conn === c) conn = null;
      const name = e?.constructor?.name || '';
      let text = 'Bağlanamadı: ' + (e?.message || String(e)).slice(0, 160);
      if (/UserOffline/i.test(name) || /offline|not live|isn't online/i.test(e?.message || '')) text = `@${username} şu anda canlı yayında değil. Önce TikTok LIVE'ı başlat, sonra Bağlan'a bas.`;
      else if (/Room ID|room id|roomId/i.test(e?.message || '')) text = `@${username} için canlı yayın bulunamadı. Yayının açık olduğundan ve kullanıcı adının doğru olduğundan emin ol, sonra tekrar dene.`;
      else if (/RateLimit|429/i.test(name + (e?.message || ''))) text = 'İmza sunucusu sınırına takıldı. Biraz bekleyip tekrar dene ya da Euler Stream API anahtarı gir.';
      send({ type: 'status', state: 'error', text });
    }
  });
  ws.on('close', stop);
});

// Bağlantı canlılık kontrolü
setInterval(() => wss.clients.forEach(ws => { try { ws.ping(); } catch {} }), 30000);

server.listen(PORT, () => console.log('FETİH HİKAYESİ sunucusu port', PORT));
