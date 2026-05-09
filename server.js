require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const db = require('./database');
const blockchainMonitor = require('./blockchain');
const express = require('express');
const path = require('path');
const multer = require('multer');
const cors = require('cors');

// ========== إعداد خادم الويب ==========
const app = express();
const PORT = process.env.PORT || 10000;

const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'mining-app')));

const WEBAPP_URL = process.env.WEBAPP_URL || `https://${process.env.RENDER_EXTERNAL_URL || 'localhost'}`;
const ADMIN_IDS = (process.env.ADMIN_IDS || '6701743450,8181305474').split(',').map(Number);
const BOT_USERNAME = process.env.BOT_USERNAME || 'TradeCrystalBot';
const CHANNEL_ID = process.env.CHANNEL_ID || '-100xxxxxxxxxx';
const CHANNEL_LINK = 'https://t.me/+8pUE4W3aK7lmYzY0';

function isAdmin(userId) { return ADMIN_IDS.includes(parseInt(userId)); }

// ========== Middleware ==========
app.use((req, res, next) => { console.log(`📡 ${new Date().toISOString()} - ${req.method} ${req.url}`); next(); });

// ========== الصفحات ==========
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'mining-app', 'index.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'mining-app', 'terms.html')));
app.get('/health', async (req, res) => { try { const p = await db.getMarketPrice(); res.json({ status:'ok', price:p }); } catch(e) { res.json({ status:'ok' }); } });

// ========== API السوق ==========
app.get('/api/market/price', async (req, res) => { try { res.json({ success:true, price:await db.getMarketPrice() }); } catch(e) { res.json({ success:true, price:0.002 }); } });
app.get('/api/market/stats', async (req, res) => { try { res.json({ success:true, ...(await db.getMarketStats()) }); } catch(e) { res.json({ success:true, price:0.002 }); } });
app.get('/api/market/candles/:timeframe', async (req, res) => { try { res.json(await db.getCandlesticks(req.params.timeframe, parseInt(req.query.limit)||100)||[]); } catch(e) { res.json([]); } });

// ========== API الأوامر ==========
app.get('/api/orders', async (req, res) => { try { res.json({ success:true, orders:await db.getActiveOrders(req.query.type, parseInt(req.query.limit)||50) }); } catch(e) { res.json({ success:true, orders:[] }); } });
app.get('/api/orders/:userId', async (req, res) => { try { res.json(await db.getUserOrders(parseInt(req.params.userId))||[]); } catch(e) { res.json([]); } });
app.post('/api/order/create', async (req, res) => { try { const { user_id, type, price, amount } = req.body; if(!user_id||!type||!price||!amount) return res.json({ success:false, message:'⚠️ جميع الحقول مطلوبة' }); res.json(await db.createOrder(parseInt(user_id), type, parseFloat(price), parseFloat(amount))); } catch(e) { res.json({ success:false, message:'❌ حدث خطأ' }); } });
app.post('/api/order/cancel', async (req, res) => { try { const { order_id, user_id } = req.body; if(!order_id||!user_id) return res.json({ success:false, message:'⚠️ مطلوب' }); res.json(await db.cancelOrder(order_id, parseInt(user_id))); } catch(e) { res.json({ success:false, message:'❌ حدث خطأ' }); } });

// ========== API المستخدم ==========
app.get('/api/user/:userId', async (req, res) => { try { res.json(await db.getUserStats(parseInt(req.params.userId))||{ usdtBalance:0, crystalBalance:0, isVerified:false }); } catch(e) { res.json({ usdtBalance:0, crystalBalance:0, isVerified:false }); } });
app.post('/api/register', async (req, res) => { try { const { user_id, username, first_name, referrer_id } = req.body; if(!user_id) return res.json({ success:false, message:'⚠️ مطلوب' }); res.json(await db.registerUser(parseInt(user_id), username||'', first_name||'', '', '', '', 'SD', '', referrer_id?parseInt(referrer_id):null, 'ar', req.ip, req.headers['user-agent'])); } catch(e) { res.json({ success:false, message:'❌ حدث خطأ' }); } });
app.get('/api/user/trades/:userId', async (req, res) => { try { res.json(await db.getUserTradeHistory(parseInt(req.params.userId), 50)||[]); } catch(e) { res.json([]); } });

