const admin = require('firebase-admin');
const express = require('express');
const app = express();

// --- 1. إعداد الاتصال بـ Firebase ---
// ملاحظة: يفضل استخدام متغيرات البيئة في الاستضافة الحقيقية
const serviceAccount = require("./serviceAccountKey.json"); 

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com" // تأكد من الرابط الخاص بك
});

const db = admin.database();
console.log("🚀 بوت SDM المطور يعمل الآن...");

// --- 2. وظائف مساعدة ---
function sendAlert(uid, msg, type = 'info') {
    db.ref(`alerts/${uid}`).push({
        msg: msg,
        type: type,
        date: Date.now()
    });
}

// --- 3. محرك معالجة التحويلات (Transfer System) ---
async function processTransfers() {
    const ref = db.ref('requests/transfers');
    const snap = await ref.orderByChild('status').equalTo('pending').limitToFirst(10).once('value');
    
    if (!snap.exists()) return;

    for (const [id, task] of Object.entries(snap.val())) {
        const { from, toId, amount, fromName } = task;
        const numAmount = Number(amount);

        try {
            // البحث عن المستلم عبر الرقم المكون من 6 أرقام
            const userSnap = await db.ref('users').orderByChild('numericId').equalTo(String(toId)).once('value');
            
            if (!userSnap.exists()) {
                await ref.child(id).update({ status: 'failed', reason: 'المستلم غير موجود' });
                sendAlert(from, `❌ فشل التحويل: الرقم ${toId} غير مسجل`, 'error');
                continue;
            }

            const receiverUid = Object.keys(userSnap.val())[0];
            if (receiverUid === from) {
                await ref.child(id).update({ status: 'failed', reason: 'لا يمكن التحويل لنفسك' });
                sendAlert(from, `❌ لا يمكنك التحويل لنفسك`, 'error');
                continue;
            }

            // تنفيذ العملية المالية (خصم من المرسل)
            const senderRef = db.ref(`users/${from}/sdmBalance`);
            const tx = await senderRef.transaction(currentBalance => {
                const bal = Number(currentBalance || 0);
                if (bal >= numAmount) {
                    return bal - numAmount;
                }
                return undefined; // سيلغي العملية إذا لم يتوفر الرصيد
            });

            if (tx.committed) {
                // إضافة الرصيد للمستلم
                await db.ref(`users/${receiverUid}/sdmBalance`).transaction(c => Number(c || 0) + numAmount);
                
                // تحديث حالة الطلب وسجل المعاملات
                await ref.child(id).update({ status: 'completed', completedAt: Date.now() });
                
                await db.ref('transactions').push({
                    type: 'transfer',
                    from: from,
                    to: receiverUid,
                    amount: numAmount,
                    date: Date.now()
                });

                sendAlert(receiverUid, `💰 وصلك تحويل بقيمة ${numAmount} SDM من ${fromName}`, 'success');
                sendAlert(from, `✅ تم تحويل ${numAmount} SDM بنجاح إلى ${toId}`, 'success');
                console.log(`✅ تحويل ناجح من ${from} إلى ${toId}`);
            } else {
                await ref.child(id).update({ status: 'failed', reason: 'رصيد غير كافي' });
                sendAlert(from, `❌ رصيدك غير كافي لإتمام عملية التحويل`, 'error');
            }
        } catch (e) {
            console.error("خطأ في معالجة التحويل:", e);
        }
    }
}

