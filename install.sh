#!/usr/bin/env bash
# نصب خودکار Telegram AI Bot رو Cloudflare Workers
# برای: Termux / Linux / macOS
set -e

echo "=== نصب خودکار Telegram AI Bot ==="
echo

if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  read -rsp "توکن API کلادفلر رو وارد کن (با دسترسی Edit Cloudflare Workers): " CLOUDFLARE_API_TOKEN
  echo
  export CLOUDFLARE_API_TOKEN
fi

read -rsp "یه رمز عبور برای صفحه‌ی تنظیمات (SETUP_PASSWORD) انتخاب کن: " SETUP_PASSWORD
echo
if [ -z "$SETUP_PASSWORD" ]; then
  echo "رمز عبور نمی‌تونه خالی باشه."
  exit 1
fi

echo
echo "[۱/۵] نصب پکیج‌ها..."
npm install --silent

echo "[۲/۵] چک کردن KV namespace..."
if grep -q "REPLACE_WITH_YOUR_KV_NAMESPACE_ID" wrangler.toml; then
  KV_OUTPUT=$(npx wrangler kv namespace create BOT_KV 2>&1)
  echo "$KV_OUTPUT"
  KV_ID=$(echo "$KV_OUTPUT" | grep -oE 'id = "[a-f0-9]+"' | grep -oE '[a-f0-9]{32}' | head -1)
  if [ -z "$KV_ID" ]; then
    echo "❌ نتونستم KV ID رو خودکار پیدا کنم. خروجی بالا رو نگاه کن و دستی تو wrangler.toml جایگزین کن."
    exit 1
  fi
  sed -i.bak "s/REPLACE_WITH_YOUR_KV_NAMESPACE_ID/$KV_ID/" wrangler.toml
  echo "✅ KV ID تنظیم شد: $KV_ID"
else
  echo "✅ KV از قبل تنظیم شده، رد شدیم."
fi

echo "[۳/۵] ساخت و ست‌کردن secretها..."
ENCRYPTION_KEY=$(openssl rand -hex 32 2>/dev/null || head -c32 /dev/urandom | od -An -tx1 | tr -d ' \n')
WEBHOOK_SECRET=$(openssl rand -hex 24 2>/dev/null || head -c24 /dev/urandom | od -An -tx1 | tr -d ' \n')

echo "$ENCRYPTION_KEY" | npx wrangler secret put ENCRYPTION_KEY
echo "$SETUP_PASSWORD" | npx wrangler secret put SETUP_PASSWORD
echo "$WEBHOOK_SECRET" | npx wrangler secret put WEBHOOK_SECRET

echo "[۴/۵] دیپلوی..."
DEPLOY_OUTPUT=$(npx wrangler deploy 2>&1)
echo "$DEPLOY_OUTPUT"
WORKER_URL=$(echo "$DEPLOY_OUTPUT" | grep -oE 'https://[a-zA-Z0-9.-]+\.workers\.dev' | head -1)

if [ -z "$WORKER_URL" ]; then
  echo "❌ دیپلوی ناموفق بود یا آدرس پیدا نشد. خروجی بالا رو چک کن."
  exit 1
fi

echo "[۵/۵] فعال‌سازی وبهوک..."
echo "توجه: چون هنوز بات‌توکن/API key رو تو /setup وارد نکردی، این مرحله رو خودت بعداً دستی انجام بده."

echo
echo "======================================"
echo "✅ نصب کامل شد!"
echo "آدرس Worker شما: $WORKER_URL"
echo
echo "مراحل باقی‌مونده:"
echo "۱. برو به: $WORKER_URL/setup"
echo "   و با رمزی که همین الان انتخاب کردی وارد شو، بات‌توکن/API key/Base URL رو پر کن."
echo "۲. بعدش این آدرس رو یه‌بار باز کن: $WORKER_URL/api/set-webhook"
echo "======================================"