// ========== API المحفظة ==========
app.get('/api/wallet/:userId', async (req, res) => { try { const w = await db.getUserWallet(parseInt(req.params.userId)); res.json({ usdtBalance:w.usdtBalance||0, crystalBalance:w.crystalBalance||0, addresses:{ bnb:w.bnbAddress, polygon:w.polygonAddress, solana:w.solanaAddress, aptos:w.aptosAddress } }); } catch(e) { res.json({ usdtBalance:0, crystalBalance:0, addresses:{} }); } });
app.post('/api/deposit', async (req, res) => { try { const { user_id, amount, network } = req.body; if(!user_id||!amount||!network) return res.json({ success:false, message:'⚠️ مطلوب' }); res.json(await db.requestDeposit(parseInt(user_id), parseFloat(amount), 'USDT', network)); } catch(e) { res.json({ success:false, message:'❌ حدث خطأ' }); } });
app.post('/api/withdraw', async (req, res) => { try { const { user_id, amount, network, address, twofa_code } = req.body; if(!user_id||!amount||!network||!address) return res.json({ success:false, message:'⚠️ مطلوب' }); res.json(await db.requestWithdraw(parseInt(user_id), parseFloat(amount), 'USDT', network, address, twofa_code)); } catch(e) { res.json({ success:false, message:'❌ حدث خطأ' }); } });

