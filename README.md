# Smart Garden - Pi Dashboard

A remote dashboard for the ESP32 Smart Garden watering system. Runs on the Raspberry Pi
(or any machine with Node). Pure Node.js, **zero npm installs**.

This project does **not** modify the ESP32 sketch. Your existing `.ino` keeps working
exactly as it is.

## Run it

```bash
node server.js
```

Then open <http://localhost:3000> (on the Pi: `http://<pi-ip>:3000`).

It starts in **DEMO mode** with gentle simulated moisture so you can see the UI.
The moment a real ESP32 posts a reading, the badge flips to **Live** and it shows real data.

To turn the fake demo data off: `SIMULATE=0 node server.js`
To change the port: `PORT=8080 node server.js`

## Deploy on the Raspberry Pi

There is **no build step** (pure Node, zero dependencies). Just clone and run:

```bash
git clone https://github.com/kamaleco01/smart-garden-pi.git
cd smart-garden-pi
node server.js
```

Open `http://<pi-ip>:3000`, or route it through your Cloudflare tunnel for remote access.

To keep it running after you close the terminal / after reboot, use pm2:

```bash
npm i -g pm2
pm2 start server.js --name smart-garden
pm2 save && pm2 startup
```

## How the ESP connects (next step)

The ESP32 stays fully autonomous (all watering logic on-chip). It just phones home:

1. **Every few seconds** it POSTs its readings:
   ```
   POST /api/reading
   { "moisture": 42.5, "water": true, "pump": false, "auto": true, "plant": 2 }
   ```
   The response includes any queued control commands: `{ "ok": true, "commands": [...] }`

2. **Commands** (from the dashboard buttons) come back in that response, or the ESP can
   poll `GET /api/commands`. Command shapes:
   - `{ "type": "pump",  "value": "on" | "off" }`
   - `{ "type": "plant", "value": 0..5 }`
   - `{ "type": "auto",  "value": true | false }`

Because the ESP only makes **outbound** requests, it works from any network (home WiFi,
phone hotspot) as long as this server has a public address. Point it at your Cloudflare
tunnel URL and it reaches the Pi from anywhere.

## Endpoints

| Method | Path            | Who    | Purpose                          |
|--------|-----------------|--------|----------------------------------|
| POST   | `/api/reading`  | ESP    | push sensor reading + get commands |
| GET    | `/api/commands` | ESP    | fetch queued commands            |
| GET    | `/api/status`   | UI     | current state for the dashboard  |
| POST   | `/api/control`  | UI     | queue a control action           |

## Note on displayed metrics

The hardware currently measures **soil moisture** and **water-tank level** only.
The dashboard shows exactly those (no invented Temp/Light/CO2 readings). Add more pills
later if you add more sensors.
