// ==================== 7. نظام الشراء بالعملات الرقمية ====================
const CRYPTO_WALLETS = {
    TON: process.env.TON_WALLET || "UQC8xJ9gQqQ5qQgK9QgQqQ5qQgK9QgQqQ5qQgK9QgQq",
    USDT: process.env.USDT_WALLET || "0x0000000000000000000000000000000000000000"
};

// طلبات الشراء المعلقة
let pendingPurchases = {};

// طلب شراء بعملة رقمية
app.post('/api/crypto-purchase', async (req, res) => {
    const { userId, itemId, currency } = req.body;
    const data = await readData();
    const user = data.users[userId];
    const item = data.shopItems[itemId];
    
    if (!user || !item) {
        return res.json({ success: false, error: 'عنصر غير موجود' });
    }
    
    const prices = {
        'energy_boost': { TON: 0.5, USDT: 1.5 },
        'miner_upgrade': { TON: 1.2, USDT: 3.5 }
    };
    
    const amount = prices[itemId]?.[currency];
    if (!amount) {
        return res.json({ success: false, error: 'عملة غير مدعومة' });
    }
    
    const paymentId = Date.now().toString() + userId;
    pendingPurchases[paymentId] = {
        userId,
        itemId,
        currency,
        amount,
        timestamp: Date.now(),
        status: 'pending'
    };
    
    res.json({
        success: true,
        paymentId,
        wallet: CRYPTO_WALLETS[currency],
        amount,
        currency,
        itemName: item.name
    });
});

// تأكيد الدفع (للأدمن)
app.post('/api/admin/confirm-payment', async (req, res) => {
    const { adminId, paymentId } = req.body;
    
    if (!ADMIN_IDS.includes(Number(adminId))) {
        return res.json({ success: false, error: 'غير مصرح' });
    }
    
    const payment = pendingPurchases[paymentId];
    if (!payment) {
        return res.json({ success: false, error: 'طلب غير موجود' });
    }
    
    const data = await readData();
    const user = data.users[payment.userId];
    const item = data.shopItems[payment.itemId];
    
    if (!user.upgrades) user.upgrades = {};
    user.upgrades[payment.itemId] = true;
    
    if (item.effect.maxEnergy) {
        user.maxEnergy = item.effect.maxEnergy;
    }
    
    delete pendingPurchases[paymentId];
    await saveData(data);
    
    // إرسال إشعار للمستخدم
    try {
        await bot.sendMessage(payment.userId, 
            `✅ *تم تأكيد دفعتك!*\n\n` +
            `🛒 العنصر: ${item.name}\n` +
            `💰 المبلغ: ${payment.amount} ${payment.currency}\n\n` +
            `شكراً لشرائك! 🎉`,
            { parse_mode: 'Markdown' }
        );
    } catch (e) {}
    
    res.json({ success: true });
});

// ==================== 8. نظام لوحة تحكم الأدمن ====================

// دالة التحقق من الأدمن
function isAdmin(userId) {
    return ADMIN_IDS.includes(Number(userId));
}

// أمر لوحة التحكم
bot.onText(/\/admin/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!isAdmin(userId)) {
        await bot.sendMessage(chatId, '❌ غير مصرح لك باستخدام هذا الأمر');
        return;
    }
    
    const data = await readData();
    const pendingCount = Object.keys(pendingPurchases).length;
    const totalUsers = Object.keys(data.users).length;
    const totalRevenue = data.system.shopRevenue || 0;
    
    const keyboard = {
        inline_keyboard: [
            [{ text: '📊 إحصائيات البوت', callback_data: 'admin_stats' }],
            [{ text: '💰 معاملات معلقة', callback_data: `admin_pending_${pendingCount}` }],
            [{ text: '👥 إدارة المستخدمين', callback_data: 'admin_users' }],
            [{ text: '🛒 إدارة المتجر', callback_data: 'admin_shop' }],
            [{ text: '📨 إرسال رسالة', callback_data: 'admin_broadcast' }]
        ]
    };
    
    await bot.sendMessage(chatId, 
        `👑 *لوحة تحكم الأدمن*\n\n` +
        `📊 إحصائيات سريعة:\n` +
        `• 👥 المستخدمون: ${totalUsers}\n` +
        `• 💰 إيرادات المتجر: $${totalRevenue.toFixed(2)}\n` +
        `• ⏳ معاملات معلقة: ${pendingCount}\n\n` +
        `اختر إجراء من القائمة:`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
    );
});

