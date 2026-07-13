const MAX_HISTORY_TURNS = 12;

function chatKey(chatId) {
  return `chat:${chatId}`;
}

export async function getChatState(env, chatId) {
  const raw = await env.BOT_KV.get(chatKey(chatId), "json");
  return raw || { history: [], model: null, persona: null, temperature: null, awaiting: null };
}

export async function saveChatState(env, chatId, state) {
  const trimmedHistory = state.history.slice(-MAX_HISTORY_TURNS * 2);
  await env.BOT_KV.put(chatKey(chatId), JSON.stringify({ ...state, history: trimmedHistory }));
}

export async function resetChatHistory(env, chatId) {
  const state = await getChatState(env, chatId);
  state.history = [];
  await saveChatState(env, chatId, state);
}

export async function setChatModel(env, chatId, model) {
  const state = await getChatState(env, chatId);
  state.model = model;
  await saveChatState(env, chatId, state);
}

export async function setChatPersona(env, chatId, persona) {
  const state = await getChatState(env, chatId);
  state.persona = persona;
  state.awaiting = null;
  await saveChatState(env, chatId, state);
}

export async function setChatTemperature(env, chatId, temperature) {
  const state = await getChatState(env, chatId);
  state.temperature = temperature;
  await saveChatState(env, chatId, state);
}

export async function setAwaiting(env, chatId, awaiting) {
  const state = await getChatState(env, chatId);
  state.awaiting = awaiting;
  await saveChatState(env, chatId, state);
}

export async function resetChatSettings(env, chatId) {
  const state = await getChatState(env, chatId);
  state.model = null;
  state.persona = null;
  state.temperature = null;
  state.awaiting = null;
  await saveChatState(env, chatId, state);
}