// ========== API KYC ==========
app.get('/api/kyc/status/:userId', async (req, res) => { try { res.json(await db.getKycStatus(parseInt(req.params.userId))); } catch(e) { res.json({ status:'not_submitted' }); } });
app.post('/api/kyc/submit', upload.fields([{ name:'passportPhoto', maxCount:1 }, { name:'personalPhoto', maxCount:1 }]), async (req, res) => {
    try {
        const { user_id, fullName, passportNumber, nationalId, phoneNumber } = req.body;
        if(!user_id||!fullName) return res.json({ success:false, message:'⚠️ البيانات مطلوبة' });
        let pf=null, sf=null;
        if(global.botInstance){
            try {
                if(req.files?.passportPhoto?.[0]){ const m=await global.botInstance.telegram.sendPhoto(ADMIN_IDS[0],{ source:req.files.passportPhoto[0].buffer },{ caption:`📄 *طلب توثيق*\n👤 ${fullName}\n🆔 \`${user_id}\`\n📱 ${phoneNumber||'-'}`, parse_mode:'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('✅ قبول',`approve_kyc_${user_id}`), Markup.button.callback('❌ رفض',`reject_kyc_${user_id}`)]]) }); pf=m.photo[m.photo.length-1].file_id; }
                if(req.files?.personalPhoto?.[0]){ const m=await global.botInstance.telegram.sendPhoto(ADMIN_IDS[0],{ source:req.files.personalPhoto[0].buffer },{ caption:`📸 صورة شخصية - ${fullName} (\`${user_id}\`)`, parse_mode:'Markdown' }); sf=m.photo[m.photo.length-1].file_id; }
            } catch(e){}
        }
        res.json(await db.createKycRequest(parseInt(user_id), fullName, passportNumber||'N/A', nationalId||'N/A', phoneNumber||'N/A', '', 'SD', '', pf, sf, '', '', ''));
    } catch(e) { res.json({ success:false, message:'❌ حدث خطأ' }); }
});

// ========== API الإحالات ==========
app.get('/api/user/referral/:userId', async (req, res) => { try { res.json(await db.getReferralData(parseInt(req.params.userId))); } catch(e) { res.json({ referralCount:0 }); } });
app.post('/api/referral/transfer', async (req, res) => { try { res.json(await db.transferReferralEarningsToWallet(parseInt(req.body.user_id))); } catch(e) { res.json({ success:false }); } });

// ========== API الدردشة ==========
app.get('/api/chat/global', async (req, res) => { try { res.json(await db.getGlobalMessages(50)||[]); } catch(e) { res.json([]); } });
app.post('/api/chat/send', async (req, res) => { try { res.json({ success:true, message:await db.sendMessage(parseInt(req.body.senderId), null, req.body.message) }); } catch(e) { res.json({ success:false }); } });

// ========== API 2FA ==========
app.post('/api/2fa/generate', async (req, res) => { try { res.json(await db.generate2FASecret(parseInt(req.body.user_id))); } catch(e) { res.json({ success:false }); } });
app.post('/api/2fa/enable', async (req, res) => { try { res.json(await db.enable2FA(parseInt(req.body.user_id), req.body.code)); } catch(e) { res.json({ success:false }); } });
app.post('/api/2fa/disable', async (req, res) => { try { res.json(await db.disable2FA(parseInt(req.body.user_id), req.body.code)); } catch(e) { res.json({ success:false }); } });

// ========== API العرض ==========
app.get('/api/supply', async (req, res) => { try { res.json({ success:true, ...(await db.validateTotalSupply()) }); } catch(e) { res.json({ success:true, totalSupply:5000000 }); } });

// ✅ التحقق من الاشتراك في القناة وإعطاء المكافأة
app.post('/api/channel/check', async (req, res) => {
    try {
        const { user_id } = req.body;
        if (!user_id) return res.json({ success: false, message: '⚠️ معرف المستخدم مطلوب' });
        
        const userId = parseInt(user_id);
        
        // ✅ التحقق من التوثيق أولاً
        const user = await db.getUser(userId);
        if (!user || !user.isVerified) {
            return res.json({ success: false, message: '⚠️ يجب توثيق حسابك أولاً!', subscribed: false, needKyc: true });
        }
        
        let isSubscribed = false;
        try {
            const chatMember = await bot.telegram.getChatMember(CHANNEL_ID, userId);
            isSubscribed = ['member', 'administrator', 'creator'].includes(chatMember.status);
        } catch(e) {
            return res.json({ success: false, message: '⚠️ تعذر التحقق. تأكد أن البوت أدمن في القناة.' });
        }
        
        if (!isSubscribed) {
            return res.json({ success: false, message: '⚠️ لم تشترك في القناة بعد!', subscribed: false });
        }
        
        const result = await db.giveChannelReward(userId);
        res.json({ ...result, subscribed: true });
    } catch(e) {
        res.json({ success: false, message: '❌ حدث خطأ' });
    }
});

// ========== معالج أخطاء ==========
app.use((err, req, res, next) => { console.error('❌', err.message); res.status(500).json({ success:false, message:'❌ خطأ في الخادم' }); });

// ========== بوت ==========
const bot = new Telegraf(process.env.BOT_TOKEN);
global.botInstance = bot;
module.exports.bot = bot;

// ========== أوامر ==========

bot.start(async (ctx) => {
    try {
        const user = ctx.from;
        const referrer = ctx.startPayload ? parseInt(ctx.startPayload) : null;
        const result = await db.registerUser(user.id, user.username||'', user.first_name||'', '', '', '', 'SD', '', referrer);
        const price = await db.getMarketPrice();
        const sc = await db.validateTotalSupply();
        
        let msg;
        if (result.isAdmin) {
            msg = `👑 *أهلاً بالأدمن!*\n\n📦 رصيدك: ${sc.adminBalance.toLocaleString()} CRYSTAL\n💰 السعر: ${price} USDT`;
        } else if (result.isNew) {
            msg = `🎉 *أهلاً بك في CRYSTAL Exchange!*\n\n✨ تم إنشاء حسابك\n💰 السعر: ${price} USDT\n\n🎁 *مكافآت:*\n🆔 وثق حسابك → 100 CRYSTAL\n📢 اشترك في القناة → 100 CRYSTAL\n👥 ادعُ 5 أصدقاء → 2,000 CRYSTAL`;
        } else {
            msg = `👋 *أهلاً بعودتك ${user.first_name}!*\n💰 السعر: ${price} USDT`;
        }
        
        await ctx.reply(msg, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.webApp('💎 فتح المنصة', WEBAPP_URL)],
                [Markup.button.url('📢 القناة', CHANNEL_LINK)]
            ])
        });
    } catch(e) { await ctx.reply('❌ حدث خطأ'); }
});

