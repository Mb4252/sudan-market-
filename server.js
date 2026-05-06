require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const db = require('./database');
const express = require('express');
const path = require('path');
const multer = require('multer');
const cors = require('cors');

// ========== إعداد خادم الويب ==========
const app = express();
const PORT = process.env.PORT || 10000;

const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

// CORS
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ========== استخدام مجلد mining-app ==========
app.use(express.static(path.join(__dirname, 'mining-app')));

const WEBAPP_URL = process.env.WEBAPP_URL || `https://${process.env.RENDER_EXTERNAL_URL || 'localhost'}`;
const ADMIN_IDS = (process.env.ADMIN_IDS || '6701743450,8181305474').split(',').map(Number);
const BOT_USERNAME = process.env.BOT_USERNAME || 'TradeCrystalBot';

function isAdmin(userId) {
    return ADMIN_IDS.includes(parseInt(userId));
}

// ========== Middleware للمراقبة ==========
app.use((req, res, next) => {
    console.log(`📡 ${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// ========== API Routes ==========

// نقطة فحص الصحة
app.get('/health', async (req, res) => {
    try {
        const price = await db.getMarketPrice();
        res.json({ 
            status: 'ok', 
            timestamp: new Date(), 
            supply: 5000000, 
            price: price 
        });
    } catch (e) {
        res.json({ status: 'ok', timestamp: new Date() });
    }
});

// اختبار API
app.post('/api/test', (req, res) => {
    res.json({ success: true, message: 'API يعمل بشكل صحيح' });
});

app.get('/api/test', (req, res) => {
    res.json({ success: true, message: 'API يعمل بشكل صحيح' });
});

// ========== السوق ==========

app.get('/api/market/price', async (req, res) => {
    try {
        const price = await db.getMarketPrice();
        res.json({ success: true, price: price });
    } catch(e) {
        res.json({ success: true, price: 0.002 });
    }
});

app.get('/api/market/stats', async (req, res) => {
    try {
        const stats = await db.getMarketStats();
        res.json({ success: true, ...stats });
    } catch(e) {
        res.json({ 
            success: true,
            price: 0.002, 
            buyOrders: 0, 
            sellOrders: 0, 
            volume24h: 0,
            totalTrades: 0,
            totalVolume: 0
        });
    }
});

app.get('/api/market/candles/:timeframe', async (req, res) => {
    try {
        const candles = await db.getCandlesticks(
            req.params.timeframe, 
            parseInt(req.query.limit) || 100
        );
        res.json({ success: true, candles });
    } catch(e) {
        res.json({ success: true, candles: [] });
    }
});

// ========== الأوامر ==========

app.get('/api/orders', async (req, res) => {
    try {
        const orders = await db.getActiveOrders(
            req.query.type, 
            parseInt(req.query.limit) || 50
        );
        res.json({ success: true, orders });
    } catch(e) {
        res.json({ success: true, orders: [] });
    }
});

app.get('/api/orders/:userId', async (req, res) => {
    try {
        const orders = await db.getUserOrders(parseInt(req.params.userId));
        res.json({ success: true, orders });
    } catch(e) {
        res.json({ success: true, orders: [] });
    }
});

app.post('/api/order/create', async (req, res) => {
    try {
        const { user_id, type, price, amount } = req.body;
        
        if (!user_id || !type || !price || !amount) {
            return res.json({ 
                success: false, 
                message: '⚠️ جميع الحقول مطلوبة' 
            });
        }
        
        const result = await db.createOrder(
            parseInt(user_id), 
            type, 
            parseFloat(price), 
            parseFloat(amount)
        );
        
        res.json(result);
    } catch(e) {
        console.error('Create order error:', e);
        res.json({ 
            success: false, 
            message: '❌ حدث خطأ في إنشاء الطلب' 
        });
    }
});

app.post('/api/order/cancel', async (req, res) => {
    try {
        const { order_id, user_id } = req.body;
        
        if (!order_id || !user_id) {
            return res.json({ 
                success: false, 
                message: '⚠️ معرف الطلب والمستخدم مطلوب' 
            });
        }
        
        const result = await db.cancelOrder(order_id, parseInt(user_id));
        res.json(result);
    } catch(e) {
        console.error('Cancel order error:', e);
        res.json({ 
            success: false, 
            message: '❌ حدث خطأ في إلغاء الطلب' 
        });
    }
});

// ========== المستخدم ==========

app.get('/api/user/:userId', async (req, res) => {
    try {
        const stats = await db.getUserStats(parseInt(req.params.userId));
        if (!stats) {
            return res.json({ 
                success: false, 
                message: 'المستخدم غير موجود',
                usdtBalance: 0, 
                crystalBalance: 0, 
                isVerified: false 
            });
        }
        res.json({ success: true, ...stats });
    } catch(e) {
        res.json({ 
            success: false,
            usdtBalance: 0, 
            crystalBalance: 0, 
            isVerified: false 
        });
    }
});

app.post('/api/register', async (req, res) => {
    try {
        const { user_id, username, first_name, last_name, phone, email, country, city, referrer_id } = req.body;
        
        if (!user_id) {
            return res.json({ 
                success: false, 
                message: '⚠️ معرف المستخدم مطلوب' 
            });
        }
        
        const result = await db.registerUser(
            parseInt(user_id),
            username || '',
            first_name || '',
            last_name || '',
            phone || '',
            email || '',
            country || 'SD',
            city || '',
            referrer_id ? parseInt(referrer_id) : null,
            'ar',
            req.ip,
            req.headers['user-agent']
        );
        
        res.json(result);
    } catch(e) {
        console.error('Register error:', e);
        res.json({ 
            success: false, 
            message: '❌ حدث خطأ في التسجيل' 
        });
    }
});

app.get('/api/user/trades/:userId', async (req, res) => {
    try {
        const trades = await db.getUserTradeHistory(
            parseInt(req.params.userId), 
            50
        );
        res.json({ success: true, trades });
    } catch(e) {
        res.json({ success: true, trades: [] });
    }
});

// ========== المحفظة ==========

app.get('/api/wallet/:userId', async (req, res) => {
    try {
        const wallet = await db.getUserWallet(parseInt(req.params.userId));
        res.json({ 
            success: true,
            usdtBalance: wallet.usdtBalance || 0, 
            crystalBalance: wallet.crystalBalance || 0, 
            addresses: { 
                bnb: wallet.bnbAddress, 
                polygon: wallet.polygonAddress, 
                solana: wallet.solanaAddress, 
                aptos: wallet.aptosAddress 
            } 
        });
    } catch(e) {
        res.json({ 
            success: false,
            usdtBalance: 0, 
            crystalBalance: 0, 
            addresses: {} 
        });
    }
});

app.post('/api/deposit', async (req, res) => {
    try {
        const { user_id, amount, network } = req.body;
        
        if (!user_id || !amount || !network) {
            return res.json({ 
                success: false, 
                message: '⚠️ جميع الحقول مطلوبة' 
            });
        }
        
        const result = await db.requestDeposit(
            parseInt(user_id), 
            parseFloat(amount), 
            'USDT', 
            network
        );
        
        res.json(result);
    } catch(e) {
        console.error('Deposit error:', e);
        res.json({ 
            success: false, 
            message: '❌ حدث خطأ في طلب الإيداع' 
        });
    }
});

app.post('/api/withdraw', async (req, res) => {
    try {
        const { user_id, amount, network, address, twofa_code } = req.body;
        
        if (!user_id || !amount || !network || !address) {
            return res.json({ 
                success: false, 
                message: '⚠️ جميع الحقول مطلوبة' 
            });
        }
        
        const result = await db.requestWithdraw(
            parseInt(user_id), 
            parseFloat(amount), 
            'USDT', 
            network, 
            address, 
            twofa_code
        );
        
        res.json(result);
    } catch(e) {
        console.error('Withdraw error:', e);
        res.json({ 
            success: false, 
            message: '❌ حدث خطأ في طلب السحب' 
        });
    }
});

// ========== KYC ==========

app.get('/api/kyc/status/:userId', async (req, res) => {
    try {
        const status = await db.getKycStatus(parseInt(req.params.userId));
        res.json({ success: true, ...status });
    } catch(e) {
        res.json({ 
            success: true, 
            status: 'not_submitted' 
        });
    }
});

app.post('/api/kyc/submit', upload.fields([
    { name: 'passportPhoto', maxCount: 1 }, 
    { name: 'personalPhoto', maxCount: 1 }
]), async (req, res) => {
    try {
        const { 
            user_id, fullName, passportNumber, nationalId, 
            phoneNumber, email, country, city, 
            bankName, bankAccountNumber, bankAccountName 
        } = req.body;
        
        if (!user_id || !fullName) {
            return res.json({ 
                success: false, 
                message: '⚠️ الاسم الكامل ومعرف المستخدم مطلوبان' 
            });
        }
        
        let passportFileId = null;
        let personalFileId = null;
        
        // رفع الصور للأدمن إذا كان البوت متاحاً
        if (global.botInstance) {
            try {
                if (req.files && req.files['passportPhoto'] && req.files['passportPhoto'][0]) {
                    const msg = await global.botInstance.telegram.sendPhoto(
                        ADMIN_IDS[0], 
                        { source: req.files['passportPhoto'][0].buffer },
                        { caption: `📄 جواز سفر - ${fullName} (${user_id})` }
                    );
                    passportFileId = msg.photo[msg.photo.length - 1].file_id;
                }
                
                if (req.files && req.files['personalPhoto'] && req.files['personalPhoto'][0]) {
                    const msg = await global.botInstance.telegram.sendPhoto(
                        ADMIN_IDS[0], 
                        { source: req.files['personalPhoto'][0].buffer },
                        { caption: `📸 صورة شخصية - ${fullName} (${user_id})` }
                    );
                    personalFileId = msg.photo[msg.photo.length - 1].file_id;
                }
            } catch (uploadError) {
                console.error('Photo upload error:', uploadError.message);
            }
        }
        
        const result = await db.createKycRequest(
            parseInt(user_id),
            fullName,
            passportNumber || '',
            nationalId || '',
            phoneNumber || '',
            email || '',
            country || 'SD',
            city || '',
            passportFileId,
            personalFileId,
            bankName || '',
            bankAccountNumber || '',
            bankAccountName || ''
        );
        
        res.json(result);
        
    } catch(e) {
        console.error('KYC submit error:', e);
        res.json({ 
            success: false, 
            message: '❌ حدث خطأ في إرسال طلب التوثيق' 
        });
    }
});

// ========== الإحالات ==========

app.get('/api/user/referral/:userId', async (req, res) => {
    try {
        const data = await db.getReferralData(parseInt(req.params.userId));
        res.json({ success: true, ...data });
    } catch(e) {
        res.json({ 
            success: true, 
            referralCount: 0, 
            referralEarnings: 0, 
            referrals: [] 
        });
    }
});

app.post('/api/referral/transfer', async (req, res) => {
    try {
        const { user_id } = req.body;
        
        if (!user_id) {
            return res.json({ 
                success: false, 
                message: '⚠️ معرف المستخدم مطلوب' 
            });
        }
        
        const result = await db.transferReferralEarningsToWallet(parseInt(user_id));
        res.json(result);
    } catch(e) {
        console.error('Referral transfer error:', e);
        res.json({ 
            success: false, 
            message: '❌ حدث خطأ في تحويل أرباح الإحالات' 
        });
    }
});

// ========== الدردشة ==========

app.get('/api/chat/global', async (req, res) => {
    try {
        const messages = await db.getGlobalMessages(50);
        res.json({ success: true, messages });
    } catch(e) {
        res.json({ success: true, messages: [] });
    }
});

app.post('/api/chat/send', async (req, res) => {
    try {
        const { senderId, message } = req.body;
        
        if (!senderId || !message) {
            return res.json({ 
                success: false, 
                message: '⚠️ المرسل والرسالة مطلوبان' 
            });
        }
        
        const result = await db.sendMessage(parseInt(senderId), null, message);
        res.json({ success: true, message: result });
    } catch(e) {
        console.error('Chat send error:', e);
        res.json({ 
            success: false, 
            message: '❌ حدث خطأ في إرسال الرسالة' 
        });
    }
});

app.post('/api/chat/send-image', upload.single('image'), async (req, res) => {
    try {
        const { senderId, message } = req.body;
        
        if (!senderId) {
            return res.json({ 
                success: false, 
                message: '⚠️ معرف المرسل مطلوب' 
            });
        }
        
        let imageFileId = null;
        
        if (global.botInstance && req.file) {
            try {
                const msg = await global.botInstance.telegram.sendPhoto(
                    ADMIN_IDS[0], 
                    { source: req.file.buffer }
                );
                imageFileId = msg.photo[msg.photo.length - 1].file_id;
            } catch (uploadError) {
                console.error('Image upload error:', uploadError.message);
            }
        }
        
        const result = await db.sendMessage(
            parseInt(senderId), 
            null, 
            message || '📸 صورة', 
            imageFileId
        );
        
        res.json({ success: true, message: result });
    } catch(e) {
        console.error('Chat image error:', e);
        res.json({ 
            success: false, 
            message: '❌ حدث خطأ في إرسال الصورة' 
        });
    }
});

// ========== 2FA ==========

app.post('/api/2fa/generate', async (req, res) => {
    try {
        const { user_id } = req.body;
        
        if (!user_id) {
            return res.json({ 
                success: false, 
                message: '⚠️ معرف المستخدم مطلوب' 
            });
        }
        
        const result = await db.generate2FASecret(parseInt(user_id));
        res.json(result);
    } catch(e) {
        console.error('2FA generate error:', e);
        res.json({ 
            success: false, 
            message: '❌ حدث خطأ في إنشاء رمز 2FA' 
        });
    }
});

app.post('/api/2fa/enable', async (req, res) => {
    try {
        const { user_id, code } = req.body;
        
        if (!user_id || !code) {
            return res.json({ 
                success: false, 
                message: '⚠️ معرف المستخدم والرمز مطلوبان' 
            });
        }
        
        const result = await db.enable2FA(parseInt(user_id), code);
        res.json(result);
    } catch(e) {
        console.error('2FA enable error:', e);
        res.json({ 
            success: false, 
            message: '❌ حدث خطأ في تفعيل 2FA' 
        });
    }
});

app.post('/api/2fa/disable', async (req, res) => {
    try {
        const { user_id, code } = req.body;
        
        if (!user_id || !code) {
            return res.json({ 
                success: false, 
                message: '⚠️ معرف المستخدم والرمز مطلوبان' 
            });
        }
        
        const result = await db.disable2FA(parseInt(user_id), code);
        res.json(result);
    } catch(e) {
        console.error('2FA disable error:', e);
        res.json({ 
            success: false, 
            message: '❌ حدث خطأ في تعطيل 2FA' 
        });
    }
});

// ========== لوحة المتصدرين ==========

app.get('/api/leaderboard', async (req, res) => {
    try {
        const leaderboard = await db.getLeaderboard(15);
        res.json({ success: true, leaderboard });
    } catch(e) {
        res.json({ success: true, leaderboard: [] });
    }
});

// ========== الصفحات الثابتة ==========

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'mining-app', 'index.html'));
});

app.get('/terms', (req, res) => {
    res.sendFile(path.join(__dirname, 'mining-app', 'terms.html'));
});

// ========== معالج الأخطاء العام ==========

app.use((err, req, res, next) => {
    console.error('❌ Server Error:', err.message);
    res.status(500).json({ 
        success: false, 
        message: '❌ خطأ في الخادم: ' + err.message 
    });
});

// ========== إعداد بوت التلجرام ==========
const bot = new Telegraf(process.env.BOT_TOKEN);

// جعل البوت متاحاً عالمياً لقاعدة البيانات
global.botInstance = bot;

// تصدير البوت للاستخدام في الملفات الأخرى
module.exports.bot = bot;

// ========== Middleware للبوت ==========

// تسجيل جميع الأوامر
bot.use(async (ctx, next) => {
    try {
        const startTime = Date.now();
        await next();
        const ms = Date.now() - startTime;
        console.log(`🤖 ${ctx.updateType} from ${ctx.from?.id} - ${ms}ms`);
    } catch (e) {
        console.error('Bot middleware error:', e.message);
    }
});

// ========== أوامر البوت ==========

// أمر البداية
bot.start(async (ctx) => {
    try {
        const user = ctx.from;
        const referrer = ctx.startPayload ? parseInt(ctx.startPayload) : null;
        
        // تسجيل المستخدم
        const result = await db.registerUser(
            user.id,
            user.username || '',
            user.first_name || '',
            user.last_name || '',
            '',
            '',
            'SD',
            '',
            referrer,
            'ar',
            ctx.message?.chat?.id?.toString() || '',
            ctx.message?.from?.is_bot ? 'Bot' : 'User'
        );
        
        const price = await db.getMarketPrice();
        
        const welcomeMessage = result.isNew 
            ? `🎉 *أهلاً بك في منصة CRYSTAL Exchange!*\n\n` +
              `✨ تم إنشاء حسابك بنجاح\n` +
              `🎁 *هدية ترحيبية: 1,000 CRYSTAL*\n\n` +
              `👤 *المستخدم:* ${user.first_name}\n` +
              `💰 *السعر الحالي:* ${price} USDT\n` +
              `📊 *1 CRYSTAL = ${(price * 500).toFixed(2)} حبة*\n\n` +
              `🚀 *اضغط على الزر أدناه لبدء التداول*`
            : `👋 *أهلاً بعودتك!*\n\n` +
              `👤 *المستخدم:* ${user.first_name}\n` +
              `💰 *السعر الحالي:* ${price} USDT\n` +
              `📊 *إجمالي العرض:* 5,000,000 CRYSTAL\n\n` +
              `🚀 *اضغط على الزر أدناه لبدء التداول*`;
        
        await ctx.reply(welcomeMessage, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.webApp('💎 فتح منصة التداول', WEBAPP_URL)],
                [Markup.button.url('📜 الشروط والأحكام', `${WEBAPP_URL}/terms`)]
            ])
        });
        
    } catch (e) {
        console.error('Start command error:', e.message);
        await ctx.reply('❌ حدث خطأ. الرجاء المحاولة مرة أخرى.');
    }
});

// أمر المساعدة
bot.command('help', async (ctx) => {
    try {
        await ctx.reply(
            `📚 *الأوامر المتاحة:*\n\n` +
            `/start - بدء استخدام البوت\n` +
            `/price - عرض سعر CRYSTAL الحالي\n` +
            `/balance - عرض رصيدك\n` +
            `/stats - إحصائيات السوق\n` +
            `/orders - عرض الطلبات النشطة\n` +
            `/buy [السعر] [الكمية] - إنشاء أمر شراء\n` +
            `/sell [السعر] [الكمية] - إنشاء أمر بيع\n` +
            `/cancel [رقم الطلب] - إلغاء أمر\n` +
            `/referral - معلومات الإحالات\n` +
            `/help - عرض هذه القائمة`,
            { parse_mode: 'Markdown' }
        );
    } catch (e) {
        console.error('Help command error:', e.message);
    }
});

// أمر السعر
bot.command('price', async (ctx) => {
    try {
        const price = await db.getMarketPrice();
        const stats = await db.getMarketStats();
        
        await ctx.reply(
            `💎 *سعر CRYSTAL*\n\n` +
            `💰 *السعر:* ${price} USDT\n` +
            `📊 *1 CRYSTAL = ${(price * 500).toFixed(2)} حبة*\n` +
            `📈 *التغير 24h:* ${stats.change24h?.toFixed(2) || 0}%\n` +
            `📊 *الحجم 24h:* ${stats.volume24h?.toFixed(2) || 0} CRYSTAL`,
            { parse_mode: 'Markdown' }
        );
    } catch (e) {
        await ctx.reply('❌ حدث خطأ في جلب السعر');
    }
});

// أمر الرصيد
bot.command('balance', async (ctx) => {
    try {
        const stats = await db.getUserStats(ctx.from.id);
        
        if (!stats) {
            return ctx.reply('⚠️ لم يتم العثور على حسابك. استخدم /start للتسجيل');
        }
        
        await ctx.reply(
            `💰 *رصيدك*\n\n` +
            `💎 *CRYSTAL:* ${stats.crystalBalance?.toFixed(2) || 0}\n` +
            `💵 *USDT:* ${stats.usdtBalance?.toFixed(2) || 0}\n\n` +
            `📊 *الصفقات:* ${stats.totalTrades || 0}\n` +
            `📦 *الطلبات المفتوحة:* ${stats.openOrders || 0}`,
            { parse_mode: 'Markdown' }
        );
    } catch (e) {
        await ctx.reply('❌ حدث خطأ في جلب الرصيد');
    }
});

// أمر الإحصائيات
bot.command('stats', async (ctx) => {
    try {
        const stats = await db.getMarketStats();
        
        await ctx.reply(
            `📊 *إحصائيات السوق*\n\n` +
            `💎 *سعر CRYSTAL:* ${stats.price} USDT\n` +
            `📈 *التغير 24h:* ${stats.change24h?.toFixed(2) || 0}%\n` +
            `📊 *حجم التداول 24h:* ${stats.volume24h?.toFixed(2) || 0} CRYSTAL\n` +
            `🟢 *طلبات الشراء:* ${stats.buyOrders}\n` +
            `🔴 *طلبات البيع:* ${stats.sellOrders}\n` +
            `🔄 *إجمالي الصفقات:* ${stats.totalTrades}\n` +
            `💰 *إجمالي الحجم:* ${stats.totalVolume?.toFixed(2) || 0} USDT`,
            { parse_mode: 'Markdown' }
        );
    } catch (e) {
        await ctx.reply('❌ حدث خطأ في جلب الإحصائيات');
    }
});

// أمر الإحالات
bot.command('referral', async (ctx) => {
    try {
        const data = await db.getReferralData(ctx.from.id);
        
        await ctx.reply(
            `👥 *نظام الإحالات*\n\n` +
            `🔗 *رابط الإحالة الخاص بك:*\n` +
            `\`${data.referralLink}\`\n\n` +
            `👥 *عدد المدعوين:* ${data.referralCount}\n` +
            `💰 *أرباح الإحالات:* ${data.referralEarnings?.toFixed(2) || 0} USDT\n` +
            `📊 *نسبة العمولة:* ${data.referralCommissionRate}%\n\n` +
            `📤 لنقل الأرباح إلى محفظتك، استخدم المنصة`,
            { parse_mode: 'Markdown' }
        );
    } catch (e) {
        await ctx.reply('❌ حدث خطأ في جلب معلومات الإحالات');
    }
});

