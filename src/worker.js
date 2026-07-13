import { encrypt, decrypt } from "./crypto.js";
import { validateBaseUrl } from "./security.js";
import { handleUpdate } from "./telegram.js";
import setupHtml from "../public/setup.html";

const KV_KEY = "bot_config";

async function loadConfig(env) {
  const raw = await env.BOT_KV.get(KV_KEY, "json");
  if (!raw) return null;
  return {
    botToken: await decrypt(raw.botToken, env.ENCRYPTION_KEY),
    apiKey: await decrypt(raw.apiKey, env.ENCRYPTION_KEY),
    baseUrl: raw.baseUrl,
    model: raw.model,
    botUsername: raw.botUsername,
    triggerWord: raw.triggerWord,
    systemPrompt: raw.systemPrompt || "",
    temperature: typeof raw.temperature === "number" ? raw.temperature : 0.7,
    maxTokens: typeof raw.maxTokens === "number" ? raw.maxTokens : 800,
    botId: raw.botId || null,
  };
}

async function handleSave(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "بدنه‌ی درخواست نامعتبره" }), { status: 400 });
  }

  if (!env.SETUP_PASSWORD || body.setupPassword !== env.SETUP_PASSWORD) {
    return new Response(JSON.stringify({ error: "رمز عبور اشتباهه" }), { status: 403 });
  }

  const {
    botToken, apiKey, baseUrl, model, botUsername, triggerWord,
    systemPrompt, temperature, maxTokens,
  } = body;

  if (!botToken || !apiKey || !baseUrl) {
    return new Response(JSON.stringify({ error: "فیلدهای اجباری خالی هستن" }), { status: 400 });
  }

  const check = validateBaseUrl(baseUrl);
  if (!check.valid) {
    return new Response(JSON.stringify({ error: check.reason }), { status: 400 });
  }

  // اگه config قبلی وجود داره، botId قبلی رو حفظ کن (با set-webhook دوباره پر میشه)
  const existingRaw = await env.BOT_KV.get(KV_KEY, "json");

  const record = {
    botToken: await encrypt(botToken, env.ENCRYPTION_KEY),
    apiKey: await encrypt(apiKey, env.ENCRYPTION_KEY),
    baseUrl: baseUrl.replace(/\/+$/, ""),
    model: model || "",
    botUsername: botUsername || "",
    triggerWord: triggerWord || "",
    systemPrompt: systemPrompt || "",
    temperature: temperature !== undefined && temperature !== "" ? parseFloat(temperature) : 0.7,
    maxTokens: maxTokens !== undefined && maxTokens !== "" ? parseInt(maxTokens, 10) : 800,
    botId: existingRaw?.botId || null,
  };

  await env.BOT_KV.put(KV_KEY, JSON.stringify(record));
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}

async function handleSetWebhook(request, env) {
  const config = await loadConfig(env);
  if (!config || !config.botToken) {
    return new Response("هنوز تنظیماتی ذخیره نشده", { status: 400 });
  }

  const workerUrl = new URL(request.url);
  const webhookUrl = `${workerUrl.origin}/webhook`;

  const res = await fetch(`https://api.telegram.org/bot${config.botToken}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: env.WEBHOOK_SECRET,
    }),
  });
  const data = await res.json();

  // شناسه‌ی خود بات رو می‌گیریم و ذخیره می‌کنیم تا بشه تشخیص داد "ریپلای به بات" یعنی چی
  const meRes = await fetch(`https://api.telegram.org/bot${config.botToken}/getMe`);
  const meData = await meRes.json();
  if (meData.ok) {
    const raw = await env.BOT_KV.get(KV_KEY, "json");
    raw.botId = meData.result.id;
    await env.BOT_KV.put(KV_KEY, JSON.stringify(raw));
  }

  return new Response(JSON.stringify({ webhook: data, bot: meData.result }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}

async function handleWebhook(request, env) {
  const secretHeader = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (secretHeader !== env.WEBHOOK_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  const config = await loadConfig(env);
  if (!config) return new Response("no config", { status: 200 });

  const update = await request.json();
  try {
    await handleUpdate(update, config, env);
  } catch (err) {
    console.error("handleUpdate error:", err);
  }
  return new Response("ok", { status: 200 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/setup" && request.method === "GET") {
      return new Response(setupHtml, { headers: { "Content-Type": "text/html; charset=UTF-8" } });
    }

    if (url.pathname === "/api/save" && request.method === "POST") {
      return handleSave(request, env);
    }

    if (url.pathname === "/api/set-webhook" && request.method === "GET") {
      return handleSetWebhook(request, env);
    }

    if (url.pathname === "/webhook" && request.method === "POST") {
      return handleWebhook(request, env);
    }

    return new Response("Telegram AI Bot Worker — برو به /setup", { status: 200 });
  },
};