// معالجة أزرار الأدمن
bot.on('callback_query', async (callbackQuery) => {
    const message = callbackQuery.message;
    const data = callbackQuery.data;
    const userId = callbackQuery.from.id;
    
    if (!isAdmin(userId)) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ غير مصرح', show_alert: true });
        return;
    }
    
    await bot.answerCallbackQuery(callbackQuery.id);
    
    if (data === 'admin_stats') {
        const stats = await readData();
        const users = Object.values(stats.users);
        const totalBalance = users.reduce((sum, u) => sum + u.balance, 0);
        const activeToday = users.filter(u => u.last_mine && (Date.now() - u.last_mine) < 86400000).length;
        
        await bot.sendMessage(message.chat.id,
            `📊 *إحصائيات تفصيلية*\n\n` +
            `👥 إجمالي المستخدمين: ${users.length}\n` +
            `🟢 نشط اليوم: ${activeToday}\n` +
            `💰 إجمالي الأرصدة: ${totalBalance.toFixed(2)} 💎\n` +
            `⛏️ إجمالي التعدين: ${users.reduce((sum, u) => sum + (u.total_mined || 0), 0).toFixed(2)} 💎\n` +
            `🛒 مبيعات المتجر: $${stats.system.shopRevenue?.toFixed(2) || 0}\n` +
            `👥 إجمالي الدعوات: ${stats.system.totalInvites || 0}`,
            { parse_mode: 'Markdown' }
        );
    }
    
    else if (data.startsWith('admin_pending')) {
        const pendingList = Object.entries(pendingPurchases);
        
        if (pendingList.length === 0) {
            await bot.sendMessage(message.chat.id, '✅ لا توجد معاملات معلقة');
            return;
        }
        
        for (const [paymentId, payment] of pendingList) {
            const user = (await readData()).users[payment.userId];
            const keyboard = {
                inline_keyboard: [[
                    { text: '✅ تأكيد الدفع', callback_data: `confirm_pay_${paymentId}` },
                    { text: '❌ رفض', callback_data: `reject_pay_${paymentId}` }
                ]]
            };
            
            await bot.sendMessage(message.chat.id,
                `💰 *طلب شراء جديد*\n\n` +
                `👤 المستخدم: ${user?.first_name || 'غير معروف'} (${payment.userId})\n` +
                `🛒 العنصر: ${payment.itemId}\n` +
                `💵 المبلغ: ${payment.amount} ${payment.currency}\n` +
                `⏰ الوقت: ${new Date(payment.timestamp).toLocaleString('ar-EG')}\n\n` +
                `⚠️ تأكد من استلام التحويل قبل التأكيد`,
                { parse_mode: 'Markdown', reply_markup: keyboard }
            );
        }
    }
    
    else if (data.startsWith('confirm_pay_')) {
        const paymentId = data.replace('confirm_pay_', '');
        const payment = pendingPurchases[paymentId];
        
        if (!payment) {
            await bot.sendMessage(message.chat.id, '❌ المعاملة منتهية الصلاحية');
            return;
        }
        
        const appData = await readData();
        const user = appData.users[payment.userId];
        const item = appData.shopItems[payment.itemId];
        
        if (!user.upgrades) user.upgrades = {};
        user.upgrades[payment.itemId] = true;
        
        if (item.effect.maxEnergy) {
            user.maxEnergy = item.effect.maxEnergy;
        }
        
        delete pendingPurchases[paymentId];
        await saveData(appData);
        
        await bot.sendMessage(message.chat.id, '✅ تم تأكيد الدفع وتفعيل العنصر');
        
        // إشعار المستخدم
        try {
            await bot.sendMessage(payment.userId,
                `🎉 *تهانينا!*\n\n` +
                `✅ تم تفعيل ${item.name} بنجاح!\n` +
                `شكراً لدعمك ❤️`,
                { parse_mode: 'Markdown' }
            );
        } catch (e) {}
    }
    
    else if (data.startsWith('reject_pay_')) {
        const paymentId = data.replace('reject_pay_', '');
        delete pendingPurchases[paymentId];
        await bot.sendMessage(message.chat.id, '❌ تم رفض المعاملة');
    }
    
    else if (data === 'admin_users') {
        const stats = await readData();
        const topUsers = Object.values(stats.users)
            .sort((a, b) => b.balance - a.balance)
            .slice(0, 5);
        
        let usersList = '';
        topUsers.forEach((u, i) => {
            usersList += `${i+1}. ${u.first_name} - ${u.balance.toFixed(2)} 💎\n`;
        });
        
        await bot.sendMessage(message.chat.id,
            `👥 *أفضل 5 مستخدمين*\n\n${usersList}\n` +
            `للبحث عن مستخدم: /user [معرف]`,
            { parse_mode: 'Markdown' }
        );
    }
    
    else if (data === 'admin_shop') {
        const keyboard = {
            inline_keyboard: [
                [{ text: '➕ إضافة عنصر', callback_data: 'shop_add' }],
                [{ text: '✏️ تعديل سعر', callback_data: 'shop_edit' }],
                [{ text: '📊 تقرير المبيعات', callback_data: 'shop_report' }]
            ]
        };
        
        await bot.sendMessage(message.chat.id,
            '🛒 *إدارة المتجر*\nاختر إجراء:',
            { parse_mode: 'Markdown', reply_markup: keyboard }
        );
    }
    
    else if (data === 'admin_broadcast') {
        await bot.sendMessage(message.chat.id,
            '📨 *إرسال رسالة جماعية*\n\n' +
            'أرسل الرسالة التي تريد نشرها لجميع المستخدمين:',
            { parse_mode: 'Markdown' }
        );
        
        bot.once('message', async (broadcastMsg) => {
            if (broadcastMsg.chat.id === message.chat.id) {
                const stats = await readData();
                const users = Object.keys(stats.users);
                let sent = 0;
                
                await bot.sendMessage(message.chat.id, `⏳ جاري الإرسال لـ ${users.length} مستخدم...`);
                
                for (const userId of users) {
                    try {
                        await bot.sendMessage(userId, broadcastMsg.text);
                        sent++;
                        await new Promise(r => setTimeout(r, 50));
                    } catch (e) {}
                }
                
                await bot.sendMessage(message.chat.id, `✅ تم الإرسال لـ ${sent} مستخدم`);
            }
        });
    }
});

