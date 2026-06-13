// custom-openwa.js
// Custom OpenWA server that uses @open-wa/wa-automate programmatically.
//
// Why this exists: the official Easy API CLI has a hardcoded 30s
// waitForFunction on `window.Debug.VERSION` in initializer.js:208.
// For a fresh session, the page loads with a QR code but Debug is NOT
// defined until the user scans — which takes minutes, not 30s. So the
// CLI never starts its HTTP server.
//
// This wrapper:
//   1. Starts our own HTTP server FIRST (so /api/health works immediately)
//   2. Calls wa-automate's create() with the right config (useChrome,
//      useStealth, qrTimeout=0, etc.) — `create()` may hang on the
//      30s wait, but that's OK because the user-facing API is already
//      up.
//   3. Exposes /api/qr which returns the latest QR as base64 PNG.
//   4. Once create() resolves (auth complete), we attach the Client
//      and the API becomes fully functional.
//   5. Forwards all events to the LMTM-OS webhook.
//
// Endpoints:
//   GET  /api/health                 -> { status, openwa_status, qr }
//   GET  /api/qr                     -> { qr: 'data:image/png;base64,...' } or 404
//   GET  /api/state                  -> full client state
//   GET  /api/groups                 -> list of groups
//   GET  /api/group/:id/messages     -> recent messages
//   POST /api/sendMessage            -> { to, body }
//   POST /api/sendImage              -> { to, imageUrl, caption? }
//   POST /api/logout                 -> kill client
//
// Env:
//   OPENWA_PORT          (default 8080)
//   OPENWA_API_KEY       (required; checked on every request)
//   WA_AUTOMATE_SESSION_ID (default 'lmtm')
//   WA_AUTOMATE_VERSION  (default 4.76.0)
//   LMTM_WEBHOOK_URL     (where to forward events)

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.OPENWA_PORT || process.env.WA_AUTOMATE_PORT || '8080', 10);
const API_KEY = process.env.OPENWA_API_KEY || process.env.WA_AUTOMATE_API_KEY || '';
const SESSION_ID = process.env.WA_AUTOMATE_SESSION_ID || 'lmtm';
const WA_VERSION = process.env.WA_AUTOMATE_VERSION || '4.76.0';
const WEBHOOK = process.env.LMTM_WEBHOOK_URL || '';

if (!API_KEY) {
  console.error('[custom-openwa] FATAL: OPENWA_API_KEY (or WA_AUTOMATE_API_KEY) is required');
  process.exit(1);
}

let client = null;
let lastQr = null;
let openwaState = 'starting';
let lastError = null;

function authCheck(req) {
  const k = req.headers['x-api-key'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return k === API_KEY;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 10 * 1024 * 1024) { req.destroy(); reject(new Error('body too large')); } });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); }
      catch (e) { reject(new Error('invalid JSON: ' + e.message)); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, code, body) {
  const s = JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(s);
}

