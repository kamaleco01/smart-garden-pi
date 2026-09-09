/*
  Smart Garden - Pi Dashboard Server
  Pure Node.js, ZERO dependencies. Run with:  node server.js
  Then open http://<pi-ip>:3000  (or expose via your Cloudflare tunnel)

  This does NOT touch the ESP32 sketch. It:
    - receives sensor readings the ESP POSTs to /api/reading
    - serves the dashboard UI
    - queues control commands the ESP fetches from /api/commands

  Until a real ESP posts, it runs in DEMO mode with gentle simulated data
  so you can see the UI. Set env SIMULATE=0 to turn the fake data off.
*/

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const ONLINE_WINDOW_MS = 15000;                 // ESP is "online" if seen in last 15s
const SIMULATE = process.env.SIMULATE !== '0';  // demo data when no real ESP

// Plant profiles - keep these matched to the ESP sketch.
const PLANTS = [
  { name: 'Mustard Greens (Sawi)', threshold: 55, seconds: 5 },
  { name: 'Chili (Cili)',          threshold: 38, seconds: 4 },
  { name: 'Aloe Vera',             threshold: 20, seconds: 3 },
];

let state = {
  moisture: 42,
  water: true,
  pump: false,
  auto: true,
  plant: 0,
  lastSeen: 0,      // ms timestamp of last real ESP reading
};

let pendingCommands = [];   // commands waiting for the ESP to poll
let lastPumpCmdAt = 0;      // when the dashboard last issued a pump command

// --- gentle demo simulation (only while no real ESP is posting) ---
setInterval(() => {
  const espOnline = Date.now() - state.lastSeen < ONLINE_WINDOW_MS;
  if (espOnline || !SIMULATE) return;

  const t = PLANTS[state.plant].threshold;
  if (state.pump) {
    state.moisture = Math.min(100, state.moisture + 6);
    if (state.moisture > t + 20) state.pump = false;   // sim run finished
  } else {
    state.moisture = Math.max(0, state.moisture - 0.4); // soil slowly dries
    if (state.auto && state.water && state.moisture < t) state.pump = true;
  }
}, 1000);

// --- helpers ---
function send(res, code, type, body) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}
function json(res, code, obj) { send(res, code, 'application/json', JSON.stringify(obj)); }
function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => (data += c));
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  // ESP posts a sensor reading (and gets any pending commands back in one shot)
  if (p === '/api/reading' && req.method === 'POST') {
    const b = await readBody(req);
    if (typeof b.moisture === 'number') state.moisture = b.moisture;
    if (typeof b.water === 'boolean') state.water = b.water;
    // ignore the ESP's pump value for a few seconds after a dashboard command,
    // so the button doesn't flicker back before the ESP has applied it
    if (typeof b.pump === 'boolean' && Date.now() - lastPumpCmdAt > 8000) state.pump = b.pump;
    if (typeof b.auto === 'boolean') state.auto = b.auto;
    if (typeof b.plant === 'number') state.plant = b.plant;
    state.lastSeen = Date.now();
    return json(res, 200, { ok: true, commands: pendingCommands.splice(0) });
  }

  // ESP polls for commands (alternative to piggybacking on /api/reading)
  if (p === '/api/commands' && req.method === 'GET') {
    return json(res, 200, { commands: pendingCommands.splice(0) });
  }

  // Dashboard polls current status
  if (p === '/api/status' && req.method === 'GET') {
    const online = Date.now() - state.lastSeen < ONLINE_WINDOW_MS;
    return json(res, 200, {
      moisture: Math.round(state.moisture * 10) / 10,
      water: state.water,
      pump: state.pump,
      auto: state.auto,
      plant: state.plant,
      plantName: PLANTS[state.plant].name,
      threshold: PLANTS[state.plant].threshold,
      plants: PLANTS.map(x => x.name),
      online,
      demo: !online && SIMULATE,
    });
  }

  // Dashboard sends a control action
  if (p === '/api/control' && req.method === 'POST') {
    const b = await readBody(req);
    if (b.action === 'pump') {
      const on = b.value === 'on';
      if (on && state.water) state.pump = true;
      if (!on) state.pump = false;
      lastPumpCmdAt = Date.now();
      pendingCommands.push({ type: 'pump', value: on ? 'on' : 'off' });
    } else if (b.action === 'plant' && typeof b.value === 'number') {
      if (b.value >= 0 && b.value < PLANTS.length) {
        state.plant = b.value;
        pendingCommands.push({ type: 'plant', value: b.value });
      }
    } else if (b.action === 'auto') {
      state.auto = !state.auto;
      if (!state.auto) state.pump = false;
      pendingCommands.push({ type: 'auto', value: state.auto });
    }
    return json(res, 200, { ok: true });
  }

  // Static files
  const rel = p === '/' ? '/index.html' : p;
  const full = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[\/\\])+/, ''));
  fs.readFile(full, (err, data) => {
    if (err) return send(res, 404, 'text/plain', 'Not found');
    const ext = path.extname(full).toLowerCase();
    const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
    send(res, 200, types[ext] || 'application/octet-stream', data);
  });
});

server.listen(PORT, () => {
  console.log(`Smart Garden dashboard -> http://localhost:${PORT}`);
  console.log(SIMULATE ? 'DEMO data ON (until a real ESP posts to /api/reading)' : 'DEMO data OFF');
});