// أمر الشراء
bot.command('buy', async (ctx) => {
    try {
        const args = ctx.message.text.split(' ');
        
        if (args.length < 3) {
            return ctx.reply('❌ *الاستخدام:* `/buy [السعر] [الكمية]`\nمثال: `/buy 0.002 1000`', { parse_mode: 'Markdown' });
        }
        
        const price = parseFloat(args[1]);
        const amount = parseFloat(args[2]);
        
        if (isNaN(price) || isNaN(amount)) {
            return ctx.reply('❌ السعر والكمية يجب أن يكونا أرقاماً');
        }
        
        const result = await db.createOrder(ctx.from.id, 'buy', price, amount);
        await ctx.reply(result.message, { parse_mode: 'Markdown' });
        
    } catch (e) {
        await ctx.reply('❌ حدث خطأ في إنشاء أمر الشراء');
    }
});

// أمر البيع
bot.command('sell', async (ctx) => {
    try {
        const args = ctx.message.text.split(' ');
        
        if (args.length < 3) {
            return ctx.reply('❌ *الاستخدام:* `/sell [السعر] [الكمية]`\nمثال: `/sell 0.003 500`', { parse_mode: 'Markdown' });
        }
        
        const price = parseFloat(args[1]);
        const amount = parseFloat(args[2]);
        
        if (isNaN(price) || isNaN(amount)) {
            return ctx.reply('❌ السعر والكمية يجب أن يكونا أرقاماً');
        }
        
        const result = await db.createOrder(ctx.from.id, 'sell', price, amount);
        await ctx.reply(result.message, { parse_mode: 'Markdown' });
        
    } catch (e) {
        await ctx.reply('❌ حدث خطأ في إنشاء أمر البيع');
    }
});

