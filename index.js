const admin = require('firebase-admin');
const express = require('express');
const app = express();

// --- 1. إعداد الاتصال بـ Firebase عن طريق متغيرات البيئة ---
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
    });
    console.log("✅ تم الاتصال بقاعدة البيانات بنجاح");
} catch (error) {
    console.error("❌ خطأ في قراءة FIREBASE_SERVICE_ACCOUNT:", error.message);
    process.exit(1); // إيقاف التشغيل إذا فشل الاتصال
}

const db = admin.database();

// --- 2. وظيفة إرسال التنبيهات للمستخدمين ---
function sendAlert(uid, msg, type = 'success') {
    db.ref(`alerts/${uid}`).push({
        msg: msg,
        type: type,
        date: Date.now()
    });
}

// --- 3. محرك معالجة التحويلات (Transfers) ---
async function processTransfers() {
    const ref = db.ref('requests/transfers');
    const snap = await ref.orderByChild('status').equalTo('pending').limitToFirst(5).once('value');
    
    if (!snap.exists()) return;

    for (const [id, task] of Object.entries(snap.val())) {
        const { from, toId, amount, fromName } = task;
        const numAmount = Number(amount);

        try {
            // البحث عن المستلم
            const userSnap = await db.ref('users').orderByChild('numericId').equalTo(String(toId)).once('value');
            
            if (!userSnap.exists()) {
                await ref.child(id).update({ status: 'failed', reason: 'المستلم غير موجود' });
                sendAlert(from, `❌ رقم الحساب ${toId} غير موجود`, 'error');
                continue;
            }

            const receiverUid = Object.keys(userSnap.val())[0];

            // تنفيذ العملية (خصم وإضافة)
            const senderRef = db.ref(`users/${from}/sdmBalance`);
            const tx = await senderRef.transaction(currentBal => {
                const bal = Number(currentBal || 0);
                if (bal >= numAmount) return bal - numAmount;
                return undefined; // إلغاء إذا الرصيد غير كافٍ
            });

            if (tx.committed) {
                await db.ref(`users/${receiverUid}/sdmBalance`).transaction(c => Number(c || 0) + numAmount);
                await ref.child(id).update({ status: 'completed', date: Date.now() });
                
                sendAlert(receiverUid, `💰 استلمت ${numAmount} SDM من ${fromName}`, 'success');
                sendAlert(from, `✅ تم تحويل ${numAmount} SDM للمستلم ${toId}`, 'success');
                console.log(`✅ تحويل ناجح من ${from} إلى ${toId}`);
            } else {
                await ref.child(id).update({ status: 'failed', reason: 'رصيد غير كافي' });
                sendAlert(from, `❌ رصيدك الحالي لا يكفي لإتمام العملية`, 'error');
            }
        } catch (e) { console.error(e); }
    }
}

// --- 4. محرك الشراء الآمن (Escrow) ---
async function processEscrow() {
    const ref = db.ref('requests/escrow_deals');
    
    // 1. حجز المبلغ (Pending)
    const pendingSnap = await ref.orderByChild('status').equalTo('pending').once('value');
    if (pendingSnap.exists()) {
        for (const [id, deal] of Object.entries(pendingSnap.val())) {
            const numPrice = Number(deal.amount);
            const tx = await db.ref(`users/${deal.buyerId}/sdmBalance`).transaction(curr => {
                const bal = Number(curr || 0);
                return (bal >= numPrice) ? bal - numPrice : undefined;
            });

            if (tx.committed) {
                await ref.child(id).update({ status: 'pending_delivery' });
                sendAlert(deal.buyerId, `🔒 تم حجز ${numPrice} SDM للشراء الآمن`, 'info');
                sendAlert(deal.sellerId, `🔔 طلب شراء جديد لمنتجك: ${deal.itemTitle}`, 'success');
            } else {
                await ref.child(id).remove();
                sendAlert(deal.buyerId, `❌ فشل الحجز: رصيدك غير كافٍ`, 'error');
            }
        }
    }

    // 2. تحرير المبلغ (Confirmed by Buyer)
    const confirmedSnap = await ref.orderByChild('status').equalTo('confirmed_by_buyer').once('value');
    if (confirmedSnap.exists()) {
        for (const [id, deal] of Object.entries(confirmedSnap.val())) {
            const numPrice = Number(deal.amount);
            await db.ref(`users/${deal.sellerId}/sdmBalance`).transaction(c => Number(c || 0) + numPrice);
            await ref.child(id).update({ status: 'completed' });
            sendAlert(deal.sellerId, `💰 تم تحويل ${numPrice} SDM لحسابك (ثمن ${deal.itemTitle})`, 'success');
            sendAlert(deal.buyerId, `✅ تم تسليم المبلغ للبائع بنجاح`, 'success');
        }
    }
}

// --- 5. محرك تفعيل VIP ---
async function processVips() {
    const ref = db.ref('requests/vip_subscriptions');
    const snap = await ref.orderByChild('status').equalTo('pending').once('value');
    if (!snap.exists()) return;

    for (const [id, task] of Object.entries(snap.val())) {
        const { userId, days, cost } = task;
        const numCost = Number(cost);

        const tx = await db.ref(`users/${userId}`).transaction(u => {
            if (u && Number(u.sdmBalance || 0) >= numCost) {
                const now = Date.now();
                const currentExpiry = (u.vipExpiry && u.vipExpiry > now) ? u.vipExpiry : now;
                u.sdmBalance = Number(u.sdmBalance) - numCost;
                u.vipStatus = 'active';
                u.vipExpiry = currentExpiry + (Number(days) * 24 * 60 * 60 * 1000);
                return u;
            }
        });

        if (tx.committed) {
            await ref.child(id).update({ status: 'completed' });
            sendAlert(userId, `👑 تم تفعيل اشتراك VIP لمدة ${days} يوم`, 'success');
        } else {
            await ref.child(id).update({ status: 'failed' });
            sendAlert(userId, `❌ فشل تفعيل VIP: رصيد غير كافٍ`, 'error');
        }
    }
}

// --- 6. تشغيل المهام بشكل دوري ---
setInterval(() => {
    processTransfers();
    processEscrow();
    processVips();
}, 5000); // كل 5 ثواني

// --- 7. إعداد سيرفر الويب (مطلب أساسي لـ Render) ---
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('SDM Market Bot is Running... 🚀'));
app.listen(PORT, () => console.log(`🌍 Server is listening on port ${PORT}`));
