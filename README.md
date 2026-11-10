# MeetApp

A simple video meeting app (like Google Meet) with live captions, recording and AI meeting notes (coming in later phases).
See [PLAN.md](PLAN.md) for the full plan and progress.

## Run it locally

You need **Node.js 22+** and **PostgreSQL** installed on your computer.

1. In `server/.env` (copy `server/.env.example`), set your local Postgres login in:
   - `DATABASE_URL` → database `meetapp` (for development)
   - `TEST_DATABASE_URL` → database `meetapp_test` (tests only; tests change its data)
2. Create the tables and start the backend:
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

The live site uses **Neon**; to update its tables after adding a migration, run `npm run db:deploy:prod` in `server`
(uses `PROD_DIRECT_DATABASE_URL` from `server/.env`).

## Useful commands

| Where | Command | What it does |
|---|---|---|
| server | `npm test` | API tests (uses `TEST_DATABASE_URL`, never Neon) |
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
