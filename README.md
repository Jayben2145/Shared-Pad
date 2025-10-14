# Shared Pad & Tools

Collaborative Node.js workspace with a realtime shared pad, lightweight tools hub, and a PDF → JPG converter. Built with Express, Socket.IO, Pug, and Docker-friendly defaults.

> ⚠️ This service is not encrypted or access-controlled by default. Only run it on trusted networks or add a shared password.

## Highlights

- Shared pads per room key, saved under `data/pads/<room>.json`
- Instant multi-user editing over Socket.IO with optional file uploads per room
- **Topology sandbox** with drag/drop nodes, redundant link bonding, snap-to-grid, and JSON/JPG export
- PDF to JPG conversion (single JPG or ZIP of JPGs) powered by `pdftoppm`
- Docker support (Compose and plain Docker) with persistent storage volume
- Basic health check at `GET /health`

## Prerequisites

### Local (non-Docker)

- Node.js 18+ (Node 20 recommended)
- `poppler-utils` package for `pdftoppm`
  - Ubuntu/Debian: `sudo apt-get update && sudo apt-get install -y poppler-utils`
  - Alpine: `sudo apk add poppler-utils`
  - Fedora: `sudo dnf install poppler-utils`
  - macOS (Homebrew): `brew install poppler`
  - Windows (Chocolatey): `choco install poppler`

### Docker

- Docker Engine 20.10+
- Docker Compose plugin v2 (`docker compose`). If it is missing on Ubuntu:
  1. `sudo apt-get install ca-certificates curl gnupg`
  2. `sudo install -m 0755 -d /etc/apt/keyrings`
  3. `curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg`
  4. `echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null`
  5. `sudo apt-get update && sudo apt-get install docker-compose-plugin`

## Quick Start

### Local development

```bash
npm install

# Optional: configure auth before starting (see Configuration)
export SHARED_PASSWORD="super-secret"
export SESSION_KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"

npm run start   # or npm run dev (uses nodemon)
```

Visit `http://localhost:3000`.

### Docker Compose (recommended)

```bash
# .env (same dir as docker-compose.yml)
SHARED_PASSWORD=super-secret
SESSION_KEY=base64-key-from-node-command

docker compose up -d
```

Compose maps the app to `http://localhost:9550`. Data persists in the `sharedpad-data` volume.

### Plain Docker

```bash
docker build -t shared-pad .
docker run -d \
  --name shared-pad \
  -e NODE_ENV=production \
  -e SHARED_PASSWORD=super-secret \
  -e SESSION_KEY=base64-key-from-node-command \
  -p 3000:3000 \
  -v sharedpad-data:/usr/src/app/data \
  shared-pad
```

## Configuration

### Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `SHARED_PASSWORD` | Shared password required to access any route. Leave unset to allow anonymous access. | _(empty)_ |
| `SESSION_KEY` | Secret used to sign session cookies. Must be a long random string when `SHARED_PASSWORD` is set. | `dev-unsafe-key` |
| `PORT` | Express listen port inside the container/process. | `3000` |

Generate a secure session key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Add the resulting value to your shell exports, `.env`, secrets manager, or Compose environment.

### Rate limiting & sessions

- Cookie sessions last 24 hours (`sid` cookie, SameSite=Lax).
- Login attempts are limited to 10 per 15 minutes per IP.

### Storage layout

- `data/pads`: persisted pad JSON files
- `data/files/<room>`: uploaded room files
- `data/uploads`: temporary PDF uploads
- `data/outputs`: temporary conversion outputs (cleaned after download)

## Routes

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/` | Tools hub |
| `GET` | `/pad` | Enter or generate pad key |
| `GET` | `/pad/:room` | Shared pad view for a room |
| `GET` | `/pad/:room/files.json` | File list API for a room |
| `POST` | `/pad/:room/files` | Upload file to pad |
| `GET` | `/tools/pdf-to-jpg` | PDF → JPG form |
| `POST` | `/tools/pdf-to-jpg` | Handle PDF conversion |
| `GET` | `/tools/topology-sandbox` | Network topology sandbox |
| `GET` | `/health` | JSON health check |

## Topology sandbox

The sandbox is aimed at quick network planning sketches:

- Drag nodes (router, switch, firewall, server, cloud, workstation) from the palette or click to drop them in the canvas.
- Connect nodes in **Link mode**; parallel links automatically fan out so each interface is visible.
- Group redundant circuits with **Bond mode**. Bonds draw per-device rings around the participating links. Add as many member links as you need.
- Use the toolbar to toggle **Snap Grid** (20 px) and **Center View**, or clear/export/import.
- The canvas auto-expands with scrollbars so zooming the browser never hides equipment off-screen.
- Export options:
  - **JSON** – retains node/link/bond metadata for re-importing later.
  - **JPG** – crops to the minimal bounding rectangle covering every node/link/bond, so off-screen items are preserved in the snapshot.
- Bonds default to blank labels to keep diagrams tidy; add a label only when you need one in the inspector.

> Tip: After importing or building a large design, press **Center View** to reframe the canvas. Use Snap Grid for neat alignment, or leave it off for free-form placement.

## PDF → JPG conversion

- Width mode: integer `width` uses `pdftoppm -scale-to`
- DPI mode: integer `dpi` uses `pdftoppm -r`
- JPEG quality: `quality` 1–100
- Single-page → JPG, multi-page → ZIP of JPGs
- Temporary files are removed after the response completes

## Security notes

- No user accounts; access is all-or-nothing via `SHARED_PASSWORD`
- No TLS termination; run behind HTTPS reverse proxy in production
- Uploaded files are stored on disk until cleaned up; avoid handling sensitive data

## Troubleshooting

- **Compose not found**: Install the Compose plugin (see Docker prerequisites) or use legacy `docker-compose`.
- **Port conflict (EADDRINUSE)**: adjust Compose `ports` mapping (e.g. `3001:3000`) and browse the new port.
- **`spawn pdftoppm ENOENT`**: install `poppler-utils` locally or rebuild the Docker image if Poppler is missing.
- **Pads not syncing**: ensure WebSocket upgrade headers are preserved by any reverse proxy.
- **Invalid pad key**: keys allow only `A–Z`, `a–z`, `0–9`, dash, and underscore.

## License

MIT License – see `LICENSE`.