// أمر إلغاء الطلب
bot.command('cancel', async (ctx) => {
    try {
        const args = ctx.message.text.split(' ');
        
        if (!args[1]) {
            return ctx.reply('❌ *الاستخدام:* `/cancel [رقم الطلب]`', { parse_mode: 'Markdown' });
        }
        
        const result = await db.cancelOrder(args[1], ctx.from.id);
        await ctx.reply(result.message, { parse_mode: 'Markdown' });
        
    } catch (e) {
        await ctx.reply('❌ حدث خطأ في إلغاء الطلب');
    }
});

// أمر عرض الطلبات
bot.command('orders', async (ctx) => {
    try {
        const buys = await db.getActiveOrders('buy', 5);
        const sells = await db.getActiveOrders('sell', 5);
        
        let text = '📊 *أفضل 5 طلبات شراء:*\n';
        const buyList = Array.isArray(buys) ? buys : (buys.orders || []);
        
        if (buyList.length > 0) {
            for (const o of buyList.slice(0, 5)) {
                text += `💰 ${o.price} USDT | 📦 ${o.amount?.toFixed(2) || 0} CRYSTAL\n`;
            }
        } else {
            text += 'لا توجد طلبات شراء\n';
        }
        
        text += '\n📊 *أفضل 5 طلبات بيع:*\n';
        const sellList = Array.isArray(sells) ? sells : (sells.orders || []);
        
        if (sellList.length > 0) {
            for (const o of sellList.slice(0, 5)) {
                text += `💰 ${o.price} USDT | 📦 ${o.amount?.toFixed(2) || 0} CRYSTAL\n`;
            }
        } else {
            text += 'لا توجد طلبات بيع';
        }
        
        await ctx.reply(text, { parse_mode: 'Markdown' });
        
    } catch (e) {
        await ctx.reply('❌ حدث خطأ في جلب الطلبات');
    }
});

