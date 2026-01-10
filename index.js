const express = require('express'); // ✅ صحيح
const admin = require("firebase-admin");
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// 1. نظام الحماية من السبام (Anti-Spam System) - 🛡️
// ============================================================
const userCooldowns = {}; // ذاكرة مؤقتة لتخزين توقيت آخر عملية

function isSpam(uid) {
    if (!uid) return false;
    const now = Date.now();
    const lastAction = userCooldowns[uid] || 0;
    
    // هل مرت أقل من 3 ثوانٍ (3000 ميلي ثانية)؟
    if (now - lastAction < 3000) {
        return true; // نعم، هذا سبام (سريع جداً)
    }
    
    // تحديث التوقيت والسماح بالعملية
    userCooldowns[uid] = now;
    return false;
}

// تنظيف الذاكرة كل ساعة لتوفير الرام
setInterval(() => {
    const now = Date.now();
    for (const uid in userCooldowns) {
        if (now - userCooldowns[uid] > 3600000) delete userCooldowns[uid];
    }
}, 3600000);

// ============================================================
// 2. الاتصال الآمن (Secure Connection)
// ============================================================
let serviceAccount;
try {
    const envKey = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (envKey) {
        serviceAccount = JSON.parse(envKey);
        console.log("✅ Credentials loaded.");
    } else {
        console.error("❌ CRITICAL: FIREBASE_SERVICE_ACCOUNT is missing.");
    }
} catch (error) { console.error("❌ Error parsing credentials:", error); }

if (serviceAccount) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
    });
}

const db = admin.apps.length ? admin.database() : null;

// ============================================================
// 3. السيرفر ونبض القلب (Heartbeat)
// ============================================================
// هذا الرابط لـ Uptime Robot
app.get('/', (req, res) => { res.send('🛡️ SDM CORE ENGINE (SECURE BANK) IS RUNNING.'); });

app.listen(PORT, () => { 
    console.log(`🚀 Server running on port ${PORT}`); 
});

if (db) {
    console.log("💓 System Heartbeat started...");
    setInterval(() => {
        // تحديث الحالة لتراها الواجهة الأمامية
        db.ref('system/status').update({ 
            last_online: admin.database.ServerValue.TIMESTAMP,
            active: true 
        }).catch(err => console.error('Heartbeat Error:', err));
    }, 60000);
}

