# Updating the production server (Lightsail)

Two ways to pull the latest code onto `C:\BharathComic` and get it live.

## Option A — one-click (recommended)

From `C:\BharathComic`, as Administrator:

```powershell
.\deploy.ps1
```

This chains everything in the right order: git pull, `.env` check, `npm install`,
**database backup**, `prisma generate` + `db push`, client build, and a PM2 restart.
It backs up the database *before* touching the schema — safer than doing the steps
by hand and forgetting one.

## Option B — manual, step by step

```powershell
# 1. Pull latest code
cd C:\BharathComic
git pull origin main

# 2. Install any new server dependencies
cd C:\BharathComic\server
npm install --production

# 3. Apply any schema changes
npx prisma generate
npx prisma db push

# 4. Rebuild the client (UI changes won't show up otherwise)
cd C:\BharathComic\client
npm install
npm run build

# 5. Restart the app with the refreshed environment
cd C:\BharathComic\server
pm2 restart bharatcomic --update-env
```

**Note:** `git pull` never touches `server\.env` (it's gitignored) — if you changed
`CLIENT_URL`, `DATABASE_URL`, etc. by hand, make sure those edits are still in place.

**Always use `--update-env` on the PM2 restart** if `.env` changed — a plain
`pm2 restart` reuses the environment PM2 cached from when the process first started
and will *not* pick up `.env` edits.

## Verifying it worked

```powershell
pm2 status                              # should show "online"
pm2 logs bharatcomic --lines 30 --nostream   # check for errors on boot
```

Then load the site in a browser and open DevTools → Console. Look for:

- **CORS / 500 errors on every asset** → `CLIENT_URL` in `server\.env` doesn't match
  the URL you're browsing (protocol + host + port must match exactly, e.g.
  `http://13.234.72.92:3000`).
- **`pg_dump` / database connection errors** → check `DATABASE_URL` in `server\.env`.
  If the password contains `@`, `:`, `/`, or other URL-special characters, they must
  be percent-encoded (e.g. `@` → `%40`) or the connection string parses wrong.

## Known gotchas on this box

- `pm2 start npm -- start` has crash-looped here before (tries to execute `npm.cmd`
  as JavaScript). Always start the app directly instead:
  `pm2 start src/index.js --name bharatcomic` (already what `deploy.ps1` does).
- Lightsail firewall rules are **not** part of a snapshot — re-add them by hand on
  any new instance created from one.
- See `CLAUDE.md` in the repo root for full database-safety rules before running
  anything that touches Prisma/Postgres directly.
