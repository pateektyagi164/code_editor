# Code Collab

A real-time collaborative code editor with integrated AI — built as a production-grade monorepo.

## Phase 2: Data Persistence & Authentication

User accounts, PostgreSQL, OAuth sign-in, and JWT-based session management.

**After Phase 1 setup, also run:**

```bash
docker compose up -d
cd backend
alembic upgrade head
```

**OAuth setup** — add credentials to `backend/.env`:

| Provider | Redirect URI |
|----------|--------------|
| Google | `http://localhost:8000/api/v1/auth/google/callback` |
| GitHub | `http://localhost:8000/api/v1/auth/github/callback` |

### Auth API

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/auth/providers` | Which OAuth providers are configured |
| `GET /api/v1/auth/google/login` | Start Google OAuth |
| `GET /api/v1/auth/github/login` | Start GitHub OAuth |
| `POST /api/v1/auth/refresh` | Rotate refresh token (HttpOnly cookie) |
| `GET /api/v1/auth/me` | Current user (Bearer token) |
| `POST /api/v1/auth/logout` | Revoke session |

## Phase 1: Foundation & Scaffold

This phase establishes the monorepo structure, Docker services, FastAPI backend skeleton, and the three-column frontend layout with the Google AI Studio design system.

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Python](https://www.python.org/) 3.11+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

### Quick Start

**1. Start infrastructure (Postgres + Redis)**

```bash
docker compose up -d
```

**2. Backend**

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

**3. Frontend**

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The Vite dev server proxies `/api` and `/health` to the backend on port 8000.

### Project Structure

```
code_editor/
├── docker-compose.yml      # Postgres + Redis
├── frontend/               # React + Vite + Tailwind
│   └── src/
│       └── components/layout/
│           ├── ThreeColumnLayout.jsx
│           └── Navbar.jsx
└── backend/                # FastAPI
    └── app/
        ├── main.py
        └── core/config.py
```

### Roadmap

| Phase | Focus |
|-------|-------|
| **1** | Foundation & scaffold |
| **2** | Data persistence & authentication *(current)* |
| 3 | WebSockets, CRDT, Monaco editor |
| 4 | Code sandbox (Judge0) |
| 5 | AI sidebar, latency tracker, polish |

See [BLUEPRINT.md](./BLUEPRINT.md) for the full architecture spec.
