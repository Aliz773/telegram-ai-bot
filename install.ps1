# نصب خودکار Telegram AI Bot روی Cloudflare Workers — ویندوز (PowerShell)

Write-Host "=== نصب خودکار Telegram AI Bot ===" -ForegroundColor Cyan
Write-Host ""

if (-not $env:CLOUDFLARE_API_TOKEN) {
    $secureToken = Read-Host "توکن API کلادفلر رو وارد کن (با دسترسی Edit Cloudflare Workers)" -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    $env:CLOUDFLARE_API_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
}

$secureSetupPassword = Read-Host "یه رمز عبور برای صفحه‌ی تنظیمات (SETUP_PASSWORD) انتخاب کن" -AsSecureString
$bstr2 = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureSetupPassword)
$setupPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr2)

if ([string]::IsNullOrWhiteSpace($setupPassword)) {
    Write-Host "رمز عبور نمی‌تونه خالی باشه." -ForegroundColor Red
    exit 1
}

function New-RandomHex($byteCount) {
    $bytes = New-Object byte[] $byteCount
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    -join ($bytes | ForEach-Object { $_.ToString("x2") })
}

Write-Host "[1/5] نصب پکیج‌ها..." -ForegroundColor Yellow
npm install --silent

Write-Host "[2/5] چک کردن KV namespace..." -ForegroundColor Yellow
$tomlContent = Get-Content wrangler.toml -Raw
if ($tomlContent -match "REPLACE_WITH_YOUR_KV_NAMESPACE_ID") {
    $kvOutput = npx wrangler kv namespace create BOT_KV 2>&1 | Out-String
    Write-Host $kvOutput
    if ($kvOutput -match 'id = "([a-f0-9]+)"') {
        $kvId = $matches[1]
        (Get-Content wrangler.toml) -replace "REPLACE_WITH_YOUR_KV_NAMESPACE_ID", $kvId | Set-Content wrangler.toml
        Write-Host "✅ KV ID تنظیم شد: $kvId" -ForegroundColor Green
    } else {
        Write-Host "❌ نتونستم KV ID رو خودکار پیدا کنم. خروجی بالا رو نگاه کن و دستی تو wrangler.toml جایگزین کن." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "✅ KV از قبل تنظیم شده، رد شدیم." -ForegroundColor Green
}

Write-Host "[3/5] ساخت و ست‌کردن secretها..." -ForegroundColor Yellow
$encryptionKey = New-RandomHex 32
$webhookSecret = New-RandomHex 24

$encryptionKey | npx wrangler secret put ENCRYPTION_KEY
$setupPassword | npx wrangler secret put SETUP_PASSWORD
$webhookSecret | npx wrangler secret put WEBHOOK_SECRET

Write-Host "[4/5] دیپلوی..." -ForegroundColor Yellow
$deployOutput = npx wrangler deploy 2>&1 | Out-String
Write-Host $deployOutput

$workerUrl = $null
if ($deployOutput -match '(https://[a-zA-Z0-9.\-]+\.workers\.dev)') {
    $workerUrl = $matches[1]
}

if (-not $workerUrl) {
    Write-Host "❌ دیپلوی ناموفق بود یا آدرس پیدا نشد. خروجی بالا رو چک کن." -ForegroundColor Red
    exit 1
}

Write-Host "[5/5] آماده‌سازی نهایی..." -ForegroundColor Yellow
Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "✅ نصب کامل شد!" -ForegroundColor Green
Write-Host "آدرس Worker شما: $workerUrl"
Write-Host ""
Write-Host "مراحل باقی‌مونده:"
Write-Host "۱. برو به: $workerUrl/setup"
Write-Host "   و با رمزی که همین الان انتخاب کردی وارد شو، بات‌توکن/API key/Base URL رو پر کن."
Write-Host "۲. بعدش این آدرس رو یه‌بار باز کن: $workerUrl/api/set-webhook"
Write-Host "======================================" -ForegroundColor Cyan