// أمر البحث عن مستخدم
bot.onText(/\/user (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const searchTerm = match[1];
    
    if (!isAdmin(userId)) {
        await bot.sendMessage(chatId, '❌ غير مصرح');
        return;
    }
    
    const data = await readData();
    let targetUser = null;
    
    if (data.users[searchTerm]) {
        targetUser = data.users[searchTerm];
    } else {
        targetUser = Object.values(data.users).find(u => 
            u.username?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }
    
    if (!targetUser) {
        await bot.sendMessage(chatId, '❌ مستخدم غير موجود');
        return;
    }
    
    const stats = await readData();
    const rank = Object.values(stats.users)
        .sort((a, b) => b.balance - a.balance)
        .findIndex(u => u.user_id === targetUser.user_id) + 1;
    
    await bot.sendMessage(chatId,
        `👤 *معلومات المستخدم*\n\n` +
        `🆔 المعرف: ${targetUser.user_id}\n` +
        `📛 الاسم: ${targetUser.first_name}\n` +
        `👤 اليوزر: @${targetUser.username || 'لا يوجد'}\n` +
        `💰 الرصيد: ${targetUser.balance.toFixed(2)} 💎\n` +
        `⚡ الطاقة: ${targetUser.energy}/${targetUser.maxEnergy || 100}\n` +
        `🏆 الترتيب: #${rank}\n` +
        `📅 تاريخ الانضمام: ${new Date(targetUser.created_at).toLocaleDateString('ar-EG')}`,
        { parse_mode: 'Markdown' }
    );
});

// ==================== 9. إضافة خيارات الشراء بالعملات للواجهة ====================

// إضافة نقطة نهاية لعناصر المتجر بالأسعار
app.get('/api/shop-items', async (req, res) => {
    const data = await readData();
    const items = {
        ...data.shopItems,
        'energy_boost': {
            ...data.shopItems['energy_boost'],
            cryptoPrices: { TON: 0.5, USDT: 1.5 }
        },
        'miner_upgrade': {
            ...data.shopItems['miner_upgrade'],
            cryptoPrices: { TON: 1.2, USDT: 3.5 }
        }
    };
    
    res.json({ success: true, items });
});

console.log('💎 نظام الشراء بالعملات الرقمية جاهز');
console.log('👑 نظام لوحة تحكم الأدمن جاهز');
