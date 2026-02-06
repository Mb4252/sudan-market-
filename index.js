bot.on('text', async (ctx) => {
    const url = ctx.message.text;
    if (url.startsWith('http')) {
        const waiting = await ctx.reply('🚀 جاري جلب أعلى جودة متوفرة (HD) في الخلفية...');

        try {
            // استخدام API مجاني وسريع جداً لتجنب الدخول اليدوي للمواقع
            const response = await axios.get(`https://api.tikwm.com/api/?url=${encodeURIComponent(url)}`);
            const directLink = response.data.data.play; // الرابط المباشر لأعلى جودة بدون علامة مائية

            await ctx.deleteMessage(waiting.message_id).catch(() => {});

            return ctx.reply('✅ تم العثور على النسخة الأصلية (HD)!', 
                Markup.inlineKeyboard([
                    [Markup.button.url('📥 اضغط هنا للتحميل المباشر', directLink)]
                ])
            );
        } catch (error) {
            // إذا فشل المحرك السريع، نعود للخطة البديلة (الموقع اليدوي)
            ctx.reply('الموقع يطلب اختياراً يدوياً، اضغط هنا:', 
                Markup.inlineKeyboard([[Markup.button.url('صفحة الجودات المتوفرة 🚀', `https://pastedownload.com/21/?url=${encodeURIComponent(url)}#results`)]]));
        }
    }
});
