# BharathComic — One-click deploy script for Windows Lightsail
# Run this in PowerShell as Administrator on the server
# Usage: .\deploy.ps1

$ErrorActionPreference = "Stop"
$REPO_URL = "https://github.com/haiocreationcorp-dev/Abinesh_work.git"
$APP_DIR  = "C:\BharathComic"
$PG_BIN   = "C:\Program Files\PostgreSQL\16\bin"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  BharathComic Deploy Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Check Node.js ──────────────────────────────────────────────────────────
Write-Host "[1/8] Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVer = node -v 2>&1
    Write-Host "      Node $nodeVer found." -ForegroundColor Green
} catch {
    Write-Host "      Node.js not found. Please install from https://nodejs.org (LTS)" -ForegroundColor Red
    Write-Host "      After installing, re-run this script." -ForegroundColor Red
    exit 1
}

# ── 2. Check / Clone or Pull repo ─────────────────────────────────────────────
Write-Host "[2/8] Syncing code from GitHub..." -ForegroundColor Yellow
if (Test-Path "$APP_DIR\.git") {
    Set-Location $APP_DIR
    git pull origin main
    Write-Host "      Code updated." -ForegroundColor Green
} else {
    Write-Host "      Cloning repo to $APP_DIR ..." -ForegroundColor Yellow
    git clone $REPO_URL $APP_DIR
    Set-Location $APP_DIR
    Write-Host "      Clone complete." -ForegroundColor Green
}

# ── 3. Check .env ─────────────────────────────────────────────────────────────
Write-Host "[3/8] Checking .env file..." -ForegroundColor Yellow
$envFile = "$APP_DIR\server\.env"
if (-not (Test-Path $envFile)) {
    Write-Host ""
    Write-Host "  .env file not found at $envFile" -ForegroundColor Red
    Write-Host "  Please create it with these values:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host '  DATABASE_URL="postgresql://bharatuser:PASSWORD@localhost:5432/bharatcomic"'
    Write-Host '  JWT_SECRET="run: node -e ""console.log(require(''crypto'').randomBytes(64).toString(''hex''))"""'
    Write-Host '  SITE_GATE_PASSWORD="your-site-password"'
    Write-Host '  PORT=3000'
    Write-Host '  NODE_ENV=production'
    Write-Host ""
    Write-Host "  After creating .env, re-run this script." -ForegroundColor Yellow
    exit 1
}
Write-Host "      .env found." -ForegroundColor Green

# ── 4. Install server dependencies ────────────────────────────────────────────
Write-Host "[4/8] Installing server dependencies..." -ForegroundColor Yellow
Set-Location "$APP_DIR\server"
npm install --production
Write-Host "      Server deps installed." -ForegroundColor Green

# ── 5. Backup, then Prisma generate + db push ─────────────────────────────────
Write-Host "[5/8] Backing up database before touching schema..." -ForegroundColor Yellow
npm run backup:all
Write-Host "      Backup complete." -ForegroundColor Green
Write-Host "      Setting up database schema..." -ForegroundColor Yellow
npx prisma generate
# No --accept-data-loss: this fails loudly instead of silently dropping data if the
# diff includes a destructive change. If it fails, back up (already done above),
# review the diff yourself, and decide whether --accept-data-loss is really warranted.
npx prisma db push
Write-Host "      Database schema ready." -ForegroundColor Green

# ── 6. Build React client ─────────────────────────────────────────────────────
Write-Host "[6/8] Building React client..." -ForegroundColor Yellow
Set-Location "$APP_DIR\client"
npm install
npm run build
Write-Host "      Client built to client/dist/" -ForegroundColor Green

# ── 7. Install PM2 if missing, then (re)start app ────────────────────────────
Write-Host "[7/8] Starting server with PM2..." -ForegroundColor Yellow
$pm2Check = npm list -g pm2 2>&1
if ($pm2Check -notmatch "pm2") {
    Write-Host "      Installing PM2 globally..." -ForegroundColor Yellow
    npm install -g pm2
    npm install -g pm2-windows-startup
    pm2-startup install
}
Set-Location "$APP_DIR\server"
# Stop existing instance if running, ignore error if not
pm2 stop bharatcomic 2>$null
pm2 delete bharatcomic 2>$null
# `pm2 start npm -- start` has crash-looped on this box before (npm.cmd executed as
# JS). Start src/index.js directly instead — equivalent to what `npm start` runs anyway.
pm2 start src/index.js --name "bharatcomic"
pm2 save
Write-Host "      Server started." -ForegroundColor Green

# ── 8. Print summary ──────────────────────────────────────────────────────────
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Deploy complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Local:   http://localhost:3000" -ForegroundColor White
$ip = (Invoke-WebRequest -Uri "http://checkip.amazonaws.com" -UseBasicParsing).Content.Trim()
Write-Host "  Public:  http://${ip}:3000" -ForegroundColor White
Write-Host ""
Write-Host "  Commands:" -ForegroundColor Yellow
Write-Host "    pm2 status              -> check if running"
Write-Host "    pm2 logs bharatcomic    -> view live logs"
Write-Host "    pm2 restart bharatcomic -> restart after changes"
Write-Host ""
Write-Host "  Don't forget to open port 3000 in Lightsail Networking!" -ForegroundColor Yellow
Write-Host ""