bot.command('help', async (ctx) => {
    let t = '📚 *الأوامر:*\n/start /price /balance /stats /supply /orders /buy /sell /cancel /referral';
    if (isAdmin(ctx.from.id)) t += '\n\n👑 *أدمن:*\n/admin /kyc_list /pending /fix /maintenance /ban /unban';
    await ctx.reply(t, { parse_mode:'Markdown' });
});

bot.command('price', async (ctx) => { try { await ctx.reply(`💎 ${await db.getMarketPrice()} USDT`, { parse_mode:'Markdown' }); } catch(e) {} });
bot.command('supply', async (ctx) => { try { const sc = await db.validateTotalSupply(); await ctx.reply(`📊 ${sc.totalSupply.toLocaleString()}\n🔄 ${sc.circulating.toFixed(2)}\n👑 ${sc.adminBalance.toFixed(2)}`, { parse_mode:'Markdown' }); } catch(e) {} });
bot.command('balance', async (ctx) => { try { const s = await db.getUserStats(ctx.from.id); if(!s) return ctx.reply('⚠️ سجل أولاً'); await ctx.reply(`💰 CRYSTAL: ${(s.crystalBalance||0).toFixed(2)}\n💵 USDT: ${(s.usdtBalance||0).toFixed(2)}`, { parse_mode:'Markdown' }); } catch(e) {} });
bot.command('stats', async (ctx) => { try { const s = await db.getMarketStats(); await ctx.reply(`📊 💎${s.price} 📈${(s.change24h||0).toFixed(2)}% 🟢${s.buyOrders} 🔴${s.sellOrders}`, { parse_mode:'Markdown' }); } catch(e) {} });
bot.command('referral', async (ctx) => { try { const d = await db.getReferralData(ctx.from.id); await ctx.reply(`👥 ${d.referralCount} | 💰 ${(d.referralEarnings||0).toFixed(2)}\n🔗 ${d.referralLink}`, { parse_mode:'Markdown' }); } catch(e) {} });
bot.command('buy', async (ctx) => { try { const a=ctx.message.text.split(' '); if(a.length<3) return ctx.reply('/buy [سعر] [كمية]'); const r=await db.createOrder(ctx.from.id,'buy',parseFloat(a[1]),parseFloat(a[2])); await ctx.reply(r.message); } catch(e) {} });
bot.command('sell', async (ctx) => { try { const a=ctx.message.text.split(' '); if(a.length<3) return ctx.reply('/sell [سعر] [كمية]'); const r=await db.createOrder(ctx.from.id,'sell',parseFloat(a[1]),parseFloat(a[2])); await ctx.reply(r.message); } catch(e) {} });
bot.command('cancel', async (ctx) => { try { const oid=ctx.message.text.split(' ')[1]; if(!oid) return ctx.reply('/cancel [رقم]'); const r=await db.cancelOrder(oid, ctx.from.id); await ctx.reply(r.message); } catch(e) {} });
bot.command('orders', async (ctx) => { try { const buys=await db.getActiveOrders('buy',5), sells=await db.getActiveOrders('sell',5); let t='📊 *شراء:*\n'; for(const o of buys.slice(0,5)) t+=`💰 ${o.price} | 📦 ${(o.amount||0).toFixed(2)}\n`; t+='\n📊 *بيع:*\n'; for(const o of sells.slice(0,5)) t+=`💰 ${o.price} | 📦 ${(o.amount||0).toFixed(2)}\n`; await ctx.reply(t,{ parse_mode:'Markdown' }); } catch(e) {} });

