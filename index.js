const express = require('express');
const admin = require("firebase-admin");
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// 1. إعدادات الاتصال (Firebase Setup)
// ============================================================
let serviceAccount;
try {
    const envKey = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (envKey) {
        serviceAccount = JSON.parse(envKey);
    } else {
        serviceAccount = require("./serviceAccountKey.json");
    }
} catch (error) { console.error("❌ Credentials Error:", error); }

if (serviceAccount) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
    });
}
const db = admin.database();

// ============================================================
// 2. أدوات الحماية والتحقق (Security Utils) 🛡️
// ============================================================

// نظام حماية من التكرار السريع (Anti-Spam)
const userCooldowns = {};
function isSpam(uid) {
    if (!uid) return true;
    const now = Date.now();
    const lastAction = userCooldowns[uid] || 0;
    if (now - lastAction < 1000) return true; // ثانية واحدة بين كل طلب
    userCooldowns[uid] = now;
    return false;
}

// التحقق الصارم من صحة الأرقام (Anti-Hack Validation)
function isValidNumber(num) {
    return typeof num === 'number' && !isNaN(num) && isFinite(num) && num > 0;
}

// دالة لتنظيف الأرقام العشرية الطويلة
function fixFloat(num) {
    return parseFloat(num.toFixed(4));
}

// تحديث السعر العام
function updateGlobalPrice(price) {
    if(isValidNumber(price)) {
        db.ref('market/current_price').set(price);
    }
}

// تشغيل السيرفر
app.get('/', (req, res) => { res.send('🛡️ SDM SECURE TRADING ENGINE IS ACTIVE.'); });
app.listen(PORT, () => { console.log(`🚀 Secure Bot Active on Port: ${PORT}`); });

// نبض النظام (Heartbeat)
setInterval(() => {
    db.ref('system/status').update({ last_online: admin.database.ServerValue.TIMESTAMP });
}, 60000);

console.log("💰 Financial Engine Started with High Security...");

// ============================================================
// 3. معالجة أوامر الشراء (Buy Orders)
// ============================================================
db.ref('market/orders/buy').on('child_added', async (snap) => {
    const order = snap.val();
    
    // 1. التحقق الأمني (Security Check)
    if (!order || order.status !== 'pending') return;
    
    // التحقق من القيم السالبة أو الصفرية أو غير الرقمية
    if (!isValidNumber(order.price) || !isValidNumber(order.amount)) {
        console.log(`⛔ هجوم محتمل أو بيانات فاسدة من ${order.uN || 'مجهول'}`);
        return snap.ref.remove();
    }

    if (isSpam(order.uP)) {
        console.log(`⚠️ تم تجاهل طلب سبام من ${order.uN}`);
        return snap.ref.remove();
    }

    const totalCost = fixFloat(order.price * order.amount);
    const uid = order.uP;

    console.log(`📥 شراء: ${order.amount} MRK بسعر ${order.price} | المستخدم: ${order.uN}`);

    try {
        // 2. خصم الرصيد (Transaction)
        const result = await db.ref(`users/${uid}/sdmBalance`).transaction(currentBal => {
            if ((currentBal || 0) < totalCost) return; // إلغاء إذا الرصيد غير كاف
            return fixFloat((currentBal || 0) - totalCost);
        });

        if (!result.committed) {
            console.log(`❌ فشل الشراء لـ ${order.uN}: رصيد غير كافٍ.`);
            return snap.ref.remove();
        }

        // 3. البحث عن بائع (Matching)
        const matchSnapshot = await db.ref('market/orders/sell')
            .orderByChild('price')
            .endAt(order.price)
            .limitToFirst(1)
            .once('value');

        if (matchSnapshot.exists()) {
            const sellerKey = Object.keys(matchSnapshot.val())[0];
            const sellerOrder = matchSnapshot.val()[sellerKey];
            
            // تجاهل التداول مع النفس (اختياري لكن مفضل)
            if (sellerOrder.uP === uid) {
                 console.log("⚠️ تخطي: المستخدم يحاول التداول مع نفسه.");
                 // نترك الطلب معلقاً ولا ننفذه الآن
                 return;
            }

            const tradeAmount = Math.min(order.amount, sellerOrder.amount);
            const tradePrice = sellerOrder.price; 
            const totalTradeValue = fixFloat(tradeAmount * tradePrice);

            console.log(`🤝 تنفيذ صفقة: ${tradeAmount} وحدة بسعر ${tradePrice}`);

            // تحويل الأموال
            await db.ref(`users/${sellerOrder.uP}/sdmBalance`).transaction(b => fixFloat((b || 0) + totalTradeValue));
            await db.ref(`users/${uid}/mrkBalance`).transaction(m => fixFloat((m || 0) + tradeAmount));

            // إرجاع الفارق
            const refund = fixFloat((order.price - tradePrice) * tradeAmount);
            if (refund > 0) {
                await db.ref(`users/${uid}/sdmBalance`).transaction(b => fixFloat((b || 0) + refund));
            }

            updateGlobalPrice(tradePrice);

            // تسجيل المعاملة
            db.ref('market/transactions').push({
                price: tradePrice,
                amount: tradeAmount,
                buyer: uid,
                seller: sellerOrder.uP,
                timestamp: admin.database.ServerValue.TIMESTAMP
            });

            // تحديث الطلبات
            if (order.amount > tradeAmount) {
                await snap.ref.update({ amount: fixFloat(order.amount - tradeAmount) });
            } else {
                await snap.ref.remove();
            }

            if (sellerOrder.amount > tradeAmount) {
                await db.ref(`market/orders/sell/${sellerKey}`).update({ amount: fixFloat(sellerOrder.amount - tradeAmount) });
            } else {
                await db.ref(`market/orders/sell/${sellerKey}`).remove();
            }
        }

    } catch (error) {
        console.error("Critical Error in Buy Order:", error);
    }
});

