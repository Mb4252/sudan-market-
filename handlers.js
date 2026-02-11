// ==================== bot/handlers.js ====================
const { getOrCreateUser, updateUserBalance } = require('./database');

function setupBotHandlers(bot, db) {
    // 1. أمر /start للترحيب وإنشاء المستخدم
    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id;
        const userTelegramId = msg.from.id;
        const username = msg.from.username;

        try {
            // إنشاء/جلب المستخدم من قاعدة البيانات
            const user = await getOrCreateUser(userTelegramId, username);

            const welcomeText = `
🎮 **مرحباً ${msg.from.first_name}! في بوت تعدين المحاكاة**

💰 **رصيدك الحالي:** ${user.balance.toFixed(2)} عملة
⚡ **طاقتك:** ${user.energy}/100

📖 **الأوامر المتاحة:**
/mining - ⛏️ ابدأ جلسة تعدين
/balance - 💰 اعرض رصيدك وطاقتك
/profile - 👤 اعرض ملفك الشخصي

⚠️ *هذا بوت محاكاة للتعلّم، العملات ليس لها قيمة حقيقية.*
            `;

            bot.sendMessage(chatId, welcomeText, { parse_mode: 'Markdown' });

        } catch (error) {
            console.error('خطأ في أمر /start:', error);
            bot.sendMessage(chatId, '❌ حدث خطأ ما. يرجى المحاولة لاحقاً.');
        }
    });

    // 2. أمر /mining لتعدين العملات
    bot.onText(/\/mining/, async (msg) => {
        const chatId = msg.chat.id;
        const userTelegramId = msg.from.id;

        try {
            // أولا: جلب بيانات المستخدم
            const user = await getOrCreateUser(userTelegramId, null);

            // التحقق من وجود طاقة كافية
            if (user.energy < 10) {
                bot.sendMessage(chatId, `❌ طاقتك منخفضة (${user.energy}/100). تحتاج 10 طاقة للتعدين.\nالطاقة تعيد شحنها بمرور الوقت.`);
                return;
            }

            // إرسال رسالة "جاري التعدين" مع مؤقت
            const processingMsg = await bot.sendMessage(chatId, '⛏️ *جاري التعدين...*', { parse_mode: 'Markdown' });

            // محاكاة وقت التعدين (3 ثواني)
            setTimeout(async () => {
                try {
                    const minedAmount = 5 + Math.floor(Math.random() * 6); // 5 إلى 10 عملة عشوائياً
                    const energyCost = 10;

                    // تحديث قاعدة البيانات: إضافة العملات وخصم الطاقة
                    await updateUserBalance(user.user_id, minedAmount, -energyCost);

                    // تحرير الرسالة الأصلية لتعرض النتيجة
                    bot.editMessageText(
                        `✅ *تم التعدين بنجاح!*\n\n` +
                        `🪙 **ربحت:** +${minedAmount} عملة\n` +
                        `⚡ **استهلاك الطاقة:** -${energyCost}\n\n` +
                        `💰 **رصيدك الجديد:** ${(user.balance + minedAmount).toFixed(2)} عملة\n` +
                        `🔋 **طاقتك المتبقية:** ${user.energy - energyCost}/100`,
                        {
                            chat_id: chatId,
                            message_id: processingMsg.message_id,
                            parse_mode: 'Markdown'
                        }
                    );

                } catch (updateError) {
                    console.error('خطأ في تحديث الرصيد:', updateError);
                    bot.editMessageText('❌ حدث خطأ أثناء تحديث بياناتك.', {
                        chat_id: chatId,
                        message_id: processingMsg.message_id
                    });
                }
            }, 3000); // 3000 ميلي ثانية = 3 ثواني

        } catch (error) {
            console.error('خطأ في أمر /mining:', error);
            bot.sendMessage(chatId, '❌ حدث خطأ ما. يرجى المحاولة لاحقاً.');
        }
    });

    // 3. أمر /balance لعرض الرصيد
    bot.onText(/\/balance/, async (msg) => {
        const chatId = msg.chat.id;
        const userTelegramId = msg.from.id;

        try {
            const user = await getOrCreateUser(userTelegramId, null);
            const balanceText = `
📊 **ملفك الشخصي**

🆔 **المعرف:** ${user.telegram_id}
👤 **اسم المستخدم:** @${user.username || 'غير محدد'}
💰 **الرصيد:** ${user.balance.toFixed(2)} عملة
⚡ **الطاقة:** ${user.energy}/100
📅 **تاريخ الانضمام:** ${new Date(user.created_at).toLocaleDateString('ar-EG')}
            `;

            bot.sendMessage(chatId, balanceText, { parse_mode: 'Markdown' });

        } catch (error) {
            console.error('خطأ في أمر /balance:', error);
            bot.sendMessage(chatId, '❌ حدث خطأ ما. يرجى المحاولة لاحقاً.');
        }
    });

    // 4. رد على أي رسالة غير معروفة
    bot.on('message', (msg) => {
        // تجاهل الأوامر (تبدأ ب /) والرسائل التي تم التعامل معها
        if (msg.text && msg.text.startsWith('/')) {
            return; // سيتم التعامل معها من قبل معالجات الأوامر الأخرى
        }
        // يمكنك إضافة تفاعل مع الرسائل النصية العادية هنا لاحقاً
    });
}

// تصدير الدالة الرئيسية
module.exports = {
    setupBotHandlers
};
