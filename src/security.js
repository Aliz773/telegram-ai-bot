// جلوگیری از SSRF ساده: بلاک کردن IP/hostname های داخلی و اجبار HTTPS
// توجه: این چک روی خود متن hostname انجام میشه، نه بعد از DNS resolve
// (Workers دسترسی مستقیم به DNS resolve نداره) — یه لایه‌ی دفاعی پایه‌ست، نه کامل

const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^::1$/,
  /^\[?fc00:/i,
  /^\[?fe80:/i,
];

export function validateBaseUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { valid: false, reason: "آدرس نامعتبره" };
  }

  if (url.protocol !== "https:") {
    return { valid: false, reason: "فقط https مجازه" };
  }

  const hostname = url.hostname;
  for (const pattern of BLOCKED_HOST_PATTERNS) {
    if (pattern.test(hostname)) {
      return { valid: false, reason: "این آدرس مجاز نیست" };
    }
  }

  return { valid: true, url };
}
