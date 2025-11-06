// Telegram Webhook для Vercel (без Telegraf, без CLI)
// Хранение "тарифа" — в памяти инстанса (демо, может обнуляться при холодном старте)

import OpenAI from 'openai';
import { chooseRoute } from '../src/router.js';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DEFAULT_TIER = process.env.DEFAULT_TIER || 'FREE';
const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const userTier = new Map(); // userId -> 'FREE'|'LITE'|'ELITE' (эпhemeral)

async function tg(method, payload) {
  const r = await fetch(`${TG_API}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return r.json();
}

async function reply(chat_id, text, extra = {}) {
  return tg('sendMessage', { chat_id, text, parse_mode: 'HTML', ...extra });
}

function getTier(userId) {
  return userTier.get(userId) || DEFAULT_TIER;
}
function setTier(userId, tier) {
  userTier.set(userId, tier);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(200).json({ ok: true, hint: 'POST Telegram updates here', mini: '/mini' });
    return;
  }

  try {
    const update = req.body;

    // Обработка callback-кнопок "tier:*"
    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message?.chat?.id;
      const userId = String(cq.from?.id);
      const data = cq.data || '';
      if (data.startsWith('tier:')) {
        const tier = data.split(':')[1];
        setTier(userId, tier);
        await tg('answerCallbackQuery', { callback_query_id: cq.id, text: `Тариф: ${tier}` });
        if (chatId) await tg('editMessageText', { chat_id: chatId, message_id: cq.message.message_id, text: `Тариф переключён на ${tier}` });
      }
      res.status(200).json({ ok: true });
      return;
    }

    // Обычные сообщения
    if (update.message) {
      const msg = update.message;
      const chatId = msg.chat.id;
      const userId = String(msg.from.id);
      const text = msg.text || '';

      // Команды
      if (/^\/start/.test(text)) {
        await reply(chatId,
          'DeepSpeak: чат, медиа, голос.\n/tier — выбрать тариф (FREE/LITE/ELITE).\nПросто напиши вопрос.'
        );
        res.status(200).json({ ok: true });
        return;
      }
      if (/^\/tier/.test(text)) {
        const kb = {
          inline_keyboard: [[
            { text: 'FREE', callback_data: 'tier:FREE' },
            { text: 'LITE', callback_data: 'tier:LITE' },
            { text: 'ELITE', callback_data: 'tier:ELITE' }
          ]]
        };
        await reply(chatId, `Текущий тариф: ${getTier(userId)}. Выбери:`, { reply_markup: kb });
        res.status(200).json({ ok: true });
        return;
      }

      // Роутинг и вызов OpenAI
      const tier = getTier(userId);
      const { model, apiModel, outMax, banners } = chooseRoute({ tier, text });

      // Генерация ответа (минимум: chat.completions)
      let answer = '';
      try {
        const resp = await client.chat.completions.create({
          model: apiModel,
          messages: [
            { role: 'system', content: 'Отвечай кратко и по делу, на русском.' },
            { role: 'user', content: text }
          ],
          max_tokens: outMax,
          temperature: 0.4
        });
        answer = resp.choices?.[0]?.message?.content || '';
      } catch (e) {
        answer = 'Не получилось получить ответ от модели.';
      }

      const footer = `\n\n[${tier}] модель: ${model} → ${apiModel}, out≤${outMax}`;
      const banner = banners.length ? banners.join('\n') + '\n\n' : '';
      await reply(chatId, banner + answer + footer);
      res.status(200).json({ ok: true });
      return;
    }

    // Игнор всего остального
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(200).json({ ok: true }); // всегда 200, чтобы Telegram не ретраил до бесконечности
  }
}
