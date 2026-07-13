// رمزنگاری/رمزگشایی با AES-GCM — هیچ‌وقت توکن یا API key رو plaintext تو KV ذخیره نکن

async function getKey(secret) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", keyMaterial, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encrypt(plainText, secret) {
  if (!plainText) return "";
  const key = await getKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plainText));
  const cipherBytes = new Uint8Array(cipherBuf);
  const combined = new Uint8Array(iv.length + cipherBytes.length);
  combined.set(iv, 0);
  combined.set(cipherBytes, iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function decrypt(encoded, secret) {
  if (!encoded) return "";
  const key = await getKey(secret);
  const combined = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const cipherBytes = combined.slice(12);
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipherBytes);
  return new TextDecoder().decode(plainBuf);
}
