const express = require('express');
const admin = require("firebase-admin");
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// 1. نظام الحماية من السبام (Anti-Spam System) - 🛡️
// ============================================================
const userCooldowns = {};
function isSpam(uid) {
    if (!uid) return false;
    const now = Date.now();
    const lastAction = userCooldowns[uid] || 0;
    if (now - lastAction < 2000) return true; // تقليل المهلة لـ 2 ثانية لتجربة أفضل
    userCooldowns[uid] = now;
    return false;
}

// ============================================================
// 2. الاتصال الآمن (Secure Connection)
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
// 3. السيرفر ونبض القلب (Heartbeat)
// ============================================================
app.get('/', (req, res) => { res.send('🛡️ SDM CORE ENGINE IS ACTIVE.'); });
app.listen(PORT, () => { console.log(`🚀 Port: ${PORT}`); });

setInterval(() => {
    db.ref('system/status').update({ last_online: admin.database.ServerValue.TIMESTAMP });
}, 60000);

// ============================================================
// 4. المحرك المالي المطور (Financial Engine)
// ============================================================

console.log("💰 Financial Engine Active...");

// --------------------------------------------------------
// أ) معالجة التحويلات (Transfers) - آلي بالكامل
// --------------------------------------------------------
db.ref('requests/transfers').on('child_added', async (snap) => {
    const req = snap.val();
    const reqId = snap.key;
    if (isSpam(req.from)) return snap.ref.remove();

    await db.ref(`users/${req.from}/sdmBalance`).transaction(bal => {
        if ((bal || 0) < req.amount) return;
        return (bal || 0) - req.amount;
    }, async (err, committed) => {
        if (committed) {
            await db.ref(`users/${req.to}/sdmBalance`).transaction(b => (b || 0) + req.amount);
            db.ref(`alerts/${req.to}`).push({ msg: `💰 استلمت ${req.amount} SDM`, type: "success" });
            db.ref(`alerts/${req.from}`).push({ msg: `✅ تم التحويل بنجاح`, type: "success" });
            snap.ref.remove();
        } else {
            db.ref(`alerts/${req.from}`).push({ msg: "❌ رصيد غير كافٍ", type: "error" });
            snap.ref.remove();
        }
    });
});

// --------------------------------------------------------
// ب) استرجاع الرصيد عند الإلغاء (Refund Logic) - 🔥 ميزة جديدة
// --------------------------------------------------------

// استرجاع رصيد الشراء (SDM)
db.ref('market/orders/buy').on('child_changed', async (snap) => {
    const order = snap.val();
    if (order.status === 'cancelled') {
        const refund = order.price * order.amount;
        await db.ref(`users/${order.uP}/sdmBalance`).transaction(b => (b || 0) + refund);
        db.ref(`alerts/${order.uP}`).push({ msg: `🔄 تم إرجاع ${refund.toFixed(2)} SDM لمحفظتك`, type: "info" });
        snap.ref.remove(); // حذف الطلب نهائياً بعد الإرجاع
    }
});

// استرجاع رصيد البيع (MRK)
db.ref('market/orders/sell').on('child_changed', async (snap) => {
    const order = snap.val();
    if (order.status === 'cancelled') {
        await db.ref(`users/${order.uP}/mrkBalance`).transaction(b => (b || 0) + order.amount);
        db.ref(`alerts/${order.uP}`).push({ msg: `🔄 تم إرجاع ${order.amount} MRK لمحفظتك`, type: "info" });
        snap.ref.remove();
    }
});

// --------------------------------------------------------
// ج) محرك التداول (Matching Engine) - شراء وبيع
// --------------------------------------------------------

// دالة توحيد السعر في كل مكان
function updateGlobalPrice(price) {
    db.ref('market/current_price').set(price);
    db.ref('market/stats/lastPrice').set(price);
}

