//this is bot for tel
//this is very important
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('Missing TELEGRAM_BOT_TOKEN in .env');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// Tracked symbols and CoinGecko IDs
const TRACKED_SYMBOLS = ['BTC', 'ETH', 'SOL', 'USDC', 'USDT', 'RAY'];
const COINGECKO_IDS = ['bitcoin', 'ethereum', 'solana', 'usd-coin', 'tether', 'raydium'];

const chatIntervals = new Map();

async function fetchCoinGeckoPrices() {
  const ids = COINGECKO_IDS.join(',');
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;

  const { data } = await axios.get(url, { timeout: 15_000 });

  console.log(data,'data')
  return data;
}

function formatTwoWayLine(symbol, mid) {
  if (typeof mid !== 'number' || !isFinite(mid)) return `${symbol}: N/A`;
  const spreadBps = 10;
  const bid = mid * (1 - spreadBps / 10_000);
  const ask = mid * (1 + spreadBps / 10_000);
  return `${symbol}: bid $${bid.toFixed(2)} | ask $${ask.toFixed(2)} (mid $${mid.toFixed(2)})`;
}

async function buildPricesMessage() {
  try {
    const prices = await fetchCoinGeckoPrices();
    const lines = COINGECKO_IDS.map((id, i) => {
      const symbol = TRACKED_SYMBOLS[i];
      const mid = prices[id]?.usd;
      return typeof mid === 'number' ? formatTwoWayLine(symbol, mid) : `${symbol}: N/A`;
    });
    const ts = new Date().toLocaleString();
    return `Crypto prices (USD) via CoinGecko\n${lines.join('\n')}\nUpdated: ${ts}`;
  } catch (err) {
    console.error('fetch/pricing error:', err?.message || err);
    return 'Error fetching prices from CoinGecko.';
  }
}

function startForChat(chatId) {
  if (chatIntervals.has(chatId)) return false;
  const intervalId = setInterval(async () => {
    const message = await buildPricesMessage();
    bot.sendMessage(chatId, message);
  }, 180_000);
  chatIntervals.set(chatId, intervalId);
  return true;
}

function stopForChat(chatId) {
  const interval = chatIntervals.get(chatId);
  if (!interval) return false;
  clearInterval(interval);
  chatIntervals.delete(chatId);
  return true;
}

function mainMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'Start', callback_data: 'START' },
          { text: 'Stop', callback_data: 'STOP' },
          { text: 'Update Now', callback_data: 'UPDATE' },
        ],
      ],
    },
  };
}

bot.onText(/\/start/i, async (msg) => {
  const chatId = msg.chat.id;
  const started = startForChat(chatId);
  const message = await buildPricesMessage();
  bot.sendMessage(chatId, message, mainMenu());
  if (!started) {
    bot.sendMessage(chatId, 'Already running auto-updates every 3 minutes.', mainMenu());
  } else {
    bot.sendMessage(chatId, 'Auto-updates started. Use Stop to end.', mainMenu());
  }
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const action = query.data;
  if (action === 'START') {
    const started = startForChat(chatId);
    bot.answerCallbackQuery(query.id, { text: started ? 'Started' : 'Already running', show_alert: false });
    const message = await buildPricesMessage();
    bot.sendMessage(chatId, message, mainMenu());
  } else if (action === 'STOP') {
    const stopped = stopForChat(chatId);
    bot.answerCallbackQuery(query.id, { text: stopped ? 'Stopped' : 'Not running', show_alert: false });
    bot.sendMessage(chatId, 'Auto-updates stopped.', mainMenu());
  } else if (action === 'UPDATE') {
    bot.answerCallbackQuery(query.id, { text: 'Refreshing…', show_alert: false });
    const message = await buildPricesMessage();
    bot.sendMessage(chatId, message, mainMenu());
  } else {
    bot.answerCallbackQuery(query.id);
  }
});

bot.onText(/\/stop/i, (msg) => {
  const chatId = msg.chat.id;
  const stopped = stopForChat(chatId);
  bot.sendMessage(chatId, stopped ? 'Stopped.' : 'Not running.', mainMenu());
});

console.log('Telegram bot is running with polling…');
