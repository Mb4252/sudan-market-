const { Telegraf } = require('telegraf');
const BOT_TOKEN = process.env.BOT_TOKEN;

const bot = new Telegraf(BOT_TOKEN);

bot.start((ctx) => ctx.reply('✅ البوت يعمل! مرحباً بك'));
bot.launch();

console.log('Bot is running');
