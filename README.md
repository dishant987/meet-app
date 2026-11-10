# MeetApp

A simple video meeting app (like Google Meet) with live captions, recording and AI meeting notes (coming in later phases).
See [PLAN.md](PLAN.md) for the full plan and progress.

## Run it locally

You need **Node.js 22+** and **Docker Desktop** (running).

1. Start the local database and LiveKit video server:
   ```bash
   docker compose up -d
   ```
2. Start the backend (first time: install and create the tables):
   ```bash
   cd server
   npm install
   npx prisma migrate deploy
   npm run dev
   ```
3. In a second terminal, start the frontend:
   ```bash
   cd client
   npm install
   npm run dev
   ```
4. Open http://localhost:5173 → **New meeting** → copy the link → open it in a second browser window to join as another person.

> The `.env` files in `server/` and `client/` are set up for local use. Copy `.env.example` if they're missing.
> The local Postgres runs on port **5433** (so it doesn't clash with a Postgres already installed on 5432).

## Useful commands

| Where | Command | What it does |
|---|---|---|
| server | `npm test` | API tests (needs `docker compose up -d`) |
| server | `npm run typecheck` | TypeScript check |
| server | `npm run db:migrate` | Create a migration after editing `prisma/schema.prisma` |
| client | `npm run build` | Production build (also type-checks) |
| client | `npx oxlint src` | Lint |

## Going live (later)

Replace in `server/.env`: `DATABASE_URL` → your Neon URL; `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` → your LiveKit Cloud project; `CLIENT_URL` → your Vercel URL.
Set `VITE_API_URL` in the client to your Render URL.
