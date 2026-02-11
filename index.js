// ==================== index.js ====================
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();
const path = require('path');

// 1. استيراد مكوناتنا المنظمة
const { initializeDatabase } = require('./bot/database');
const { setupBotHandlers } = require('./bot/handlers');

// 2. التحقق من وجود التوكن
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN || BOT_TOKEN === 'ضع_توكن_البوت_الذي_حصلت_عليه_من_BotFather_هنا') {
    console.error('❌ خطأ: لم يتم تعيين BOT_TOKEN في ملف .env');
    process.exit(1);
}

// 3. إنشاء كائن البوت
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log('🤖 جاري تشغيل البوت...');

// 4. تهيئة قاعدة البيانات ثم إعداد معالجات الأوامر
async function startBot() {
    try {
        const db = await initializeDatabase();
        console.log('✅ تم الاتصال بقاعدة البيانات');

        // تمرير كائنات البوت وقاعدة البيانات للمعالجات
        setupBotHandlers(bot, db);
        console.log('✅ تم إعداد معالجات الأوامر. البوت جاهز!');

    } catch (error) {
        console.error('❌ فشل في بدء البوت:', error);
        process.exit(1);
    }
}

// 5. بدء التشغيل
startBot();