// أوامر الشراء
db.ref('market/orders/buy').on('child_added', async (snap) => {
    const order = snap.val();
    if(order.status !== 'pending') return;

    const totalCost = order.price * order.amount;
    let locked = false;

    await db.ref(`users/${order.uP}/sdmBalance`).transaction(bal => {
        if ((bal || 0) < totalCost) return;
        return (bal || 0) - totalCost;
    }, (err, comm) => { if (comm) locked = true; });

    if (!locked) return snap.ref.remove();

    const match = await db.ref('market/orders/sell').orderByChild('price').endAt(order.price).limitToFirst(1).once('value');
    if (match.exists()) {
        const sKey = Object.keys(match.val())[0];
        const sOrder = match.val()[sKey];
        const amt = Math.min(order.amount, sOrder.amount);
        const p = sOrder.price;

        await db.ref(`users/${sOrder.uP}/sdmBalance`).transaction(b => (b || 0) + (amt * p));
        await db.ref(`users/${order.uP}/mrkBalance`).transaction(m => (m || 0) + amt);
        
        // إرجاع الفارق للمشتري
        const refund = (order.price - p) * amt;
        if (refund > 0) await db.ref(`users/${order.uP}/sdmBalance`).transaction(b => (b || 0) + refund);

        updateGlobalPrice(p);
        
        // تحديث الكميات أو الحذف
        if (order.amount > amt) snap.ref.update({ amount: order.amount - amt, status: 'pending' }); else snap.ref.remove();
        if (sOrder.amount > amt) db.ref(`market/orders/sell/${sKey}`).update({ amount: sOrder.amount - amt }); else db.ref(`market/orders/sell/${sKey}`).remove();
    }
});

// أوامر البيع
db.ref('market/orders/sell').on('child_added', async (snap) => {
    const order = snap.val();
    if(order.status !== 'pending') return;

    let locked = false;
    await db.ref(`users/${order.uP}/mrkBalance`).transaction(bal => {
        if ((bal || 0) < order.amount) return;
        return (bal || 0) - order.amount;
    }, (err, comm) => { if (comm) locked = true; });

    if (!locked) return snap.ref.remove();

    const match = await db.ref('market/orders/buy').orderByChild('price').startAt(order.price).limitToLast(1).once('value');
    if (match.exists()) {
        const bKey = Object.keys(match.val())[0];
        const bOrder = match.val()[bKey];
        const amt = Math.min(order.amount, bOrder.amount);
        const p = order.price;

        await db.ref(`users/${order.uP}/sdmBalance`).transaction(b => (b || 0) + (amt * p));
        await db.ref(`users/${bOrder.uP}/mrkBalance`).transaction(m => (m || 0) + amt);

        updateGlobalPrice(p);

        if (order.amount > amt) snap.ref.update({ amount: order.amount - amt, status: 'pending' }); else snap.ref.remove();
        if (bOrder.amount > amt) db.ref(`market/orders/buy/${bKey}`).update({ amount: bOrder.amount - amt }); else db.ref(`market/orders/buy/${bKey}`).remove();
    }
});

// --------------------------------------------------------
// د) طلبات الألعاب والتقييمات والحماية
// --------------------------------------------------------

db.ref('game_orders').on('child_added', async (snap) => {
    const o = snap.val();
    if (o.status !== 'pending') return;
    await db.ref(`users/${o.uP}/sdmBalance`).transaction(bal => {
        if ((bal || 0) < o.cost) return;
        return (bal || 0) - o.cost;
    }, (err, comm) => {
        if (comm) snap.ref.update({ status: 'paid_waiting_execution' });
        else snap.ref.update({ status: 'rejected_no_funds' });
    });
});

db.ref('rating_queue').on('child_added', async (snap) => {
    const d = snap.val();
    await db.ref(`users/${d.target}`).transaction(u => {
        if (!u) return u;
        const c = u.ratingCount || 1;
        u.rating = parseFloat((((u.rating || 5) * c + d.stars) / (c + 1)).toFixed(1));
        u.ratingCount = c + 1;
        return u;
    });
    snap.ref.remove();
});

// حماية المنشورات والطلبات المكررة
const paths = ['posts', 'vip_posts', 'coin_requests'];
paths.forEach(p => {
    db.ref(p).on('child_added', (snap) => {
        const data = snap.val();
        if (isSpam(data.uP)) snap.ref.remove();
    });
});
