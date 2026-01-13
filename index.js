const admin = require("firebase-admin");
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// 1. إعدادات الهوية (يجب تعديلها)
// ============================================================
const ADMIN_UID = "ضع_هنا_ID_الأدمن_الخاص_بك"; // من تبويب Authentication

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
});

const db = admin.database();

// ============================================================
// 2. أدوات الحساب الدقيق والأمان
// ============================================================

// دالة لمعالجة الكسور ومنع أخطاء الجافاسكريبت (4 خانات عشرية)
const fixFloat = (n) => parseFloat(Number(n).toFixed(4));

// التحقق من صحة الأرقام
const isValid = (n) => typeof n === 'number' && !isNaN(n) && isFinite(n) && n > 0;

// نظام منع السبام (مستثنى منه الأدمن)
const userCooldowns = {};
function isSpam(uid) {
    if (uid === ADMIN_UID) return false;
    const now = Date.now();
    if (now - (userCooldowns[uid] || 0) < 1000) return true;
    userCooldowns[uid] = now;
    return false;
}

// تحديث السعر العالمي للسوق
function updateMarketPrice(price) {
    if (isValid(price)) {
        db.ref('market/current_price').set(fixFloat(price));
    }
}

// ============================================================
// 3. محرك أوامر الشراء (Buy Orders)
// ============================================================
db.ref('market/orders/buy').on('child_added', async (snap) => {
    const order = snap.val();
    if (!order || order.status !== 'pending') return;

    const uid = order.uP;
    if (isSpam(uid)) return snap.ref.remove();

    const price = Number(order.price);
    const amount = Number(order.amount);
    const totalCost = fixFloat(price * amount);

    if (!isValid(price) || !isValid(amount)) return snap.ref.remove();

    try {
        // حجز الرصيد من المشتري (SDM)
        const result = await db.ref(`users/${uid}/sdmBalance`).transaction(bal => {
            const current = Number(bal || 0);
            if (current < totalCost) return; // رصيد غير كافٍ
            return fixFloat(current - totalCost);
        });

        if (!result.committed) {
            console.log(`❌ فشل شراء: رصيد ${order.uN} غير كافٍ (${totalCost} SDM)`);
            db.ref(`alerts/${uid}`).push({ msg: "❌ رصيدك لا يكفي لفتح طلب الشراء", type: "error" });
            return snap.ref.update({ status: 'failed_insufficient_funds' });
        }

        // البحث عن أرخص بائع (Matching)
        const matchSnap = await db.ref('market/orders/sell')
            .orderByChild('price')
            .endAt(price)
            .limitToFirst(1)
            .once('value');

        if (matchSnap.exists()) {
            const mKey = Object.keys(matchSnap.val())[0];
            const mOrder = matchSnap.val()[mKey];
            
            if (mOrder.uP === uid) return; // منع التداول مع النفس

            const tAmount = Math.min(amount, mOrder.amount);
            const tPrice = mOrder.price;
            const tValue = fixFloat(tAmount * tPrice);

            console.log(`🤝 صفقة شراء: ${tAmount} MRK بسعر ${tPrice}`);

            // تنفيذ المناقلة المالية
            await db.ref(`users/${mOrder.uP}/sdmBalance`).transaction(b => fixFloat((Number(b) || 0) + tValue));
            await db.ref(`users/${uid}/mrkBalance`).transaction(b => fixFloat((Number(b) || 0) + tAmount));

            // إرجاع فارق السعر للمشتري (Refund)
            const refundValue = fixFloat((price - tPrice) * tAmount);
            if (refundValue > 0) {
                await db.ref(`users/${uid}/sdmBalance`).transaction(b => fixFloat((Number(b) || 0) + refundValue));
            }

            updateMarketPrice(tPrice);

            // سجل الصفقات
            db.ref('market/transactions').push({
                price: tPrice, amount: tAmount, buyer: uid, seller: mOrder.uP,
                timestamp: admin.database.ServerValue.TIMESTAMP
            });

            // تحديث الطلبات (خصم الكمية المنفذة)
            if (amount > tAmount) await snap.ref.update({ amount: fixFloat(amount - tAmount) });
            else snap.ref.remove();

            if (mOrder.amount > tAmount) await db.ref(`market/orders/sell/${mKey}`).update({ amount: fixFloat(mOrder.amount - tAmount) });
            else await db.ref(`market/orders/sell/${mKey}`).remove();
        }
    } catch (e) { console.error("Buy Error:", e); }
});

