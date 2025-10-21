# Shared Pad & Tools

Collaborative Node.js workspace with a realtime shared pad, lightweight tools hub, and a PDF → JPG converter. Built with Express, Socket.IO, Pug, and Docker-friendly defaults.

> ⚠️ This service is not encrypted or access-controlled by default. Only run it on trusted networks or add a shared password.

## Highlights

- Shared pads per room key, saved under `data/pads/<room>.json`
- Instant multi-user editing over Socket.IO with optional file uploads per room
- **Diagram workspace** that embeds your self-hosted diagrams.net (draw.io) instance inside the tools UI
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

# Optional: point at your self-hosted draw.io instance
export DRAW_IO_URL="/internal/drawio/?ui=atlas&spin=1"

npm run start   # or npm run dev (uses nodemon)
```

Visit `http://localhost:3000`.

### Docker Compose (recommended)

```bash
# .env (same dir as docker-compose.yml)
# optional: point to your draw.io proxy path or host
# DRAW_IO_URL=/internal/drawio/?ui=atlas&spin=1

docker compose up -d
```

Compose maps the app to `http://localhost:9550`. Data persists in the `sharedpad-data` volume.

### Plain Docker

```bash
docker build -t shared-pad .
docker run -d \
  --name shared-pad \
  -e NODE_ENV=production \
  -e DRAW_IO_URL=/internal/drawio/?ui=atlas&spin=1 \
  -p 9550:3000 \
  -v sharedpad-data:/usr/src/app/data \
  shared-pad
```

## Configuration

### Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` | Express listen port inside the container/process. | `3000` |
| `DRAW_IO_URL` | URL (or same-origin proxy path) for the embedded diagrams.net editor. | `http://127.0.0.1:8080/?embed=1&ui=atlas&spin=1&proto=json` |

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
| `GET` | `/tools/draw` | Embedded draw.io workspace |
| `GET` | `/health` | JSON health check |

## Diagram workspace (draw.io)

- The `/tools/draw` route wraps an `<iframe>` that points at the URL you supply via `DRAW_IO_URL`.
- For best results, keep the editor on the same origin by reverse-proxying your draw.io container (e.g. `/internal/drawio/`) and set `DRAW_IO_URL` to that relative path. This avoids mixed-content errors and allows embedding when HTTPS is in use.
- If you expose the editor on a separate host, ensure it is available over HTTPS and permits embedding by relaxing `X-Frame-Options` / `frame-ancestors` headers to include your tools domain.
- Legacy `/tools/topology-sandbox` requests are redirected to `/tools/draw`.

## PDF → JPG conversion

- Width mode: integer `width` uses `pdftoppm -scale-to`
- DPI mode: integer `dpi` uses `pdftoppm -r`
- JPEG quality: `quality` 1–100
- Single-page → JPG, multi-page → ZIP of JPGs
- Temporary files are removed after the response completes

## Security notes

- No built-in user accounts; protect the site with your reverse proxy (HTTP auth, SSO, VPN, etc.)
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
