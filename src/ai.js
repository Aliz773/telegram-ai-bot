// آداپتور عمومی OpenAI-compatible — با پشتیبانی از system prompt، حافظه‌ی مکالمه و پارامترهای پاسخ
export async function askAI({ baseUrl, apiKey, model, systemPrompt, history, prompt, temperature, maxTokens }) {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const endpoint = `${cleanBase}/chat/completions`;

  const messages = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  if (Array.isArray(history)) {
    for (const turn of history) {
      messages.push({ role: turn.role, content: turn.content });
    }
  }
  messages.push({ role: "user", content: prompt });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || "gpt-4o-mini",
        messages,
        temperature: typeof temperature === "number" ? temperature : 0.7,
        max_tokens: typeof maxTokens === "number" ? maxTokens : 800,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `خطای API (${res.status}): ${errText.slice(0, 200)}` };
    }

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content;
    if (!reply) {
      return { ok: false, error: "پاسخ نامعتبر از API" };
    }
    return { ok: true, reply };
  } catch (err) {
    if (err.name === "AbortError") {
      return { ok: false, error: "زمان پاسخ‌دهی API تموم شد" };
    }
    return { ok: false, error: `خطا در اتصال: ${err.message}` };
  } finally {
    clearTimeout(timeout);
  }
}

// لیست مدل‌های واقعاً موجود رو مستقیم از خود API provider می‌گیره (زنده، نه یه لیست ثابت که زود قدیمی میشه)
export async function listModels({ baseUrl, apiKey }) {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  try {
    const res = await fetch(`${cleanBase}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { ok: false };
    const data = await res.json();
    const ids = (data?.data || []).map((m) => m.id).filter(Boolean);
    return { ok: true, models: ids };
  } catch {
    return { ok: false };
  }
}
