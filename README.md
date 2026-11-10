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

## Deploy to Vercel (app + API on one address)

`vercel.json` builds both parts: the React app is served as static files and the Express API runs as one
serverless function (`api/index.js` → `server/dist/app.js`) for every `/api/*` request.

1. **Neon** (database): create a project, copy the **pooled** and **direct** connection strings. Create the tables once:
   ```bash
   cd server
   DIRECT_DATABASE_URL="<direct string>" npx prisma migrate deploy
   ```
2. **Upstash** (shared rate limits): create a free Redis database, copy the REST URL and token.
3. **Vercel**: Add New → Project → import this GitHub repo (framework: Other; settings come from `vercel.json`).
   Environment variables (Production): everything from `server/.env.example` with real values, plus:
   - `NODE_ENV=production`
   - `CLIENT_URL=https://<your-app>.vercel.app`
   - `DATABASE_URL` = Neon **pooled** string, `DIRECT_DATABASE_URL` = Neon **direct** string
   - `VITE_GOOGLE_CLIENT_ID` = same as `GOOGLE_CLIENT_ID`
   - do **not** set `VITE_API_URL` (the app then calls `/api` on its own address)
4. After the first deploy, allow the live address:
   - Google Cloud → OAuth client → Authorized JavaScript origins → add `https://<your-app>.vercel.app`
   - Backblaze bucket browser rule (CORS) → add `https://<your-app>.vercel.app`