// ========== أدمن ==========
bot.command('admin', async (ctx) => { if(!isAdmin(ctx.from.id)) return; const kyc=await db.getPendingKycRequests(), w=await db.getPendingWithdraws(), d=await db.getPendingDeposits(); await ctx.reply(`👑 🆔${kyc.length} 💰${w.length} 📤${d.length}`, Markup.inlineKeyboard([[Markup.button.callback(`🆔 توثيق (${kyc.length})`,'admin_kyc')],[Markup.button.callback(`💰 سحب (${w.length})`,'admin_withdraws')],[Markup.button.callback(`📤 إيداع (${d.length})`,'admin_deposits')]])); });
bot.command('kyc_list', async (ctx) => { if(!isAdmin(ctx.from.id)) return; const p=await db.getPendingKycRequests(); if(!p.length) return ctx.reply('📭 لا توجد طلبات'); for(const r of p){ let cap=`📋 ${r.fullName}\n🆔 \`${r.userId}\`\n📱 ${r.phoneNumber||'-'}`; if(r.passportPhotoFileId){ try{ await ctx.replyWithPhoto(r.passportPhotoFileId,{ caption:cap+'\\n\\n📄 صورة الهوية', parse_mode:'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('✅ قبول',`approve_kyc_${r._id}`), Markup.button.callback('❌ رفض',`reject_kyc_${r._id}`)]]) }); } catch(e){ await ctx.reply(cap, Markup.inlineKeyboard([[Markup.button.callback('✅ قبول',`approve_kyc_${r._id}`), Markup.button.callback('❌ رفض',`reject_kyc_${r._id}`)]])); } } if(r.personalPhotoFileId){ try{ await ctx.replyWithPhoto(r.personalPhotoFileId,{ caption:`📸 ${r.fullName}`, parse_mode:'Markdown' }); } catch(e){} } } });
bot.command('pending', async (ctx) => { if(!isAdmin(ctx.from.id)) return; const w=await db.getPendingWithdraws(), d=await db.getPendingDeposits(); for(const r of w) await ctx.reply(`💰 سحب: ${r.userId} - ${r.amount} USDT\n📤 ${(r.address||'').slice(0,20)}...`, Markup.inlineKeyboard([[Markup.button.callback('✅ تأكيد وإرسال',`confirm_withdraw_${r._id}`)]])); for(const r of d) await ctx.reply(`📤 إيداع: ${r.userId} - ${r.amount} USDT`, Markup.inlineKeyboard([[Markup.button.callback('✅ تأكيد',`confirm_deposit_${r._id}`)]])); });
bot.command('fix', async (ctx) => { if(!isAdmin(ctx.from.id)) return; const fixed=await db.fixStuckOrders(), bal=await db.validateBalances(); await ctx.reply(`🔧 تم: ${fixed}\n✅ ${bal.isValid?'سليم':'خطأ'}`, { parse_mode:'Markdown' }); });
bot.command('maintenance', async (ctx) => { if(!isAdmin(ctx.from.id)) return; const orders=await require('./models').Order.find({ status:{$in:['open','partial']} }); for(const o of orders) await db.cancelOrder(o._id, o.userId); await ctx.reply(`✅ تم إلغاء ${orders.length} أمر`); });
bot.command('ban', async (ctx) => { if(!isAdmin(ctx.from.id)) return; const a=ctx.message.text.split(' '); await ctx.reply((await db.banUser(parseInt(a[1]), a.slice(2).join(' ')||'مخالفة')).message); });
bot.command('unban', async (ctx) => { if(!isAdmin(ctx.from.id)) return; await ctx.reply((await db.unbanUser(parseInt(ctx.message.text.split(' ')[1]))).message); });

// ========== Callbacks ==========
bot.action('admin_kyc', async (ctx) => { await ctx.answerCbQuery(); const p=await db.getPendingKycRequests(); for(const r of p.slice(0,5)) await ctx.reply(`📋 ${r.fullName}`, Markup.inlineKeyboard([[Markup.button.callback('✅',`approve_kyc_${r._id}`), Markup.button.callback('❌',`reject_kyc_${r._id}`)]])); });
bot.action('admin_withdraws', async (ctx) => { await ctx.answerCbQuery(); const p=await db.getPendingWithdraws(); for(const r of p.slice(0,5)) await ctx.reply(`💰 ${r.amount} USDT | 👤 ${r.userId}`, Markup.inlineKeyboard([[Markup.button.callback('✅',`confirm_withdraw_${r._id}`)]])); });
bot.action('admin_deposits', async (ctx) => { await ctx.answerCbQuery(); const p=await db.getPendingDeposits(); for(const r of p.slice(0,5)) await ctx.reply(`📤 ${r.amount} USDT | 👤 ${r.userId}`, Markup.inlineKeyboard([[Markup.button.callback('✅',`confirm_deposit_${r._id}`)]])); });

// ✅ KYC Callbacks مع إشعار
bot.action(/approve_kyc_(.+)/, async (ctx) => {
    const kycId = ctx.match[1];
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔');
    await ctx.answerCbQuery('⏳ جاري الموافقة...');
    
    // جلب userId من الطلب
    const pending = await db.getPendingKycRequests();
    const request = pending.find(r => r._id.toString() === kycId);
    const userId = request ? request.userId : null;
    
    const result = await db.approveKyc(kycId, ctx.from.id);
    await ctx.editMessageCaption({ caption: `✅ *تمت الموافقة*`, parse_mode: 'Markdown' });
    await ctx.reply(result.message);
    
    // إشعار المستخدم
    if (userId && global.botInstance) {
        try {
            await global.botInstance.telegram.sendMessage(userId, 
                `🎉 *مبروك!*\n\n✅ تم توثيق حسابك بنجاح!\n🎁 تمت إضافة *100 CRYSTAL* مكافأة توثيق!\n\nيمكنك الآن التداول والحصول على مكافآت أخرى`,
                { parse_mode: 'Markdown' }
            );
        } catch(e) {}
    }
});

bot.action(/reject_kyc_(.+)/, async (ctx) => {
    const kycId = ctx.match[1];
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔');
    await ctx.answerCbQuery('⏳ جاري الرفض...');
    
    const pending = await db.getPendingKycRequests();
    const request = pending.find(r => r._id.toString() === kycId);
    const userId = request ? request.userId : null;
    
    const result = await db.rejectKyc(kycId, ctx.from.id, 'الصور غير واضحة');
    await ctx.editMessageCaption({ caption: `❌ *تم الرفض*`, parse_mode: 'Markdown' });
    await ctx.reply(result.message);
    
    if (userId && global.botInstance) {
        try {
            await global.botInstance.telegram.sendMessage(userId, 
                `⚠️ *تم رفض طلب التوثيق*\nالسبب: الصور غير واضحة\n📸 يرجى إعادة الإرسال`,
                { parse_mode: 'Markdown' }
            );
        } catch(e) {}
    }
});

bot.action(/confirm_withdraw_(.+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔');
    await ctx.answerCbQuery('⏳ جاري الإرسال...');
    const result = await db.confirmWithdraw(ctx.match[1], '', ctx.from.id);
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.reply(result.message);
});

bot.action(/confirm_deposit_(.+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔');
    await ctx.answerCbQuery();
    const result = await db.confirmDeposit(ctx.match[1], 'manual_confirm', ctx.from.id);
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.reply(result.message);
});

bot.catch((err, ctx) => console.error(`❌ Bot error:`, err.message));

// ========== تشغيل ==========
const server = app.listen(PORT, '0.0.0.0', () => { console.log(`🌐 Server on port ${PORT}`); });

(async () => {
    try {
        await db.connect(); console.log('✅ Database');
        await db.startFakePriceMovement(); console.log('📊 Fake price');
        blockchainMonitor.startMonitoring(db); console.log('🔍 Blockchain');
        await bot.telegram.deleteWebhook();
        const webhookUrl = `${WEBAPP_URL}/webhook`;
        await bot.telegram.setWebhook(webhookUrl);
        app.use(bot.webhookCallback('/webhook'));
        console.log(`✅ Bot @${(await bot.telegram.getMe()).username} ready`);
    } catch(e) {
        console.error('❌', e.message);
        try { await bot.telegram.deleteWebhook(); bot.launch(); } catch(e2) {}
    }
})();

process.once('SIGINT', async () => { await db.stopFakePriceMovement(); await bot.telegram.deleteWebhook(); bot.stop('SIGINT'); server.close(); process.exit(0); });
process.once('SIGTERM', async () => { await db.stopFakePriceMovement(); await bot.telegram.deleteWebhook(); bot.stop('SIGTERM'); server.close(); process.exit(0); });