// أمر الأدمن
bot.command('admin', async (ctx) => {
    try {
        const adminCheck = await db.isAdmin(ctx.from.id);
        
        if (!adminCheck && !isAdmin(ctx.from.id)) {
            return ctx.reply('⛔ هذا الأمر للأدمن فقط');
        }
        
        await ctx.reply('👑 *لوحة تحكم الأدمن*', {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🆔 طلبات التوثيق', 'pending_kyc')],
                [Markup.button.callback('💰 طلبات السحب', 'pending_withdraws')],
                [Markup.button.callback('📤 طلبات الإيداع', 'pending_deposits')],
                [Markup.button.callback('📊 إحصائيات', 'global_stats')],
                [Markup.button.webApp('💎 فتح المنصة', WEBAPP_URL)]
            ])
        });
        
    } catch (e) {
        await ctx.reply('❌ حدث خطأ');
    }
});

// ========== أزرار الأدمن ==========

bot.action('pending_kyc', async (ctx) => {
    try {
        if (!isAdmin(ctx.from.id)) {
            return ctx.answerCbQuery('⛔ للأدمن فقط');
        }
        
        const pending = await db.getPendingKycRequests();
        
        if (!pending || pending.length === 0) {
            return ctx.editMessageText('📭 *لا توجد طلبات توثيق معلقة*', { parse_mode: 'Markdown' });
        }
        
        let text = `🆔 *طلبات التوثيق المعلقة (${pending.length})*\n\n`;
        
        for (const req of pending.slice(0, 10)) {
            text += `📋 *${req._id.toString().slice(-8)}*\n` +
                    `👤 ${req.fullName}\n` +
                    `📧 ${req.email || 'غير محدد'}\n` +
                    `📱 ${req.phoneNumber || 'غير محدد'}\n` +
                    `🌍 ${req.country || 'غير محدد'}\n` +
                    `━━━━━━━━━━━━━\n`;
        }
        
        if (pending.length > 10) {
            text += `\n... و ${pending.length - 10} طلب آخر`;
        }
        
        await ctx.editMessageText(text, { parse_mode: 'Markdown' });
        await ctx.answerCbQuery();
        
    } catch (e) {
        console.error('Pending KYC error:', e.message);
        await ctx.answerCbQuery('❌ حدث خطأ');
    }
});

