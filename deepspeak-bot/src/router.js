// Простой роутер по вашей спецификации (без БД).
// Модели: "gpt-5" → gpt-4o, "gpt-5-nano" → gpt-4o-mini.

const LIMITS = {
  FREE:  { in: 2000, out: 300 },
  LITE:  { in: 4000, out: 600 },
  ELITE: { in: 8000, out: 800 }
};

const MODEL_MAP = {
  'gpt-5': 'gpt-4o',
  'gpt-5-nano': 'gpt-4o-mini',
  'gpt-4o': 'gpt-4o',
  '4o-mini': 'gpt-4o-mini'
};

function tokensRough(text) {
  const words = (text || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * 1.3);
}

export function chooseRoute({ tier, text }) {
  const needSearch = /сегодня|цена|курс|новости|релиз|расписание/i.test(text) && tier === 'ELITE';
  const isShort = tokensRough(text) <= 200;
  const complex = /код|sql|алгоритм|архитектур|таблиц/i.test(text) ? 'high' : 'low';

  let model = 'gpt-5-nano'; // дефолт
  if (tier === 'FREE') {
    model = 'gpt-5-nano';
  } else if (tier === 'LITE') {
    if (isShort) model = 'gpt-5-nano';
    else if (complex === 'high') model = 'gpt-4o';
    else model = '4o-mini';
  } else {
    // ELITE
    if (isShort) model = 'gpt-5-nano';
    else if (complex === 'high') model = 'gpt-5';
    else model = 'gpt-4o';
  }

  const apiModel = MODEL_MAP[model] || 'gpt-4o-mini';
  const outMax = LIMITS[tier]?.out ?? 300;

  const banners = [];
  if (tier === 'FREE') banners.push('Короткие ответы, без онлайн-поиска. Для медиа/поиска — LITE/ELITE.');
  if (tier === 'ELITE') banners.push(`Онлайн-поиск: ${needSearch ? 'вкл' : 'выкл'}.`);

  return { model, apiModel, outMax, banners };
}
