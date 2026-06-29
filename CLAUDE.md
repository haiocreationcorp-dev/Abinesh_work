# BharathComic

Full-stack comic creation platform. React client (`client/`) + Express/Prisma/Postgres server (`server/`).

## Database safety — read before touching Prisma or Postgres

On 2026-06-26, running `prisma migrate diff --shadow-database-url <DATABASE_URL>` against the **live** database (instead of a disposable scratch DB) wiped every table — all Users, Assets, Comics, Panels, Expressions, CharacterPresets, FacePartAlignments, LightingPresets. There was no backup. Recovery only worked because the uploaded image *files* on disk in `server/uploads/` were untouched (only DB rows referencing them were lost), and `LightingPreset` self-heals from a hardcoded default list (`server/src/controllers/lightingPresetController.js`).

**Rules going forward:**

1. **Never pass `--shadow-database-url` pointing at the real `DATABASE_URL`.** If a shadow DB is needed, it must be a separate, disposable database. If unsure whether one exists, ask the user first rather than improvising — don't substitute the production URL "just to see the diff."
2. **Before running any command that can alter or drop schema/data** (`prisma migrate dev/reset/resolve`, `prisma db push`, `prisma db execute`, `prisma migrate diff` with a shadow DB, raw `DROP`/`TRUNCATE`/`DELETE` SQL, etc.), show the user the exact command and what it touches, and wait for explicit confirmation — even if a broader task was already approved.
3. **Prefer `prisma migrate dev` run interactively by the user** over `db push` for schema changes, so changes stay tracked in `server/prisma/migrations/`. Note: this project's migration history is already missing several past schema changes (they were applied via `db push` without a migration file) — be aware the migration folder doesn't fully reflect the live schema.
4. **Back up before risky schema work.** Run `npm run backup:all` from `server/` before any migration/push — it chains all four: `db:backup` (pg_dump, full schema+data, includes the `skinThresholds` masking column), `db:export` (JSON snapshot of all tables), `files:backup` (updates `server/backups/uploads/uploads.zip` — the actual asset image files; pg_dump never touches the filesystem, so this is the only thing that covers them), and `env:backup` (copies `.env` — without this, restoring the DB+files is useless if `DATABASE_URL`/`JWT_SECRET`/`SITE_GATE_PASSWORD` are also gone). `files:backup` uses `Compress-Archive -Update` against one persistent zip, so each run only adds/overwrites changed files instead of duplicating unchanged content. Scripts live in `server/scripts/`.
5. A Windows Scheduled Task ("BharathComic Backup Prompt") pops up every 4 hours asking to run the full chain — it only acts if the user clicks Yes. There's also a manual 💾 "Backup Now" button (red) in the Admin Panel header that does the same via `POST /api/admin/backup`. Don't remove or silence either without being asked. Backups are written to `server/backups/` (git-ignored — contains credentials/password hashes/secrets in plaintext, never commit it).
6. **Restoring:** `npm run db:restore:test` and `npm run files:restore:test` restore the latest backup into a disposable database / disposable folder, print a comparison against live, then clean up — they never touch the real database or `uploads/`. Run these after any backup-script change to prove the backups are actually valid, not just "created". To do a real restore (destructive — overwrites the live DB or `uploads/`), run `node scripts/restoreDb.js --live --i-understand` / `node scripts/restoreUploads.js --live --i-understand` — both flags are required on purpose, and this should only ever be run with the user's explicit go-ahead.
7. **Known remaining gap:** all backups live on this one machine/disk (`server/backups/`). A full disk failure, or deleting the whole project folder, takes the backups down too — there's no off-site/cloud copy. Mention this if the user asks "is everything covered now."

## Syncing the asset library across machines (e.g. with a collaborator)

Cloning the GitHub repo gives you the **code** and the **asset image files** (`server/uploads/`), but **not the database** — Postgres is local to each machine and is never pushed. Without the matching DB rows, Browse Assets/Outfit/Pose/Expression pickers would show nothing even though the files exist on disk.

To keep a second machine's asset library (names, tags, gender, view, eyeType/mouthType, costume, poseType, CharacterPresets, Expressions, FacePartAlignments) in sync via git, **without** ever committing secrets:

- `npm run data:export` (from `server/`) writes `server/data/asset-library.json` — just the Asset/CharacterPreset/Expression/FacePartAlignment tables, no User accounts/passwords, no personal Comic/Panel data. This file is **not** gitignored on purpose, so it travels with normal commits/pushes.
- **Run this before pushing whenever asset metadata changed** (new uploads, renames, alignment edits, new presets/expressions) — same spirit as the existing "ask before pushing about new assets" rule, just for the DB side now.
- The other machine runs `npm run data:import` (after `git pull`) to upsert that JSON into their own local Postgres — safe to re-run repeatedly, matches by `id` so nothing duplicates.
- This is a one-way deliberate snapshot, not live replication — if both machines edit assets independently between syncs, the next export/import simply overwrites with whichever was last exported. Fine for a single-admin workflow; would need a real shared/cloud DB if both edit concurrently (worth revisiting once this runs in the cloud, per the user's stated direction — at that point everyone hits the same DB and this whole export/import dance goes away).

## Stack notes

- Client: React + Vite, dev server on :5173, proxies `/api` and `/uploads` to the server on :3000.
- Server: Express + Prisma + Postgres. `.env` has `DATABASE_URL`, `JWT_SECRET`, `SITE_GATE_PASSWORD`.
- Asset categories: FACE_PART, FACE_TEMPLATE, BODY_POSE, BACKGROUND, PROP, EFFECT, BUBBLE, SOUND. FACE_PART assets carry structured metadata (`partType`, `view`, `gender`); front/3-4 pairs of the same part share one `name`, distinguished by `view`.
- CORS allows `localhost`, any `192.168.x.x`/`10.x.x.x` origin on port 5173 (LAN/hotspot access), and `*.trycloudflare.com` tunnels.

## Deferred — revisit once the app is feature-complete

- **Auth tokens don't re-check the DB.** `server/src/middleware/auth.js` only verifies the JWT signature and trusts the embedded `{ id, email, role }` claims — it never re-queries the User table. This means a token keeps its original role until it naturally expires (`JWT_EXPIRES_IN`, currently 7d), even if the underlying user is deleted, demoted, or (as happened on 2026-06-26) the whole database is wiped and recreated. This is how admin access was recovered after the DB-wipe incident — a pre-existing token on another device still worked. Intentionally left as-is for now per the user; only worth changing (e.g. re-checking the DB per request, or adding a token-revocation/version check) once the app is otherwise feature-complete.