bot.action('pending_withdraws', async (ctx) => {
    try {
        if (!isAdmin(ctx.from.id)) {
            return ctx.answerCbQuery('⛔ للأدمن فقط');
        }
        
        const pending = await db.getPendingWithdraws();
        
        if (!pending || pending.length === 0) {
            return ctx.editMessageText('📭 *لا توجد طلبات سحب معلقة*', { parse_mode: 'Markdown' });
        }
        
        let text = `💰 *طلبات السحب المعلقة (${pending.length})*\n\n`;
        
        for (const req of pending.slice(0, 10)) {
            text += `🆔 *${req._id.toString().slice(-8)}*\n` +
                    `👤 المستخدم: ${req.userId}\n` +
                    `💰 المبلغ: ${req.amount} USDT\n` +
                    `🌐 الشبكة: ${req.network}\n` +
                    `📤 العنوان: \`${req.address?.slice(0, 20)}...\`\n` +
                    `━━━━━━━━━━━━━\n`;
        }
        
        await ctx.editMessageText(text, { parse_mode: 'Markdown' });
        await ctx.answerCbQuery();
        
    } catch (e) {
        console.error('Pending withdraws error:', e.message);
        await ctx.answerCbQuery('❌ حدث خطأ');
    }
});

bot.action('pending_deposits', async (ctx) => {
    try {
        if (!isAdmin(ctx.from.id)) {
            return ctx.answerCbQuery('⛔ للأدمن فقط');
        }
        
        const pending = await db.getPendingDeposits();
        
        if (!pending || pending.length === 0) {
            return ctx.editMessageText('📭 *لا توجد طلبات إيداع معلقة*', { parse_mode: 'Markdown' });
        }
        
        let text = `📤 *طلبات الإيداع المعلقة (${pending.length})*\n\n`;
        
        for (const req of pending.slice(0, 10)) {
            text += `🆔 *${req._id.toString().slice(-8)}*\n` +
                    `👤 المستخدم: ${req.userId}\n` +
                    `💰 المبلغ: ${req.amount} USDT\n` +
                    `🌐 الشبكة: ${req.network}\n` +
                    `━━━━━━━━━━━━━\n`;
        }
        
        await ctx.editMessageText(text, { parse_mode: 'Markdown' });
        await ctx.answerCbQuery();
        
    } catch (e) {
        console.error('Pending deposits error:', e.message);
        await ctx.answerCbQuery('❌ حدث خطأ');
    }
});