// ============================================================
// 4. معالجة أوامر البيع (Sell Orders)
// ============================================================
db.ref('market/orders/sell').on('child_added', async (snap) => {
    const order = snap.val();
    
    if (!order || order.status !== 'pending') return;

    // 1. التحقق الأمني
    if (!isValidNumber(order.price) || !isValidNumber(order.amount)) {
        return snap.ref.remove();
    }
    
    if (isSpam(order.uP)) return snap.ref.remove();

    const uid = order.uP;
    console.log(`📤 بيع: ${order.amount} MRK بسعر ${order.price} | المستخدم: ${order.uN}`);

    try {
        // 2. خصم الرصيد
        const result = await db.ref(`users/${uid}/mrkBalance`).transaction(currentBal => {
            if ((currentBal || 0) < order.amount) return;
            return fixFloat((currentBal || 0) - order.amount);
        });

        if (!result.committed) {
            console.log(`❌ فشل البيع لـ ${order.uN}: رصيد MRK غير كافٍ.`);
            return snap.ref.remove();
        }

        // 3. البحث عن مشتري
        const matchSnapshot = await db.ref('market/orders/buy')
            .orderByChild('price')
            .startAt(order.price)
            .limitToLast(1)
            .once('value');

        if (matchSnapshot.exists()) {
            const buyerKey = Object.keys(matchSnapshot.val())[0];
            const buyerOrder = matchSnapshot.val()[buyerKey];

            if (buyerOrder.uP === uid) return; // منع التداول مع النفس

            const tradeAmount = Math.min(order.amount, buyerOrder.amount);
            const tradePrice = order.price;
            const totalTradeValue = fixFloat(tradeAmount * tradePrice);

            console.log(`🤝 تنفيذ صفقة: ${tradeAmount} وحدة`);

            await db.ref(`users/${uid}/sdmBalance`).transaction(b => fixFloat((b || 0) + totalTradeValue));
            await db.ref(`users/${buyerOrder.uP}/mrkBalance`).transaction(m => fixFloat((m || 0) + tradeAmount));

            updateGlobalPrice(tradePrice);
            
            db.ref('market/transactions').push({
                price: tradePrice,
                amount: tradeAmount,
                buyer: buyerOrder.uP,
                seller: uid,
                timestamp: admin.database.ServerValue.TIMESTAMP
            });

            if (order.amount > tradeAmount) {
                await snap.ref.update({ amount: fixFloat(order.amount - tradeAmount) });
            } else {
                await snap.ref.remove();
            }

            if (buyerOrder.amount > tradeAmount) {
                await db.ref(`market/orders/buy/${buyerKey}`).update({ amount: fixFloat(buyerOrder.amount - tradeAmount) });
            } else {
                await db.ref(`market/orders/buy/${buyerKey}`).remove();
            }
        }

    } catch (error) {
        console.error("Critical Error in Sell Order:", error);
    }
});

