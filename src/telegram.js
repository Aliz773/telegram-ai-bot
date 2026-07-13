import { askAI, listModels } from "./ai.js";
import { getHafezFal } from "./fal.js";
import {
  getChatState,
  saveChatState,
  resetChatHistory,
  setChatModel,
  setChatPersona,
  setChatTemperature,
  setAwaiting,
  resetChatSettings,
} from "./chatstate.js";

const SPLIT_REGEX = /([\s.,!?؟،:؛])+/;
const MENU_BUTTON_TEXT = "⚙️ منو";
const TEMP_PRESETS = [
  { label: "🎯 دقیق", value: 0.2 },
  { label: "⚖️ متعادل", value: 0.7 },
  { label: "🎨 خلاق", value: 1.2 },
  { label: "🌪 خیلی خلاق", value: 1.8 },
];

function matchAndStrip(text, triggerWord) {
  const trigger = (triggerWord || "").trim();
  if (!trigger) return { found: false };
  const parts = text.split(SPLIT_REGEX).filter(Boolean);
  const found = parts.some((p) => p.trim() === trigger);
  if (!found) return { found: false };
  const cleaned = parts
    .filter((p) => p.trim() !== trigger)
    .join("")
    .trim();
  return { found: true, cleaned };
}

async function tg(botToken, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function sendMessage(botToken, chatId, text, extra = {}) {
  return tg(botToken, "sendMessage", { chat_id: chatId, text, ...extra });
}

async function isSenderAdmin(botToken, chatId, userId) {
  const result = await tg(botToken, "getChatMember", { chat_id: chatId, user_id: userId });
  const status = result?.result?.status;
  return status === "creator" || status === "administrator";
}

async function sendRootMenu(botToken, chatId, withPersistentButton = false) {
  const inlineKeyboard = [
    [{ text: "🤖 انتخاب مدل هوش‌مصنوعی", callback_data: "menu:models" }],
    [{ text: "🎭 تنظیم شخصیت بات", callback_data: "menu:persona" }],
    [{ text: "🌡 میزان خلاقیت پاسخ", callback_data: "menu:temp" }],
    [{ text: "📊 تنظیمات فعلی", callback_data: "menu:settings" }],
    [{ text: "🔮 فال حافظ", callback_data: "menu:fal" }],
    [{ text: "🧹 پاک‌کردن حافظه‌ی گفتگو", callback_data: "menu:reset_history" }],
    [{ text: "♻️ بازگشت به پیش‌فرض", callback_data: "menu:reset_settings" }],
  ];
  const extra = { reply_markup: { inline_keyboard: inlineKeyboard } };
  await sendMessage(botToken, chatId, "⚙️ چی می‌خوای تنظیم کنی؟", extra);

  if (withPersistentButton) {
    await sendMessage(botToken, chatId, "همیشه می‌تونی از دکمه‌ی پایین صفحه به این منو برگردی.", {
      reply_markup: {
        keyboard: [[{ text: MENU_BUTTON_TEXT }]],
        resize_keyboard: true,
      },
    });
  }
}

async function sendModelsMenu(env, config, chatId) {
  await sendMessage(config.botToken, chatId, "در حال گرفتن لیست مدل‌ها از API...");
  const result = await listModels({ baseUrl: config.baseUrl, apiKey: config.apiKey });

  let models = result.ok && result.models.length ? result.models : [];
  if (!models.length) {
    models = ["gemini-2.0-flash", "gemini-1.5-flash", "gpt-4o-mini"]; // fallback اگه provider لیست نده
  }
  models = models.slice(0, 30); // جلوگیری از کیبورد خیلی بزرگ

  const rows = [];
  for (let i = 0; i < models.length; i += 2) {
    const row = [{ text: models[i], callback_data: `setmodel:${models[i]}` }];
    if (models[i + 1]) row.push({ text: models[i + 1], callback_data: `setmodel:${models[i + 1]}` });
    rows.push(row);
  }
  rows.push([{ text: "🔙 بازگشت", callback_data: "menu:back" }]);

  await sendMessage(config.botToken, chatId, "یه مدل انتخاب کن:", {
    reply_markup: { inline_keyboard: rows },
  });
}

async function sendTempMenu(botToken, chatId) {
  const rows = TEMP_PRESETS.map((p) => [{ text: `${p.label} (${p.value})`, callback_data: `settemp:${p.value}` }]);
  rows.push([{ text: "🔙 بازگشت", callback_data: "menu:back" }]);
  await sendMessage(botToken, chatId, "میزان خلاقیت پاسخ رو انتخاب کن:", {
    reply_markup: { inline_keyboard: rows },
  });
}

async function sendCurrentSettings(env, config, chatId) {
  const state = await getChatState(env, chatId);
  const lines = [
    `مدل: ${state.model || config.model || "پیش‌فرض"}`,
    `شخصیت: ${state.persona || "پیش‌فرض (بدون شخصیت خاص)"}`,
    `خلاقیت: ${state.temperature ?? 0.7}`,
  ];
  await sendMessage(config.botToken, chatId, `📊 تنظیمات فعلی این چت:\n\n${lines.join("\n")}`, {
    reply_markup: { inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: "menu:back" }]] },
  });
}