bot.action('global_stats', async (ctx) => {
    try {
        if (!isAdmin(ctx.from.id)) {
            return ctx.answerCbQuery('⛔ للأدمن فقط');
        }
        
        const stats = await db.getMarketStats();
        const users = await require('./models').User.countDocuments();
        const verified = await require('./models').User.countDocuments({ isVerified: true });
        
        await ctx.editMessageText(
            `📊 *إحصائيات المنصة*\n\n` +
            `👥 *المستخدمين:*\n` +
            `   • الإجمالي: ${users}\n` +
            `   • الموثقين: ${verified}\n\n` +
            `💎 *السوق:*\n` +
            `   • سعر CRYSTAL: ${stats.price} USDT\n` +
            `   • التغير 24h: ${stats.change24h?.toFixed(2) || 0}%\n` +
            `   • الحجم 24h: ${stats.volume24h?.toFixed(2) || 0} CRYSTAL\n\n` +
            `📊 *التداول:*\n` +
            `   • طلبات شراء: ${stats.buyOrders}\n` +
            `   • طلبات بيع: ${stats.sellOrders}\n` +
            `   • إجمالي الصفقات: ${stats.totalTrades}\n` +
            `   • إجمالي الحجم: ${stats.totalVolume?.toFixed(2) || 0} USDT`,
            { parse_mode: 'Markdown' }
        );
        await ctx.answerCbQuery();
        
    } catch (e) {
        console.error('Global stats error:', e.message);
        await ctx.answerCbQuery('❌ حدث خطأ');
    }
});