// ============================================================
// 4. محرك أوامر البيع (Sell Orders)
// ============================================================
db.ref('market/orders/sell').on('child_added', async (snap) => {
    const order = snap.val();
    if (!order || order.status !== 'pending') return;

    const uid = order.uP;
    if (isSpam(uid)) return snap.ref.remove();

    const price = Number(order.price);
    const amount = Number(order.amount);

    if (!isValid(price) || !isValid(amount)) return snap.ref.remove();

    try {
        // حجز رصيد العملة من البائع (MRK)
        const result = await db.ref(`users/${uid}/mrkBalance`).transaction(bal => {
            const current = Number(bal || 0);
            if (current < amount) return; 
            return fixFloat(current - amount);
        });

        if (!result.committed) {
            console.log(`❌ فشل بيع: رصيد ${order.uN} من العملة غير كافٍ`);
            db.ref(`alerts/${uid}`).push({ msg: "❌ رصيد MRK لا يكفي لفتح طلب البيع", type: "error" });
            return snap.ref.update({ status: 'failed_insufficient_funds' });
        }

        // البحث عن مشتري (أعلى سعر)
        const matchSnap = await db.ref('market/orders/buy')
            .orderByChild('price')
            .startAt(price)
            .limitToLast(1)
            .once('value');

        if (matchSnap.exists()) {
            const mKey = Object.keys(matchSnap.val())[0];
            const mOrder = matchSnap.val()[mKey];

            if (mOrder.uP === uid) return;

            const tAmount = Math.min(amount, mOrder.amount);
            const tPrice = mOrder.price;
            const tValue = fixFloat(tAmount * tPrice);

            console.log(`🤝 صفقة بيع: ${tAmount} MRK بسعر ${tPrice}`);

            await db.ref(`users/${uid}/sdmBalance`).transaction(b => fixFloat((Number(b) || 0) + tValue));
            await db.ref(`users/${mOrder.uP}/mrkBalance`).transaction(b => fixFloat((Number(b) || 0) + tAmount));

            updateMarketPrice(tPrice);

            db.ref('market/transactions').push({
                price: tPrice, amount: tAmount, buyer: mOrder.uP, seller: uid,
                timestamp: admin.database.ServerValue.TIMESTAMP
            });

            if (amount > tAmount) await snap.ref.update({ amount: fixFloat(amount - tAmount) });
            else snap.ref.remove();

            if (mOrder.amount > tAmount) await db.ref(`market/orders/buy/${mKey}`).update({ amount: fixFloat(mOrder.amount - tAmount) });
            else await db.ref(`market/orders/buy/${mKey}`).remove();
        }
    } catch (e) { console.error("Sell Error:", e); }
});

// ============================================================
// 5. نظام إرجاع الرصيد عند الإلغاء (Refund)
// ============================================================
const refundOrder = (snap, type) => {
    const o = snap.val();
    if (o.status === 'cancelled') {
        const uid = o.uP;
        const amount = Number(o.amount);
        const price = Number(o.price);

        if (type === 'buy') {
            const refundValue = fixFloat(amount * price);
            db.ref(`users/${uid}/sdmBalance`).transaction(b => fixFloat((Number(b) || 0) + refundValue));
        } else {
            db.ref(`users/${uid}/mrkBalance`).transaction(b => fixFloat((Number(b) || 0) + amount));
        }
        
        db.ref(`alerts/${uid}`).push({ msg: "🔄 تم إلغاء الطلب وإعادة الرصيد لمحفظتك", type: "info" });
        snap.ref.remove(); // حذف الطلب نهائياً بعد الإرجاع
    }
};

db.ref('market/orders/buy').on('child_changed', snap => refundOrder(snap, 'buy'));
db.ref('market/orders/sell').on('child_changed', snap => refundOrder(snap, 'sell'));

// ============================================================
// 6. التحويلات وخدمات النظام (Transfers & Games)
// ============================================================

// معالجة التحويلات المالية بين المستخدمين
db.ref('requests/transfers').on('child_added', async (snap) => {
    const req = snap.val();
    if (!req || req.status !== 'pending' || !isValid(req.amount)) return;

    const result = await db.ref(`users/${req.from}/sdmBalance`).transaction(bal => {
        if ((Number(bal) || 0) < req.amount) return;
        return fixFloat(Number(bal) - req.amount);
    });

    if (result.committed) {
        await db.ref(`users/${req.to}/sdmBalance`).transaction(b => fixFloat((Number(b) || 0) + req.amount));
        snap.ref.update({ status: 'completed', time: Date.now() });
        db.ref(`alerts/${req.to}`).push({ msg: `💰 استلمت ${req.amount} SDM من مستخدم آخر`, type: "success" });
        db.ref(`alerts/${req.from}`).push({ msg: `✅ تم التحويل بنجاح`, type: "success" });
    } else {
        snap.ref.update({ status: 'failed_no_funds' });
    }
});

// معالجة طلبات الألعاب (خصم آلي)
db.ref('game_orders').on('child_added', async (snap) => {
    const o = snap.val();
    if (!o || o.status !== 'pending' || !isValid(o.cost)) return;

    const result = await db.ref(`users/${o.uP}/sdmBalance`).transaction(bal => {
        if ((Number(bal) || 0) < o.cost) return;
        return fixFloat(Number(bal) - o.cost);
    });

    if (result.committed) {
        snap.ref.update({ status: 'paid_waiting_execution' });
    } else {
        snap.ref.update({ status: 'rejected_no_funds' });
        db.ref(`alerts/${o.uP}`).push({ msg: "❌ رصيدك لا يكفي لشحن اللعبة", type: "error" });
    }
});

// ============================================================
// 7. مراقب حالة السيرفر
// ============================================================
setInterval(() => {
    db.ref('system/status').update({ last_online: admin.database.ServerValue.TIMESTAMP });
}, 60000);

app.get('/', (req, res) => res.send('🛡️ SDM Secure Engine is Running...'));
app.listen(PORT, () => console.log(`🚀 Financial Engine Active on Port ${PORT}`));