// --- 4. محرك الشراء الآمن (Escrow System) ---
async function processEscrow() {
    const ref = db.ref('requests/escrow_deals');
    // معالجة الصفقات الجديدة فقط (حجز المبلغ)
    const pendingSnap = await ref.orderByChild('status').equalTo('pending').once('value');

    if (pendingSnap.exists()) {
        for (const [id, deal] of Object.entries(pendingSnap.val())) {
            const numPrice = Number(deal.amount);
            const buyerRef = db.ref(`users/${deal.buyerId}/sdmBalance`);

            const tx = await buyerRef.transaction(curr => {
                const bal = Number(curr || 0);
                return (bal >= numPrice) ? bal - numPrice : undefined;
            });

            if (tx.committed) {
                await ref.child(id).update({ status: 'pending_delivery' });
                sendAlert(deal.buyerId, `🔐 تم حجز ${numPrice} SDM كبائع وسيط لطلب: ${deal.itemTitle}`, 'info');
                sendAlert(deal.sellerId, `🔔 هناك طلب شراء جديد لمنتجك (${deal.itemTitle}). يرجى التواصل مع المشتري للتسليم.`, 'success');
            } else {
                await ref.child(id).remove(); // حذف الطلب لعدم توفر رصيد
                sendAlert(deal.buyerId, `❌ فشل الشراء الآمن: رصيدك غير كافي`, 'error');
            }
        }
    }

    // معالجة الصفقات المؤكدة (تحرير المبلغ للبائع)
    const confirmedSnap = await ref.orderByChild('status').equalTo('confirmed_by_buyer').once('value');
    if (confirmedSnap.exists()) {
        for (const [id, deal] of Object.entries(confirmedSnap.val())) {
            const numPrice = Number(deal.amount);
            await db.ref(`users/${deal.sellerId}/sdmBalance`).transaction(c => Number(c || 0) + numPrice);
            await ref.child(id).update({ status: 'completed', finishedAt: Date.now() });
            
            sendAlert(deal.sellerId, `💰 تم تحرير مبلغ ${numPrice} SDM لحسابك بعد استلام المشتري للسلعة`, 'success');
            sendAlert(deal.buyerId, `✅ تمت العملية بنجاح. تم تسليم المبلغ للبائع.`, 'success');
        }
    }
}

// --- 5. محرك الـ VIP (VIP Subscriptions) ---
async function processVips() {
    const ref = db.ref('requests/vip_subscriptions');
    const snap = await ref.orderByChild('status').equalTo('pending').once('value');
    if (!snap.exists()) return;

    for (const [id, task] of Object.entries(snap.val())) {
        const { userId, days, cost } = task;
        const numCost = Number(cost);

        const tx = await db.ref(`users/${userId}`).transaction(user => {
            if (user && Number(user.sdmBalance || 0) >= numCost) {
                const now = Date.now();
                const currentExpiry = (user.vipExpiry && user.vipExpiry > now) ? user.vipExpiry : now;
                
                user.sdmBalance = Number(user.sdmBalance) - numCost;
                user.vipStatus = 'active';
                user.vipExpiry = currentExpiry + (Number(days) * 24 * 60 * 60 * 1000);
                user.role = user.role || 'user'; // الحفاظ على الرتبة
                return user;
            }
            return undefined;
        });

        if (tx.committed) {
            await ref.child(id).update({ status: 'completed' });
            sendAlert(userId, `👑 مبروك! تم تفعيل اشتراك VIP لمدة ${days} يوم بنجاح.`, 'success');
        } else {
            await ref.child(id).update({ status: 'failed', reason: 'رصيد غير كافي' });
            sendAlert(userId, `❌ فشل تفعيل VIP: رصيدك غير كافي`, 'error');
        }
    }
}

// --- 6. تنظيف البيانات القديمة (Auto Cleanup) ---
async function cleanup() {
    console.log("🧹 جاري تنظيف المنشورات القديمة...");
    const cutoff = Date.now() - (48 * 60 * 60 * 1000); // 48 ساعة
    
    const paths = ['posts', 'vip_posts'];
    for (const path of paths) {
        const snap = await db.ref(path).orderByChild('date').endAt(cutoff).once('value');
        if (snap.exists()) {
            await db.ref(path).update(Object.keys(snap.val()).reduce((acc, key) => {
                acc[key] = null;
                return acc;
            }, {}));
        }
    }
}

// --- 7. الحلقة الرئيسية ---
setInterval(async () => {
    try {
        await processTransfers();
        await processEscrow();
        await processVips();
    } catch (e) {
        console.error("خطأ في الحلقة الرئيسية:", e);
    }
}, 5000); // يعمل كل 5 ثواني

setInterval(cleanup, 3600000); // تنظيف كل ساعة

// --- 8. تشغيل سيرفر بسيط لإبقاء البوت حياً ---
app.get('/', (req, res) => res.send('SDM Secure Bot is Online! 🚀'));
app.listen(process.env.PORT || 3000);