async function forwardEvent(name, payload) {
  if (!WEBHOOK) return;
  try {
    const u = new URL(WEBHOOK);
    const body = JSON.stringify({ event: name, sessionId: SESSION_ID, payload, ts: Date.now() });
    const req = http.request({
      hostname: u.hostname, port: u.port || 443, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'X-OpenWA-Event': name }
    }, () => {});
    req.on('error', (e) => console.error('[custom-openwa] webhook forward error', e.message));
    req.write(body);
    req.end();
  } catch (e) {
    console.error('[custom-openwa] webhook URL parse error', e.message);
  }
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,X-API-Key,Authorization' });
    return res.end();
  }
  // Health is public (so GHA keepalive can hit it)
  const p = url.parse(req.url, true);
  const path = p.pathname;

  if (path === '/api/health') {
    return sendJson(res, 200, {
      status: openwaState,
      sessionId: SESSION_ID,
      hasClient: !!client,
      hasQr: !!lastQr,
      lastError: lastError ? String(lastError).slice(0, 200) : null,
      ts: new Date().toISOString()
    });
  }

  if (path === '/api/qr') {
    if (!lastQr) return sendJson(res, 404, { error: 'no QR available' });
    return sendJson(res, 200, { qr: lastQr, ts: new Date().toISOString() });
  }

  // All other endpoints require API key
  if (!authCheck(req)) {
    return sendJson(res, 401, { error: 'unauthorized' });
  }

  try {
    if (path === '/api/state' && req.method === 'GET') {
      if (!client) return sendJson(res, 503, { error: 'client not ready', state: openwaState });
      const me = await client.getMe();
      return sendJson(res, 200, { state: openwaState, me });
    }

    if (path === '/api/groups' && req.method === 'GET') {
      if (!client) return sendJson(res, 503, { error: 'client not ready' });
      const groups = await client.getAllGroups();
      return sendJson(res, 200, { groups });
    }

    if (path.startsWith('/api/group/') && path.endsWith('/messages') && req.method === 'GET') {
      if (!client) return sendJson(res, 503, { error: 'client not ready' });
      const groupId = decodeURIComponent(path.slice('/api/group/'.length, -'/messages'.length));
      const messages = await client.getGroupMessageHistory(groupId, 50);
      return sendJson(res, 200, { groupId, messages });
    }

    if (path === '/api/sendMessage' && req.method === 'POST') {
      if (!client) return sendJson(res, 503, { error: 'client not ready' });
      const body = await readJsonBody(req);
      if (!body.to || !body.body) return sendJson(res, 400, { error: 'to and body required' });
      const r = await client.sendText(body.to, body.body);
      return sendJson(res, 200, { ok: true, result: r });
    }

    if (path === '/api/sendImage' && req.method === 'POST') {
      if (!client) return sendJson(res, 503, { error: 'client not ready' });
      const body = await readJsonBody(req);
      if (!body.to || !body.imageUrl) return sendJson(res, 400, { error: 'to and imageUrl required' });
      const r = await client.sendImageAsSticker
        ? null
        : null; // placeholder; use sendFileFromUrl if available
      try {
        const r2 = await client.sendFileFromUrl(body.to, body.imageUrl, 'image', body.caption || '');
        return sendJson(res, 200, { ok: true, result: r2 });
      } catch (e) {
        return sendJson(res, 500, { error: e.message });
      }
    }

    if (path === '/api/logout' && req.method === 'POST') {
      if (!client) return sendJson(res, 503, { error: 'client not ready' });
      await client.logout();
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 404, { error: 'not found', path });
  } catch (e) {
    console.error('[custom-openwa] handler error', e);
    return sendJson(res, 500, { error: e.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[custom-openwa] HTTP server listening on 0.0.0.0:${PORT}`);
  console.log(`[custom-openwa] session=${SESSION_ID} wa-version=${WA_VERSION} webhook=${WEBHOOK || '(none)'}`);
  // Start wa-automate NOW
  startWaAutomate();
});

async function startWaAutomate() {
  try {
    openwaState = 'launching-browser';
    console.log(`[custom-openwa] requiring @open-wa/wa-automate@${WA_VERSION}...`);

    // ── Patch initializer.js BEFORE requiring wa-automate ──
    // The 30s waitForFunction on `window.Debug.VERSION` is hardcoded
    // with no timeout option in initializer.js:208. For fresh sessions,
    // the QR page doesn't expose Debug until scanned, which takes
    // minutes — not 30s. We patch the file in place to add
    // { timeout: 0 } (wait forever).
    try {
      const Module = require('module');
      const entryPath = require.resolve('@open-wa/wa-automate', { paths: Module.globalPaths.concat(['/usr/local/lib/node_modules']) });
      const initializerPath = require('path').join(require('path').dirname(entryPath), 'controllers', 'initializer.js');
      let src = fs.readFileSync(initializerPath, 'utf8');
      const buggyLine = `yield waPage.waitForFunction('window.Debug!=undefined && window.Debug.VERSION!=undefined && require');`;
      const patchedLine = `yield waPage.waitForFunction('window.Debug!=undefined && window.Debug.VERSION!=undefined && require', { timeout: 0 });`;
      if (src.includes(buggyLine)) {
        src = src.replace(buggyLine, patchedLine);
        fs.writeFileSync(initializerPath, src);
        console.log('[custom-openwa] ✅ patched initializer.js: waitForFunction now waits forever');
      } else if (src.includes(patchedLine)) {
        console.log('[custom-openwa] ✅ initializer.js already patched');
      } else {
        console.log('[custom-openwa] ⚠️  could not find buggy line in initializer.js — assuming already patched');
      }
    } catch (patchErr) {
      console.error('[custom-openwa] ⚠️  patch step failed:', patchErr.message);
    }

    const owa = require(`@open-wa/wa-automate`);

    // Subscribe to the QR event BEFORE create() so we capture it.
    // wa-automate has a global event emitter `owa.ev` that fires
    // 'qr' as soon as the page renders a QR code (BEFORE the
    // create() promise resolves).
    try {
      if (owa.ev && typeof owa.ev.on === 'function') {
        owa.ev.on('qr.**', (qrData, sessionId) => {
          // qrData may be:
          //  - data URL 'data:image/png;base64,...'
          //  - raw base64 string
          //  - object { qr: '...' }
          let qr = null;
          if (typeof qrData === 'string') {
            qr = qrData.startsWith('data:') ? qrData : `data:image/png;base64,${qrData}`;
          } else if (qrData && typeof qrData === 'object') {
            const inner = qrData.qr || qrData.data || qrData;
            qr = typeof inner === 'string'
              ? (inner.startsWith('data:') ? inner : `data:image/png;base64,${inner}`)
              : null;
          }
          if (qr) {
            lastQr = qr;
            console.log(`[custom-openwa] QR captured (${qr.length} chars) for session=${sessionId}`);
            forwardEvent('qr', { qr, sessionId });
          }
        });
        owa.ev.on('authenticated.**', (sessionId) => {
          console.log(`[custom-openwa] authenticated event for session=${sessionId}`);
          forwardEvent('authenticated', { sessionId });
        });
        owa.ev.on('auth_failure.**', (msg, sessionId) => {
          lastError = `auth_failure: ${msg}`;
          console.error(`[custom-openwa] auth_failure for session=${sessionId}: ${msg}`);
          forwardEvent('auth_failure', { msg, sessionId });
        });
        console.log('[custom-openwa] subscribed to owa.ev events');
      } else {
        console.log('[custom-openwa] ⚠️  owa.ev not available, will only see events on client');
      }
    } catch (evErr) {
      console.error('[custom-openwa] failed to subscribe to owa.ev:', evErr.message);
    }
    const config = {
      sessionId: SESSION_ID,
      useChrome: true,
      executablePath: '/usr/bin/google-chrome',
      useStealth: true,
      headless: true,
      qrTimeout: 0,                  // wait forever for QR scan
      authTimeout: 0,                // wait forever for auth
      waitForRipeSession: true,
      waitForRipeSessionTimeout: 0,  // wait forever
      killProcessOnTimeout: false,
      deleteSessionDataOnLogout: false,
      disableSpins: true,
      logDebugInfoAsObject: true,
      skipUpdateCheck: true,
      cacheEnabled: false,
      customUserAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      // Auto-refresh QR every 60s (wa web does this anyway, but explicit)
      autoRefresh: true,
    };
    console.log('[custom-openwa] config:', JSON.stringify(config, null, 2));
    openwaState = 'awaiting-qr';
    client = await owa.create(config);
    openwaState = 'ready';
    lastQr = null;
    console.log('[custom-openwa] client READY (authenticated)');

    // Forward all events to the webhook
    const events = ['message', 'message_create', 'message_ack', 'message_quote', 'qr', 'authenticated', 'auth_failure', 'ready', 'disconnected', 'logout', 'state_change', 'group_join', 'group_leave', 'group_update', 'incoming_call'];
    for (const e of events) {
      try {
        client.onStateChanged || client.on;
        const ev = client.on || client.onStateChanged;
        if (typeof ev === 'function') {
          ev.call(client, e, (...args) => {
            const payload = args.length === 1 ? args[0] : args;
            forwardEvent(e, payload);
            if (e === 'qr') {
              // QR is emitted as base64 data URL
              const qr = args[0];
              lastQr = typeof qr === 'string' && qr.startsWith('data:') ? qr : (qr && qr.qr ? qr.qr : null) || (typeof qr === 'string' ? `data:image/png;base64,${qr}` : null);
            }
          });
        }
      } catch (e) {
        console.error('[custom-openwa] could not attach listener', e, e?.message);
      }
    }
  } catch (e) {
    openwaState = 'error';
    lastError = e;
    console.error('[custom-openwa] FATAL', e?.stack || e);
  }
}

// Graceful shutdown
function shutdown(signal) {
  console.log(`[custom-openwa] received ${signal}, shutting down...`);
  try { if (client) client.kill().catch(() => {}); } catch {}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
