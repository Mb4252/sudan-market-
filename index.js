const admin = require('firebase-admin');
const http = require('http');

// --- 1. إعداد الاتصال ---
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
    });
    console.log("✅ البوت الشامل يعمل الآن (إصلاح شامل للتحويل)");
} catch (e) {
    console.error("❌ خطأ اتصال:", e.message);
    process.exit(1);
}

const db = admin.database();
let isProcessing = false;

// --- 2. محرك التحويلات المالية (تم الإصلاح) ---
async function processTransfers() {
    const ref = db.ref('requests/transfers');
    // جلب 5 طلبات معلقة فقط في كل دورة لتجنب الضغط
    const snap = await ref.orderByChild('status').equalTo('pending').limitToFirst(5).once('value');
    
    if (!snap.exists()) return;

    for (const [id, task] of Object.entries(snap.val())) {
        const { from, toId, amount, fromName } = task;
        const numAmount = Math.abs(Number(amount)); // التأكد أنه رقم موجب

        if (isNaN(numAmount) || numAmount <= 0) {
            await ref.child(id).update({ status: 'failed', reason: 'مبلغ غير صالح' });
            continue;
        }

        try {
            // البحث عن المستلم عبر رقم التعريف الـ 6 أرقام
            const userSnap = await db.ref('users').orderByChild('numericId').equalTo(String(toId)).once('value');
            
            if (!userSnap.exists()) {
                await ref.child(id).update({ status: 'failed', reason: 'المستلم غير موجود' });
                sendAlert(from, `❌ فشل: رقم المستلم ${toId} غير صحيح`, 'error');
                continue;
            }

            const receiverUid = Object.keys(userSnap.val())[0];
            
            if (from === receiverUid) {
                await ref.child(id).update({ status: 'failed', reason: 'لا يمكن التحويل لنفسك' });
                continue;
            }

            // --- عملية الخصم من المرسل (Transaction) ---
            const senderBalanceRef = db.ref(`users/${from}/sdmBalance`);
            const txResult = await senderBalanceRef.transaction(currentBalance => {
                const bal = Number(currentBalance) || 0;
                if (bal >= numAmount) {
                    return bal - numAmount; // الخصم
                }
                return; // إلغاء إذا لم يكفِ الرصيد
            });

            if (txResult.committed) {
                // --- إضافة الرصيد للمستلم ---
                await db.ref(`users/${receiverUid}/sdmBalance`).transaction(c => (Number(c) || 0) + numAmount);
                
                // تحديث حالة الطلب وتسجيل العملية
                await ref.child(id).update({ 
                    status: 'completed', 
                    receiverUid: receiverUid,
                    completedAt: Date.now() 
                });

                // تسجيل في سجل المعاملات العام
                db.ref('transactions').push({
                    from, to: receiverUid, amount: numAmount, type: 'transfer', date: Date.now()
                });

                // إرسال التنبيهات
                sendAlert(receiverUid, `💰 استلمت ${numAmount} SDM من ${fromName}`, 'success');
                sendAlert(from, `✅ تم تحويل ${numAmount} SDM بنجاح إلى ${toId}`, 'success');
                
                console.log(`[TRANSFER] From ${from} to ${toId}: ${numAmount} SDM`);
            } else {
                // إذا فشلت الـ Transaction (يعني الرصيد فعلياً أقل)
                await ref.child(id).update({ status: 'failed', reason: 'رصيدك الحالي لا يكفي' });
                sendAlert(from, `❌ رصيدك لا يكفي لإتمام عملية التحويل (${numAmount} SDM)`, 'error');
            }

        } catch (e) {
            console.error("خطأ في معالجة التحويل:", e);
        }
    }
}

// --- 3. محرك الـ VIP (تم الإصلاح) ---
async function processVips() {
    const ref = db.ref('requests/vip_subscriptions');
    const snap = await ref.orderByChild('status').equalTo('pending').once('value');
    if (!snap.exists()) return;

    for (const [id, task] of Object.entries(snap.val())) {
        const { userId, days, cost } = task;
        const numCost = Number(cost);

        const tx = await db.ref(`users/${userId}`).transaction(user => {
            if (user && (Number(user.sdmBalance) || 0) >= numCost) {
                const start = (user.vipExpiry && user.vipExpiry > Date.now()) ? user.vipExpiry : Date.now();
                user.sdmBalance = (Number(user.sdmBalance) || 0) - numCost;
                user.vipStatus = 'active';
                user.vipExpiry = start + (days * 24 * 60 * 60 * 1000);
                return user;
            }
        });

        if (tx.committed) {
            await ref.child(id).update({ status: 'completed' });
            sendAlert(userId, `👑 تم تفعيل اشتراك VIP لمدة ${days} يوم بنجاح!`, 'success');
        } else {
            await ref.child(id).update({ status: 'failed', reason: 'رصيد غير كافٍ' });
            sendAlert(userId, `❌ فشل تفعيل VIP: رصيدك غير كافٍ`, 'error');
        }
    }
}

// --- 4. تنظيف المنشورات القديمة (تلقائي) ---
async function cleanupOldPosts() {
    const cutoff = Date.now() - (48 * 60 * 60 * 1000); // 48 ساعة
    const paths = ['posts', 'vip_posts'];
    for (const path of paths) {
        const snap = await db.ref(path).orderByChild('date').endAt(cutoff).once('value');
        if (snap.exists()) {
            await db.ref(path).update(Object.keys(snap.val()).reduce((a, k) => ({...a, [k]: null}), {}));
        }
    }
}

// --- وظائف مساعدة ---
function sendAlert(uid, msg, type) {
    db.ref(`alerts/${uid}`).push({ msg, type, date: Date.now() });
}

// --- الحلقة الرئيسية (كل 5 ثوانٍ) ---
setInterval(async () => {
    if (isProcessing) return;
    isProcessing = true;
    try {
        await processTransfers();
        await processVips();
    } catch (e) {}
    isProcessing = false;
}, 5000);

setInterval(cleanupOldPosts, 3600000); // كل ساعة

http.createServer((req, res) => res.end('SDM Bot is Alive')).listen(process.env.PORT || 3000);
