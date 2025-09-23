=====================================================================
SHARED-PAD & TOOLS – README (TEXT VERSION)
Overview

Small Node.js app that provides:

Shared Pad (rooms/keys) – a realtime text pad per key (example: /pad/bob).

Tools Hub – landing page that lists tools.

PDF to JPG converter – server-side conversion using poppler (pdftoppm).

IMPORTANT: This is NOT a secure or encrypted transfer service. Do not upload sensitive files or paste secrets.

Features

Rooms/keys: visit /pad, enter a key (or click Generate for a 6-character key), redirected to /pad/<key>.

Realtime editing: all users on the same key see edits instantly (Socket.IO).

Persistence: each pad is saved as data/pads/<key>.json.

PDF -> JPG: upload a PDF, choose width or DPI and quality; get a JPG (single-page) or ZIP (multi-page). Temporary files are cleaned after download.

Dockerized: includes Dockerfile and docker-compose.yml.

Healthcheck endpoint: GET /health returns a small JSON object.

Routes / Pages

GET / Tools hub (links to Shared Pad and PDF -> JPG)
GET /pad Shared Pad landing (enter key or auto-generate key)
GET /pad?room=<key> Redirects to /pad/<key>
GET /pad/<key> Shared Pad for the given key
GET /tools/pdf-to-jpg Upload form for PDF -> JPG
POST /tools/pdf-to-jpg Performs the conversion
GET /health Simple health response

Requirements

If running locally (not Docker):

Node.js 18+ (Node 20 recommended)

poppler-utils (provides pdftoppm) for the PDF tool

Install poppler-utils:

Ubuntu/Debian: sudo apt-get update && sudo apt-get install -y poppler-utils

Alpine Linux: sudo apk add poppler-utils

Fedora: sudo dnf install poppler-utils

macOS (brew): brew install poppler

Windows (choco): choco install poppler (ensure pdftoppm is on PATH)

Project Structure

server.js Express app (pads + tools)
package.json
docker-compose.yml
Dockerfile
.dockerignore
public/
client.js Socket.IO client logic
style.css Basic styling (optional)
views/
layout.pug
index.pug Tools hub
pad-index.pug Enter key / generate key
pad.pug Room view
tool_pdf_to_jpg.pug Upload form
data/
pads/ Persisted pads (JSON files)
uploads/ Temporary uploaded PDFs
outputs/ Temporary converted images

Quick Start (Local)

Install dependencies:
npm install

Start the app:
npm run start
(or) npm run dev (requires nodemon; auto-restarts on file changes)

Open in a browser:
http://localhost:3000

If PDF conversion fails with "spawn pdftoppm ENOENT", install poppler-utils (see Requirements).

Docker Usage

A) With Docker Compose (preferred if available):
docker compose up -d
Then open http://localhost:3000

If "docker compose" is not recognized, install the Compose plugin:
sudo apt-get install -y docker-compose-plugin
docker compose version
Or use legacy:
docker-compose up -d

B) Plain Docker (no compose):
docker build -t shared-pad .
docker run -d --name shared-pad -p 3000:3000 -v sharedpad-data:/usr/src/app/data shared-pad

Notes:

The app stores data under /usr/src/app/data. The named volume sharedpad-data persists pad files and prevents data loss across restarts.

Configuration

Environment variables:

PORT (default 3000)

Server limits (found in server.js):

Max upload size: 25 MB (multer limit)

Max width: 4096 px cap (when using width mode)

Max DPI: 600 cap (when using dpi mode)

PDF Conversion Rules

If "width" is a number, converter uses "-scale-to <width>".

Else if "dpi" is a number, converter uses "-r <dpi>".

Else it uses pdftoppm defaults (~150 DPI).

Quality is 1 to 100 (JPEG quality).

Single-page PDF returns one JPG.

Multi-page PDF returns a ZIP of JPGs.

Temporary files are cleaned after the response finishes.

Security / Privacy Notes

No authentication. Anyone with the URL can access pads/tools.

No encryption at rest. Temporary files are stored briefly. Pad JSON is stored in data/pads.

Place behind an authenticated reverse proxy if needed, and use HTTPS externally.

Do not upload confidential files or paste secrets.

Reverse Proxy Examples (Optional)

Nginx basic snippet:

server {
server_name your.domain.com;
location / {
proxy_pass http://127.0.0.1:3000
;
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_set_header Host $host;
}
# Optional: increase if large PDFs are rejected
# client_max_body_size 50m;
}

Caddy basic snippet:

your.domain.com {
reverse_proxy 127.0.0.1:3000
}

Troubleshooting

"docker compose up -d" not found:
Install the Compose plugin or use "docker-compose up -d".

Port already in use (EADDRINUSE):
Change the host port mapping. Example with compose:
ports:
- "3001:3000"
Then browse http://localhost:3001

"spawn pdftoppm ENOENT":
In Docker: ensure Dockerfile installs poppler-utils, rebuild image.
Locally: install poppler-utils for your OS.

Pads do not sync across browsers:
Ensure WebSocket upgrade headers pass through any reverse proxy.

Entering a key redirects back to pad index:
Keys only allow A–Z, a–z, 0–9, dash, underscore. Remove spaces/symbols.

Healthcheck

GET /health returns JSON indicating basic status:
{ ok: true, pads: <count> }

License

MIT License. Use freely; attribution appreciated.

Credits

poppler / pdftoppm for PDF rasterization

Socket.IO for realtime updates

Express + Pug for server and views

=====================================================================