// ============================================================
// 5. استرجاع الرصيد عند الإلغاء (Refund System)
// ============================================================
db.ref('market/orders/buy').on('child_changed', async (snap) => {
    const order = snap.val();
    if (order.status === 'cancelled') {
        // حماية: التأكد من أن المبلغ المعاد صالح
        if (!isValidNumber(order.price) || !isValidNumber(order.amount)) {
            return snap.ref.remove();
        }

        const refund = fixFloat(order.price * order.amount);
        await db.ref(`users/${order.uP}/sdmBalance`).transaction(b => fixFloat((b || 0) + refund));
        
        db.ref(`alerts/${order.uP}`).push({ 
            msg: `🔄 تم إرجاع ${refund} SDM`, 
            type: "info",
            timestamp: admin.database.ServerValue.TIMESTAMP
        });
        snap.ref.remove(); 
    }
});

db.ref('market/orders/sell').on('child_changed', async (snap) => {
    const order = snap.val();
    if (order.status === 'cancelled') {
        if (!isValidNumber(order.amount)) return snap.ref.remove();

        await db.ref(`users/${order.uP}/mrkBalance`).transaction(b => fixFloat((b || 0) + order.amount));
        
        db.ref(`alerts/${order.uP}`).push({ 
            msg: `🔄 تم إرجاع ${order.amount} MRK`, 
            type: "info",
            timestamp: admin.database.ServerValue.TIMESTAMP
        });
        snap.ref.remove();
    }
});

// ============================================================
// 6. التحويلات (Transfers) - محصن 🛡️
// ============================================================
db.ref('requests/transfers').on('child_added', async (snap) => {
    const req = snap.val();
    
    // التحقق الأمني
    if (!req || req.status !== 'pending') return;
    if (!isValidNumber(req.amount)) return snap.ref.remove();
    if (req.from === req.to) return snap.ref.remove(); // تحويل لنفس الشخص
    if (isSpam(req.from)) return snap.ref.remove();

    try {
        const result = await db.ref(`users/${req.from}/sdmBalance`).transaction(bal => {
            if ((bal || 0) < req.amount) return;
            return fixFloat((bal || 0) - req.amount);
        });

        if (result.committed) {
            await db.ref(`users/${req.to}/sdmBalance`).transaction(b => fixFloat((b || 0) + req.amount));
            
            // تحديث السجلات
            snap.ref.update({ status: 'completed', processedAt: admin.database.ServerValue.TIMESTAMP });
            
            // الإشعارات
            db.ref(`alerts/${req.to}`).push({ msg: `💰 استلمت ${req.amount} SDM من ${req.from}`, type: "success" });
            db.ref(`alerts/${req.from}`).push({ msg: `✅ تم التحويل بنجاح`, type: "success" });
            
            // تسجيل في الأرشيف
            db.ref('transactions').push({
                type: 'transfer',
                from: req.from,
                to: req.to,
                amount: req.amount,
                timestamp: admin.database.ServerValue.TIMESTAMP
            });

            // حذف الطلب بعد الانتهاء لتوفير المساحة
            setTimeout(() => snap.ref.remove(), 5000); 

        } else {
            snap.ref.update({ status: 'rejected' });
            db.ref(`alerts/${req.from}`).push({ msg: "❌ فشل التحويل: رصيد غير كافٍ", type: "error" });
            setTimeout(() => snap.ref.remove(), 5000);
        }
    } catch (e) {
        console.error("Transfer Error:", e);
    }
});

// ============================================================
// 7. طلبات الألعاب (Game Orders)
// ============================================================
db.ref('game_orders').on('child_added', async (snap) => {
    const o = snap.val();
    if (!o || o.status !== 'pending') return;
    if (!isValidNumber(o.cost)) return snap.ref.remove();

    const result = await db.ref(`users/${o.uP}/sdmBalance`).transaction(bal => {
        if ((bal || 0) < o.cost) return;
        return fixFloat((bal || 0) - o.cost);
    });

    if (result.committed) {
        snap.ref.update({ status: 'paid_waiting_execution' });
        console.log(`🎮 طلب لعبة مدفوع: ${o.gameType} من ${o.uN}`);
    } else {
        snap.ref.update({ status: 'rejected_no_funds' });
        db.ref(`alerts/${o.uP}`).push({ msg: `❌ فشل الطلب: رصيد غير كاف`, type: "error" });
    }
});