// ========== معالجة أخطاء البوت ==========

bot.catch((err, ctx) => {
    console.error(`❌ Bot error for ${ctx.updateType}:`, err.message);
    ctx.reply('❌ حدث خطأ غير متوقع. الرجاء المحاولة مرة أخرى.').catch(() => {});
});

// ========== تشغيل الخادم والبوت ==========

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Web server started on port ${PORT}`);
    console.log(`🌐 WebApp URL: ${WEBAPP_URL}`);
    console.log(`👑 Admin IDs: ${ADMIN_IDS.join(', ')}`);
});

// بدء البوت
(async () => {
    try {
        // الاتصال بقاعدة البيانات أولاً
        await db.connect();
        console.log('✅ Database connected successfully');
        
        // حذف الويب هوك القديم
        await bot.telegram.deleteWebhook();
        console.log('✅ Old webhook deleted');
        
        // إعداد الويب هوك الجديد
        const webhookUrl = `${WEBAPP_URL}/webhook`;
        await bot.telegram.setWebhook(webhookUrl);
        console.log(`✅ Webhook set to: ${webhookUrl}`);
        
        // استخدام الويب هوك
        app.use(bot.webhookCallback('/webhook'));
        
        // معلومات البوت
        const botInfo = await bot.telegram.getMe();
        console.log(`✅ Bot @${botInfo.username} is ready`);
        console.log(`✅ Bot ID: ${botInfo.id}`);
        
        // رسالة جاهزية
        console.log('🚀 CRYSTAL Exchange is running!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
    } catch (error) {
        console.error('❌ Startup error:', error.message);
        
        // محاولة استخدام polling كخطة بديلة
        console.log('⚠️ Trying polling mode...');
        try {
            await bot.telegram.deleteWebhook();
            bot.launch();
            console.log('✅ Bot started in polling mode');
        } catch (pollingError) {
            console.error('❌ Polling also failed:', pollingError.message);
        }
    }
})();

// ========== إغلاق نظيف ==========

process.once('SIGINT', async () => {
    console.log('🛑 SIGINT received. Shutting down...');
    await bot.telegram.deleteWebhook();
    bot.stop('SIGINT');
    server.close();
    process.exit(0);
});

process.once('SIGTERM', async () => {
    console.log('🛑 SIGTERM received. Shutting down...');
    await bot.telegram.deleteWebhook();
    bot.stop('SIGTERM');
    server.close();
    process.exit(0);
});

// ========== معالجة الأخطاء غير المتوقعة ==========

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error.message);
    console.error(error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise);
    console.error('Reason:', reason);
});
