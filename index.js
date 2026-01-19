const admin = require('firebase-admin');
const http = require('http');

// 1. إعداد الاتصال
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
    });
    console.log("🚀 بوت SDM Market يعمل بأعلى معايير الأمان...");
} catch (e) {
    console.error("❌ فشل في إعداد Firebase:", e.message);
    process.exit(1);
}

const db = admin.database();
let isProcessing = false;

/**
 * محرك تحويل الأموال بين الحسابات
 */
async function processTransfers() {
    const ref = db.ref('requests/transfers');
    const snap = await ref.orderByChild('status').equalTo('pending').limitToFirst(10).once('value');
    if (!snap.exists()) return;

    const tasks = snap.val();
    for (const id in tasks) {
        const { from, toId, amount, fromName } = tasks[id];
        const numAmount = Number(amount);
        const cleanToId = String(toId).trim();

        try {
            // البحث عن المستلم
            const userSnap = await db.ref('users').orderByChild('numericId').equalTo(cleanToId).once('value');
            if (!userSnap.exists()) {
                await ref.child(id).update({ status: 'failed', reason: 'المستلم غير موجود' });
                continue;
            }

            const receiverUid = Object.keys(userSnap.val())[0];
            if (from === receiverUid) {
                await ref.child(id).update({ status: 'failed', reason: 'تحويل لنفس الحساب' });
                continue;
            }

            // الخصم من المرسل (عملية ذرية لمنع الثغرات)
            const senderBalRef = db.ref(`users/${from}/sdmBalance`);
            const tx = await senderBalRef.transaction(current => {
                if ((current || 0) >= numAmount) return current - numAmount;
                return; // إلغاء إذا لم يكفِ الرصيد
            });

            if (tx.committed) {
                // إضافة للمستلم
                await db.ref(`users/${receiverUid}/sdmBalance`).transaction(c => (c || 0) + numAmount);
                
                // توثيق العملية
                await ref.child(id).update({ status: 'completed', completedAt: Date.now() });
                await db.ref(`transactions/transfer_${id}`).set({
                    from, to: receiverUid, amount: numAmount, date: Date.now(), type: 'p2p'
                });

                // تنبيهات
                sendAlert(receiverUid, `💰 استلمت ${numAmount} SDM من ${fromName}`, 'success');
                sendAlert(from, `✅ تم تحويل ${numAmount} SDM بنجاح للرقم ${cleanToId}`, 'success');
            } else {
                await ref.child(id).update({ status: 'failed', reason: 'رصيد غير كافٍ' });
            }
        } catch (err) { console.error("Transfer Error:", err.message); }
    }
}

/**
 * محرك نظام الوسيط (Escrow)
 */
async function processEscrow() {
    const ref = db.ref('requests/escrow_deals');
    // معالجة الصفقات التي أكد المشتري استلامها
    const snap = await ref.orderByChild('status').equalTo('confirmed_by_buyer').once('value');
    if (!snap.exists()) return;

    const deals = snap.val();
    for (const id in deals) {
        const { sellerId, amount, itemTitle, buyerId } = deals[id];
        try {
            const numAmount = Number(amount);
            // تحويل المال المحجوز للبائع
            await db.ref(`users/${sellerId}/sdmBalance`).transaction(c => (c || 0) + numAmount);
            
            await ref.child(id).update({ status: 'completed', completedAt: Date.now() });
            
            sendAlert(sellerId, `✅ تم تحرير مبلغ ${numAmount} SDM لعملية: ${itemTitle}`, 'success');
            sendAlert(buyerId, `📦 تم إكمال صفقة: ${itemTitle} بنجاح`, 'info');
            
            console.log(`[ESCROW] Done: ${id}`);
        } catch (e) { console.error("Escrow Engine Error:", e.message); }
    }
}

/**
 * محرك الـ VIP
 */
async function processVips() {
    const ref = db.ref('requests/vip_subscriptions');
    const snap = await ref.orderByChild('status').equalTo('pending').once('value');
    if (!snap.exists()) return;

    const tasks = snap.val();
    for (const id in tasks) {
        const { userId, days, cost } = tasks[id];
        try {
            const numCost = Number(cost);
            const userRef = db.ref(`users/${userId}`);
            
            const tx = await userRef.transaction(user => {
                if (user && (user.sdmBalance || 0) >= numCost) {
                    const now = Date.now();
                    const currentExpiry = (user.vipExpiry && user.vipExpiry > now) ? user.vipExpiry : now;
                    user.sdmBalance -= numCost;
                    user.vipStatus = 'active';
                    user.vipExpiry = currentExpiry + (days * 24 * 60 * 60 * 1000);
                    return user;
                }
                return;
            });

            if (tx.committed) {
                await ref.child(id).update({ status: 'completed' });
                sendAlert(userId, `✨ تم تفعيل اشتراك VIP لمدة ${days} يوم.`, 'success');
            } else {
                await ref.child(id).update({ status: 'failed', reason: 'رصيد غير كافٍ' });
            }
        } catch (e) { console.error("VIP Engine Error:", e.message); }
    }
}

// دالة مساعدة لإرسال التنبيهات
function sendAlert(uid, msg, type) {
    db.ref(`alerts/${uid}`).push({ msg, type, date: Date.now() });
}

// الحلقة الرئيسية للمحركات
setInterval(async () => {
    if (isProcessing) return;
    isProcessing = true;
    try {
        await processTransfers();
        await processVips();
        await processEscrow();
    } catch (e) { console.error("Loop Error:", e.message); }
    isProcessing = false;
}, 3000); // يعمل كل 3 ثواني لضمان سرعة الاستجابة

// الحفاظ على البوت حياً في Render
http.createServer((req, res) => res.end('SDM Safe Engine is Live')).listen(process.env.PORT || 3000);