// ============================================================
// 4. المحرك المالي والعمليات (Financial Engine)
// ============================================================
if (db) {
    console.log("💰 Financial Engine is listening for requests...");

    // --------------------------------------------------------
    // أ) معالجة التحويلات (Transfers)
    // --------------------------------------------------------
    db.ref('requests/transfers').on('child_added', async (snap) => {
        const req = snap.val();
        const reqId = snap.key;
        
        // 1. فحص السبام
        if (isSpam(req.from)) {
            console.log(`🚫 Spam Transfer detected from ${req.from}`);
            db.ref(`alerts/${req.from}`).push({ msg: "⚠️ انتظر 3 ثوانٍ بين العمليات", type: "error" });
            return snap.ref.remove();
        }

        // 2. التحقق
        if (!req.from || !req.to || !req.amount || req.amount <= 0) {
            return snap.ref.remove();
        }

        // 3. التنفيذ
        await db.ref(`users/${req.from}/sdmBalance`).transaction(currentBal => {
            if ((currentBal || 0) < req.amount) return; // رصيد غير كاف
            return (currentBal || 0) - req.amount;
        }, async (error, committed) => {
            if (!committed) {
                db.ref(`alerts/${req.from}`).push({ msg: "❌ فشل التحويل: رصيد غير كاف", type: "error" });
                db.ref(`requests/transfers/${reqId}`).remove();
            } else {
                await db.ref(`users/${req.to}/sdmBalance`).transaction(b => (b || 0) + req.amount);
                
                db.ref('transactions').push({
                    type: 'transfer', from: req.from, to: req.to, amount: req.amount, date: Date.now()
                });

                db.ref(`alerts/${req.to}`).push({ msg: `💰 استلمت ${req.amount} SDM`, type: "success" });
                db.ref(`alerts/${req.from}`).push({ msg: `✅ تم إرسال ${req.amount} SDM`, type: "success" });
                db.ref(`requests/transfers/${reqId}`).remove();
                console.log(`✅ Transfer: ${req.amount} from ${req.from} to ${req.to}`);
            }
        });
    });

    // --------------------------------------------------------
    // ب) أوامر الشراء (Market BUY)
    // --------------------------------------------------------
    db.ref('market/orders/buy').on('child_added', async (snap) => {
        const order = snap.val();
        const orderId = snap.key;
        
        if(order.status !== 'pending') return;

        // 1. فحص السبام
        if (isSpam(order.uP)) {
            console.log(`🚫 Spam Buy Order from ${order.uP}`);
            db.ref(`alerts/${order.uP}`).push({ msg: "⚠️ تمهل قليلاً!", type: "error" });
            return snap.ref.remove();
        }

        const totalCost = order.price * order.amount;
        let fundsLocked = false;

        // 2. حجز الأموال
        await db.ref(`users/${order.uP}/sdmBalance`).transaction(bal => {
            if ((bal || 0) < totalCost) return;
            return (bal || 0) - totalCost;
        }, (err, committed) => {
            if (committed) fundsLocked = true;
        });

        if (!fundsLocked) {
            console.log(`❌ Rejected Buy Order: No funds for ${order.uP}`);
            return db.ref(`market/orders/buy/${orderId}`).remove();
        }

        // 3. المطابقة
        const matchSnap = await db.ref('market/orders/sell')
                                  .orderByChild('price')
                                  .endAt(order.price)
                                  .limitToFirst(1)
                                  .once('value');
        
        if (matchSnap.exists()) {
            const sellKey = Object.keys(matchSnap.val())[0];
            const sellOrder = matchSnap.val()[sellKey];
            
            const tradeAmount = Math.min(order.amount, sellOrder.amount);
            const executionPrice = sellOrder.price;
            const tradeValue = tradeAmount * executionPrice;

            console.log(`⚡ MATCH: Buy(${orderId}) & Sell(${sellKey}) @ ${executionPrice}`);

            // التسوية
            await db.ref(`users/${sellOrder.uP}/sdmBalance`).transaction(b => (b || 0) + tradeValue);
            await db.ref(`users/${sellOrder.uP}/mrkBalance`).transaction(m => (m || 0) - tradeAmount);
            await db.ref(`users/${order.uP}/mrkBalance`).transaction(m => (m || 0) + tradeAmount);
            
            const refund = (order.price - executionPrice) * tradeAmount;
            if (refund > 0) {
                await db.ref(`users/${order.uP}/sdmBalance`).transaction(b => (b || 0) + refund);
            }

            // التحديث
            db.ref('market/trades').push({ price: executionPrice, amount: tradeAmount, date: Date.now() });
            db.ref('market/stats/lastPrice').set(executionPrice);

            if (order.amount > tradeAmount) {
                db.ref(`market/orders/buy/${orderId}`).update({ amount: order.amount - tradeAmount });
            } else {
                db.ref(`market/orders/buy/${orderId}`).remove();
            }

            if (sellOrder.amount > tradeAmount) {
                db.ref(`market/orders/sell/${sellKey}`).update({ amount: sellOrder.amount - tradeAmount });
            } else {
                db.ref(`market/orders/sell/${sellKey}`).remove();
            }

        } else {
            console.log(`⏳ Buy Order Queued: ${orderId}`);
        }
    });

    // --------------------------------------------------------
    // ج) أوامر البيع (Market SELL)
    // --------------------------------------------------------
    db.ref('market/orders/sell').on('child_added', async (snap) => {
        const order = snap.val();
        const orderId = snap.key;

        if(order.status !== 'pending') return;

        // 1. فحص السبام
        if (isSpam(order.uP)) {
            console.log(`🚫 Spam Sell Order from ${order.uP}`);
            db.ref(`alerts/${order.uP}`).push({ msg: "⚠️ تمهل قليلاً!", type: "error" });
            return snap.ref.remove();
        }

        let assetLocked = false;
        await db.ref(`users/${order.uP}/mrkBalance`).transaction(bal => {
            if ((bal || 0) < order.amount) return;
            return (bal || 0) - order.amount;
        }, (err, committed) => {
            if (committed) assetLocked = true;
        });

        if (!assetLocked) {
            console.log(`❌ Rejected Sell Order: No MRK for ${order.uP}`);
            return db.ref(`market/orders/sell/${orderId}`).remove();
        }
        console.log(`⏳ Sell Order Queued: ${orderId}`);
    });

    // --------------------------------------------------------
    // د) معالجة طلبات الألعاب (Game Orders)
    // --------------------------------------------------------
    db.ref('game_orders').on('child_added', async (snap) => {
        const order = snap.val();
        const orderId = snap.key;

        if (order.status !== 'pending') return;

        // 1. فحص السبام
        if (isSpam(order.uP)) {
            console.log(`🚫 Spam Game Order from ${order.uP}`);
            db.ref(`alerts/${order.uP}`).push({ msg: "⚠️ تمهل قليلاً!", type: "error" });
            return snap.ref.remove();
        }

        // 2. الخصم
        await db.ref(`users/${order.uP}/sdmBalance`).transaction(currentBal => {
            if ((currentBal || 0) < order.cost) return; // رصيد غير كاف
            return (currentBal || 0) - order.cost;
        }, (error, committed) => {
            if (committed) {
                db.ref(`game_orders/${orderId}`).update({ status: 'paid_waiting_execution' });
                console.log(`🎮 Game Order Paid: ${order.cost} SDM by ${order.uN}`);
            } else {
                db.ref(`game_orders/${orderId}`).update({ status: 'rejected_no_funds' });
                db.ref(`alerts/${order.uP}`).push({ msg: "❌ رصيد غير كاف لطلب اللعبة", type: "error" });
            }
        });
    });

    // --------------------------------------------------------
    // هـ) معالجة التقييمات (Ratings)
    // --------------------------------------------------------
    db.ref('rating_queue').on('child_added', async (snap) => {
        const d = snap.val();
        
        if (isSpam(d.rater)) return snap.ref.remove();

        await db.ref(`users/${d.target}`).transaction(u => {
            if (!u) return u;
            const count = u.ratingCount || 1;
            const newR = ((u.rating || 5) * count + d.stars) / (count + 1);
            u.rating = parseFloat(newR.toFixed(1));
            u.ratingCount = count + 1;
            return u;
        });
        snap.ref.remove();
    });

    // --------------------------------------------------------
    // و) حماية المحتوى والطلبات الأخرى (Content Protection) - جديد 🛡️
    // --------------------------------------------------------
    
    // 1. حماية المنشورات العادية
    db.ref('posts').on('child_added', (snap) => {
        const p = snap.val();
        if (isSpam(p.uP)) {
            console.log(`🗑️ Spam Post deleted from ${p.uN}`);
            snap.ref.remove();
            db.ref(`alerts/${p.uP}`).push({ msg: "⚠️ تم حذف المنشور: تكرار سريع!", type: "error" });
        }
    });

    // 2. حماية منشورات VIP
    db.ref('vip_posts').on('child_added', (snap) => {
        const p = snap.val();
        if (isSpam(p.uP)) {
            snap.ref.remove();
            db.ref(`alerts/${p.uP}`).push({ msg: "⚠️ تم حذف المنشور: تكرار سريع!", type: "error" });
        }
    });

    // 3. حماية طلبات الإيداع (شراء العملة)
    db.ref('coin_requests').on('child_added', (snap) => {
        const req = snap.val();
        if (req.status !== 'pending') return;
        
        if (isSpam(req.uP)) {
            console.log(`🗑️ Spam Coin Request deleted from ${req.uN}`);
            snap.ref.remove();
            db.ref(`alerts/${req.uP}`).push({ msg: "⚠️ طلب إيداع مكرر، تم الحذف!", type: "error" });
        }
    });
}
