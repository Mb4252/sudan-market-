const admin = require('firebase-admin');
const http = require('http');

// --- 1. إعداد الاتصال ---
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
    });
    console.log("✅ البوت المطور يعمل الآن (معالجة دقيقة للرصيد والتحويلات)");
} catch (e) {
    console.error("❌ خطأ في الإعداد:", e.message);
    process.exit(1);
}

const db = admin.database();
let isProcessing = false;

// --- 2. محرك التحويلات المالية (تم التعديل ليكون أكثر دقة) ---
async function processTransfers() {
    const ref = db.ref('requests/transfers');
    const snap = await ref.orderByChild('status').equalTo('pending').limitToFirst(10).once('value');
    
    if (!snap.exists()) return;

    for (const [id, task] of Object.entries(snap.val())) {
        const { from, toId, amount, fromName } = task;
        const numAmount = Number(amount); // تحويل المبلغ لرقم لضمان الحساب الصحيح

        if (isNaN(numAmount) || numAmount <= 0) {
            await ref.child(id).update({ status: 'failed', reason: 'المبلغ غير صالح' });
            continue;
        }

        try {
            // البحث عن المستلم عبر numericId
            const userSnap = await db.ref('users').orderByChild('numericId').equalTo(String(toId)).once('value');
            if (!userSnap.exists()) {
                await ref.child(id).update({ status: 'failed', reason: 'المستلم غير موجود' });
                continue;
            }

            const receiverUid = Object.keys(userSnap.val())[0];

            // 1. خصم الرصيد من المرسل (Transaction لضمان الأمان)
            const senderRef = db.ref(`users/${from}/sdmBalance`);
            const tx = await senderRef.transaction(currentBalance => {
                const bal = Number(currentBalance) || 0; // إذا كان null يعتبر 0
                if (bal >= numAmount) {
                    return bal - numAmount;
                }
                return undefined; // إلغاء العملية إذا لم يكفِ الرصيد
            });

            if (tx.committed) {
                // 2. إضافة الرصيد للمستلم
                const receiverRef = db.ref(`users/${receiverUid}/sdmBalance`);
                await receiverRef.transaction(current => (Number(current) || 0) + numAmount);

                // 3. تحديث حالة الطلب وإرسال تنبيهات
                await ref.child(id).update({ 
                    status: 'completed', 
                    completedAt: Date.now() 
                });

                sendAlert(receiverUid, `💰 وصلك تحويل بمبلغ ${numAmount} SDM من ${fromName}`, 'success');
                sendAlert(from, `✅ تم تحويل ${numAmount} SDM بنجاح للمستلم ${toId}`, 'success');
                
                console.log(`[TRANSFER] من ${fromName} إلى ${toId} مبلغ ${numAmount} بنجاح`);
            } else {
                await ref.child(id).update({ status: 'failed', reason: 'رصيدك الحالي غير كافٍ لإتمام العملية' });
            }
        } catch (e) {
            console.error("خطأ في معالجة التحويل:", e);
            await ref.child(id).update({ status: 'failed', reason: 'خطأ تقني في النظام' });
        }
    }
}

// --- 3. محرك الـ VIP المطور ---
async function processVips() {
    const ref = db.ref('requests/vip_subscriptions');
    const snap = await ref.orderByChild('status').equalTo('pending').once('value');
    if (!snap.exists()) return;

    for (const [id, task] of Object.entries(snap.val())) {
        const { userId, days, cost } = task;
        const numCost = Number(cost);

        const tx = await db.ref(`users/${userId}`).transaction(u => {
            if (u) {
                const currentBal = Number(u.sdmBalance) || 0;
                if (currentBal >= numCost) {
                    const start = (u.vipExpiry && u.vipExpiry > Date.now()) ? u.vipExpiry : Date.now();
                    u.sdmBalance = currentBal - numCost;
                    u.vipStatus = 'active';
                    u.vipExpiry = start + (Number(days) * 24 * 60 * 60 * 1000);
                    return u;
                }
            }
        });

        if (tx.committed) {
            await ref.child(id).update({ status: 'completed' });
            sendAlert(userId, `👑 تم تفعيل اشتراك VIP بنجاح لمدة ${days} يوم`, 'success');
        } else {
            await ref.child(id).update({ status: 'failed', reason: 'رصيدك غير كافٍ لتفعيل VIP' });
        }
    }
}

// --- 4. تنظيف المنشورات القديمة (كل 48 ساعة) ---
async function cleanupOldPosts() {
    const cutoff = Date.now() - (48 * 60 * 60 * 1000);
    const paths = ['posts', 'vip_posts'];
    for (const path of paths) {
        const snap = await db.ref(path).orderByChild('date').endAt(cutoff).once('value');
        if (snap.exists()) {
            const updates = {};
            Object.keys(snap.val()).forEach(key => updates[key] = null);
            await db.ref(path).update(updates);
        }
    }
}

// --- 5. تقييمات المستخدمين ---
async function processRatings() {
    const ref = db.ref('rating_queue');
    const snap = await ref.orderByChild('status').equalTo('pending').once('value');
    if (!snap.exists()) return;

    for (const [id, task] of Object.entries(snap.val())) {
        try {
            await db.ref(`users/${task.target}`).transaction(user => {
                if (user) {
                    const oldRating = Number(user.rating) || 5;
                    const count = Number(user.ratingCount) || 1;
                    user.rating = ((oldRating * count) + Number(task.stars)) / (count + 1);
                    user.ratingCount = count + 1;
                    return user;
                }
            });
            await ref.child(id).update({ status: 'completed' });
        } catch (e) {}
    }
}

// --- وظائف مساعدة ---
function sendAlert(uid, msg, type) {
    db.ref(`alerts/${uid}`).push({
        msg,
        type,
        date: Date.now(),
        read: false
    });
}

// --- الحلقة الرئيسية ---
setInterval(async () => {
    if (isProcessing) return;
    isProcessing = true;
    try {
        await processTransfers();
        await processVips();
        await processRatings();
    } catch (e) {
        console.error("Error in main loop:", e);
    }
    isProcessing = false;
}, 5000);

setInterval(cleanupOldPosts, 3600000); // تنظيف كل ساعة

// خادم لإبقاء البوت مستيقظاً على المنصات السحابية
http.createServer((req, res) => {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('SDM Bot is running and healthy!');
}).listen(process.env.PORT || 3000);