async function handleFalCommand(botToken, chatId, replyToId) {
  const fal = await getHafezFal();
  if (!fal.ok) {
    await sendMessage(botToken, chatId, "الان نتونستم فال بگیرم، یه‌کم بعد امتحان کن 🙏", {
      reply_to_message_id: replyToId,
    });
    return;
  }
  let text = `🔮 فال شما:\n\n${fal.poem}`;
  if (fal.interpretation) text += `\n\nتعبیر: ${fal.interpretation}`;
  await sendMessage(botToken, chatId, text, { reply_to_message_id: replyToId });
}

async function handleKickCommand(config, message) {
  const { chat, from, reply_to_message } = message;
  if (!reply_to_message) {
    await sendMessage(config.botToken, chat.id, "باید رو پیام همون فرد ریپلای کنی و /kick بزنی.");
    return;
  }
  const senderIsAdmin = await isSenderAdmin(config.botToken, chat.id, from.id);
  if (!senderIsAdmin) {
    await sendMessage(config.botToken, chat.id, "فقط ادمین‌های گروه می‌تونن این دستور رو بزنن.");
    return;
  }
  const targetId = reply_to_message.from.id;
  await tg(config.botToken, "banChatMember", { chat_id: chat.id, user_id: targetId });
  await tg(config.botToken, "unbanChatMember", { chat_id: chat.id, user_id: targetId, only_if_banned: true });
  await sendMessage(config.botToken, chat.id, "✅ کاربر از گروه حذف شد.");
}

async function handlePromoteCommand(config, message) {
  const { chat, from, reply_to_message } = message;
  if (!reply_to_message) {
    await sendMessage(config.botToken, chat.id, "باید رو پیام همون فرد ریپلای کنی و /promote بزنی.");
    return;
  }
  const senderIsAdmin = await isSenderAdmin(config.botToken, chat.id, from.id);
  if (!senderIsAdmin) {
    await sendMessage(config.botToken, chat.id, "فقط ادمین‌های گروه می‌تونن این دستور رو بزنن.");
    return;
  }
  const targetId = reply_to_message.from.id;
  const result = await tg(config.botToken, "promoteChatMember", {
    chat_id: chat.id,
    user_id: targetId,
    can_manage_chat: true,
    can_delete_messages: true,
    can_restrict_members: true,
    can_invite_users: true,
    can_pin_messages: true,
  });
  if (result.ok) {
    await sendMessage(config.botToken, chat.id, "✅ کاربر ادمین شد.");
  } else {
    await sendMessage(config.botToken, chat.id, `❌ نشد: ${result.description || "خطای نامشخص"}`);
  }
}

