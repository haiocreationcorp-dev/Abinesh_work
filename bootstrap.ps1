# BharathComic — Full bootstrap for a fresh Windows Lightsail server
# Run ONE line in PowerShell (Admin) on the server:
#   irm https://raw.githubusercontent.com/haiocreationcorp-dev/Abinesh_work/main/bootstrap.ps1 | iex

$ErrorActionPreference = "Stop"
$PG_PASS   = "BharathComic@2024!"   # PostgreSQL superuser password
$APP_PASS  = "BharathComic@2024!"   # same for simplicity — change if you like
$JWT       = [System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(64))
$SITE_PASS = "bharath2024"          # password users type to enter the site
$PORT      = 3000
$REPO      = "https://github.com/haiocreationcorp-dev/Abinesh_work.git"
$APP_DIR   = "C:\BharathComic"

function Say($msg, $col="Cyan") { Write-Host $msg -ForegroundColor $col }

Say "`n============================================"
Say "  BharathComic — Full Server Bootstrap"
Say "============================================`n"

# ── Chocolatey ────────────────────────────────────────────────────────────────
Say "[1/7] Installing Chocolatey package manager..."
if (-not (Get-Command choco -ErrorAction SilentlyContinue)) {
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    $env:Path += ";C:\ProgramData\chocolatey\bin"
}
Say "  Chocolatey ready." "Green"

# ── Node.js ───────────────────────────────────────────────────────────────────
Say "[2/7] Installing Node.js LTS..."
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    choco install nodejs-lts -y --no-progress
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}
Say "  Node $(node -v) ready." "Green"

# ── Git ───────────────────────────────────────────────────────────────────────
Say "[3/7] Installing Git..."
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    choco install git -y --no-progress
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}
Say "  Git ready." "Green"

# ── PostgreSQL ────────────────────────────────────────────────────────────────
Say "[4/7] Installing PostgreSQL 16..."
$pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue
if (-not $pgService) {
    choco install postgresql16 --params "/Password:$PG_PASS" -y --no-progress
    $env:Path += ";C:\Program Files\PostgreSQL\16\bin"
    Start-Sleep -Seconds 5
}
$env:PGPASSWORD = $PG_PASS
# Create DB + user
$pgBin = (Get-ChildItem "C:\Program Files\PostgreSQL" -Directory | Sort-Object Name -Descending | Select-Object -First 1).FullName + "\bin"
$env:Path += ";$pgBin"
Say "  PostgreSQL ready. Creating database..." "Green"
& "$pgBin\psql.exe" -U postgres -c "CREATE DATABASE bharatcomic;" 2>$null
& "$pgBin\psql.exe" -U postgres -c "CREATE USER bharatuser WITH PASSWORD '$APP_PASS';" 2>$null
& "$pgBin\psql.exe" -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE bharatcomic TO bharatuser;" 2>$null
& "$pgBin\psql.exe" -U postgres -d bharatcomic -c "GRANT ALL ON SCHEMA public TO bharatuser;" 2>$null
Say "  Database bharatcomic ready." "Green"

# ── Clone / pull code ─────────────────────────────────────────────────────────
Say "[5/7] Downloading BharathComic code from GitHub..."
if (Test-Path "$APP_DIR\.git") {
    Set-Location $APP_DIR; git pull origin main
} else {
    git clone $REPO $APP_DIR
    Set-Location $APP_DIR
}
Say "  Code downloaded." "Green"

# ── Write .env ────────────────────────────────────────────────────────────────
Say "[6/7] Writing .env configuration..."
$envContent = @"
DATABASE_URL="postgresql://bharatuser:$APP_PASS@localhost:5432/bharatcomic"
JWT_SECRET="$JWT"
SITE_GATE_PASSWORD="$SITE_PASS"
PORT=$PORT
NODE_ENV=production
"@
$envContent | Out-File -FilePath "$APP_DIR\server\.env" -Encoding utf8 -Force
Say "  .env written." "Green"

# ── Install deps + build + start ──────────────────────────────────────────────
Say "[7/7] Installing dependencies, building, and starting server..."

# Server deps
Set-Location "$APP_DIR\server"
npm install --production 2>&1 | Select-String -NotMatch "warn|npm notice" | ForEach-Object { Write-Host $_ }
npx prisma generate
npx prisma db push --accept-data-loss

# Client build
Set-Location "$APP_DIR\client"
npm install 2>&1 | Select-String -NotMatch "warn|npm notice" | ForEach-Object { Write-Host $_ }
npm run build

# PM2
if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
    npm install -g pm2 pm2-windows-startup
    pm2-startup install
}
Set-Location "$APP_DIR\server"
pm2 stop bharatcomic 2>$null; pm2 delete bharatcomic 2>$null
pm2 start npm --name "bharatcomic" -- start
pm2 save

# Windows Firewall — allow port 3000
New-NetFirewallRule -DisplayName "BharathComic port 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -ErrorAction SilentlyContinue | Out-Null

# ── Summary ───────────────────────────────────────────────────────────────────
$pubIp = (Invoke-WebRequest "http://checkip.amazonaws.com" -UseBasicParsing).Content.Trim()
Say "`n============================================" "Green"
Say "  SUCCESS! BharathComic is live." "Green"
Say "============================================" "Green"
Say "`n  URL:  http://${pubIp}:${PORT}" "White"
Say "  Site password:  $SITE_PASS" "Yellow"
Say "`n  IMPORTANT — also open port $PORT in Lightsail console:" "Yellow"
Say "  Networking tab -> Add rule -> TCP $PORT`n" "Yellow"
Say "  To update later:  cd $APP_DIR; git pull; .\deploy.ps1" "White"