export async function handleCallbackQuery(callbackQuery, env, config) {
  const data = callbackQuery.data || "";
  const chatId = callbackQuery.message.chat.id;

  await tg(config.botToken, "answerCallbackQuery", { callback_query_id: callbackQuery.id });

  if (data === "menu:back") {
    await sendRootMenu(config.botToken, chatId);
    return;
  }
  if (data === "menu:models") {
    await sendModelsMenu(env, config, chatId);
    return;
  }
  if (data === "menu:persona") {
    await setAwaiting(env, chatId, "persona");
    await sendMessage(
      config.botToken,
      chatId,
      "باشه، حالا فقط یه پیام بنویس و بفرست — همون میشه شخصیت بات. مثال:\n«تو یه دستیار شوخ‌طبع و خودمونی فارسی‌زبان هستی که کوتاه جواب می‌ده.»"
    );
    return;
  }
  if (data === "menu:temp") {
    await sendTempMenu(config.botToken, chatId);
    return;
  }
  if (data === "menu:settings") {
    await sendCurrentSettings(env, config, chatId);
    return;
  }
  if (data === "menu:fal") {
    await handleFalCommand(config.botToken, chatId);
    return;
  }
  if (data === "menu:reset_history") {
    await resetChatHistory(env, chatId);
    await sendMessage(config.botToken, chatId, "حافظه‌ی این چت پاک شد. 🧹", {
      reply_markup: { inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: "menu:back" }]] },
    });
    return;
  }
  if (data === "menu:reset_settings") {
    await resetChatSettings(env, chatId);
    await sendMessage(config.botToken, chatId, "✅ مدل، شخصیت و خلاقیت به حالت پیش‌فرض برگشت.", {
      reply_markup: { inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: "menu:back" }]] },
    });
    return;
  }
  if (data.startsWith("setmodel:")) {
    const model = data.slice("setmodel:".length);
    await setChatModel(env, chatId, model);
    await sendMessage(config.botToken, chatId, `✅ از این به بعد از مدل «${model}» استفاده می‌کنم.`, {
      reply_markup: { inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: "menu:back" }]] },
    });
    return;
  }
  if (data.startsWith("settemp:")) {
    const value = parseFloat(data.slice("settemp:".length));
    await setChatTemperature(env, chatId, value);
    await sendMessage(config.botToken, chatId, `✅ میزان خلاقیت رو ${value} تنظیم کردم.`, {
      reply_markup: { inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: "menu:back" }]] },
    });
    return;
  }
}

export async function handleUpdate(update, config, env) {
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query, env, config);
    return;
  }

  const message = update.message;
  if (!message) return;

  const chatId = message.chat.id;
  const isPrivate = message.chat.type === "private";
  const text = message.text || "";

  if (isPrivate) {
    if (text === "/start" || text === MENU_BUTTON_TEXT) {
      await sendRootMenu(config.botToken, chatId, text === "/start");
      return;
    }

    // اگه منتظر ورودی شخصیت هستیم، این پیام رو به‌عنوان شخصیت ذخیره کن، نه یه سوال عادی
    const state = await getChatState(env, chatId);
    if (state.awaiting === "persona" && text && !text.startsWith("/")) {
      await setChatPersona(env, chatId, text.trim());
      await sendMessage(config.botToken, chatId, "✅ شخصیت بات برای این چت تنظیم شد.", {
        reply_markup: { inline_keyboard: [[{ text: "🔙 بازگشت به منو", callback_data: "menu:back" }]] },
      });
      return;
    }
  }

  // ادمین‌کاری گروه (این‌ها عمداً دستور صریح موندن، نه دکمه، چون نیاز به ریپلای رو یه کاربر خاص دارن)
  if (text.startsWith("/kick")) {
    if (isPrivate) return;
    await handleKickCommand(config, message);
    return;
  }
  if (text.startsWith("/promote")) {
    if (isPrivate) return;
    await handlePromoteCommand(config, message);
    return;
  }
  if (text.startsWith("/fal")) {
    await handleFalCommand(config.botToken, chatId, message.message_id);
    return;
  }

  if (!text) return;

  let promptText = text;
  const isReplyToBot =
    message.reply_to_message && config.botId && message.reply_to_message.from?.id === config.botId;

  if (!isPrivate) {
    if (isReplyToBot) {
      promptText = text;
    } else {
      const { found, cleaned } = matchAndStrip(text, config.triggerWord);
      if (!found) return;
      if (!cleaned) {
        await sendMessage(config.botToken, chatId, "بله؟", { reply_to_message_id: message.message_id });
        return;
      }
      promptText = cleaned;
    }
  }

  const state = await getChatState(env, chatId);
  const modelToUse = state.model || config.model;
  const personaToUse = state.persona;
  const temperatureToUse = state.temperature ?? 0.7;

  const result = await askAI({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: modelToUse,
    systemPrompt: personaToUse,
    history: state.history,
    prompt: promptText,
    temperature: temperatureToUse,
    maxTokens: config.maxTokens,
  });

  if (!result.ok) {
    await sendMessage(config.botToken, chatId, `⚠️ ${result.error}`, {
      reply_to_message_id: message.message_id,
    });
    return;
  }

  state.history.push({ role: "user", content: promptText });
  state.history.push({ role: "assistant", content: result.reply });
  await saveChatState(env, chatId, state);

  await sendMessage(config.botToken, chatId, result.reply, { reply_to_message_id: message.message_id });
}
