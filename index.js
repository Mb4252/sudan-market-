const admin = require('firebase-admin');
const express = require('express');
const app = express();

// --- 1. إعداد الاتصال (عبر متغيرات البيئة) ---
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
    });
    console.log("✅ تم تشغيل البوت المطور بنجاح - إصلاح شامل لأنواع البيانات");
} catch (error) {
    console.error("❌ خطأ في الاتصال بالخدمة:", error.message);
    process.exit(1);
}

const db = admin.database();

// --- وظيفة الإشعارات ---
function sendAlert(uid, msg, type = 'success') {
    db.ref(`alerts/${uid}`).push({ 
        msg: msg, 
        type: type, 
        date: admin.database.ServerValue.TIMESTAMP 
    });
}

// --- 1. محرك التحويلات المطور (إصلاح مشكلة الرصيد) ---
async function processTransfers() {
    const ref = db.ref('requests/transfers');
    const snap = await ref.orderByChild('status').equalTo('pending').limitToFirst(5).once('value');
    if (!snap.exists()) return;

    for (const [id, task] of Object.entries(snap.val())) {
        const { from, toId, amount, fromName } = task;
        
        // تحويل المبلغ المطلوب إلى رقم عشري بدقة
        const numAmount = parseFloat(amount);
        
        if (isNaN(numAmount) || numAmount <= 0) {
            await ref.child(id).update({ status: 'failed', reason: 'مبلغ غير صالح' });
            continue;
        }

        try {
            // البحث عن المستلم بواسطة الرقم التعريفي
            const userSnap = await db.ref('users').orderByChild('numericId').equalTo(String(toId)).once('value');
            
            if (!userSnap.exists()) {
                await ref.child(id).update({ status: 'failed', reason: 'المستلم غير موجود' });
                sendAlert(from, `❌ رقم الحساب ${toId} غير صحيح`, 'error');
                continue;
            }

            const receiverUid = Object.keys(userSnap.val())[0];
            const senderRef = db.ref(`users/${from}/sdmBalance`);

            // تنفيذ عملية الخصم من المرسل (Atomic Transaction)
            const tx = await senderRef.transaction(currentValue => {
                const currentBal = parseFloat(currentValue || 0);
                if (currentBal >= numAmount) {
                    // إرجاع القيمة الجديدة كرقم
                    return parseFloat((currentBal - numAmount).toFixed(2));
                } else {
                    return undefined; // إلغاء العملية إذا كان الرصيد الحقيقي أقل
                }
            });

            if (tx.committed) {
                // إضافة المبلغ للمستلم
                await db.ref(`users/${receiverUid}/sdmBalance`).transaction(c => {
                    const bal = parseFloat(c || 0);
                    return parseFloat((bal + numAmount).toFixed(2));
                });

                // تحديث حالة الطلب
                await ref.child(id).update({ status: 'completed', processedAt: Date.now() });

                // إرسال التنبيهات
                sendAlert(receiverUid, `💰 وصلك ${numAmount} SDM من ${fromName}`, 'success');
                sendAlert(from, `✅ تم تحويل ${numAmount} SDM للمستلم ${toId}`, 'success');
                console.log(`✅ عملية تحويل ناجحة: من ${from} إلى ${toId} بمبلغ ${numAmount}`);
            } else {
                // إذا فشلت العملية بسبب الرصيد
                await ref.child(id).update({ status: 'failed', reason: 'رصيد غير كافي فعلياً' });
                sendAlert(from, `❌ فشل التحويل: رصيدك الحقيقي غير كافٍ`, 'error');
            }
        } catch (e) {
            console.error("⚠️ خطأ في معالجة التحويل:", e.message);
        }
    }
}

// --- 2. محرك التقييمات ---
async function processRatings() {
    const ref = db.ref('rating_queue');
    const snap = await ref.orderByChild('status').equalTo('pending').once('value');
    if (!snap.exists()) return;

    for (const [id, task] of Object.entries(snap.val())) {
        try {
            const userRef = db.ref(`users/${task.target}`);
            await userRef.transaction(user => {
                if (user) {
                    const currentRating = parseFloat(user.rating || 5);
                    const count = parseInt(user.ratingCount || 1);
                    const newStars = parseFloat(task.stars);
                    
                    user.rating = parseFloat(((currentRating * count) + newStars) / (count + 1)).toFixed(1);
                    user.ratingCount = count + 1;
                    return user;
                }
            });
            await ref.child(id).update({ status: 'completed' });
            sendAlert(task.target, `⭐ حصلت على تقييم جديد (${task.stars} نجوم)`, 'info');
        } catch (e) { console.error(e); }
    }
}

// --- 3. محرك الـ VIP والوسيط (مع إصلاح الأرقام) ---
async function processCommerce() {
    // معالجة VIP
    const vipRef = db.ref('requests/vip_subscriptions');
    const vSnap = await vipRef.orderByChild('status').equalTo('pending').once('value');
    if (vSnap.exists()) {
        for (const [id, task] of Object.entries(vSnap.val())) {
            const cost = parseFloat(task.cost);
            const tx = await db.ref(`users/${task.userId}`).transaction(u => {
                if (u) {
                    const balance = parseFloat(u.sdmBalance || 0);
                    if (balance >= cost) {
                        const now = Date.now();
                        const start = (u.vipExpiry && u.vipExpiry > now) ? u.vipExpiry : now;
                        u.sdmBalance = parseFloat((balance - cost).toFixed(2));
                        u.vipStatus = 'active';
                        u.vipExpiry = start + (parseInt(task.days) * 86400000);
                        return u;
                    }
                }
            });
            if (tx.committed) {
                await vipRef.child(id).update({ status: 'completed' });
                sendAlert(task.userId, `👑 تم تفعيل VIP لمدة ${task.days} يوم`, 'success');
            }
        }
    }

    // معالجة الوسيط (التحرير)
    const escRef = db.ref('requests/escrow_deals');
    const eSnap = await escRef.orderByChild('status').equalTo('confirmed_by_buyer').once('value');
    if (eSnap.exists()) {
        for (const [id, deal] of Object.entries(eSnap.val())) {
            const amount = parseFloat(deal.amount);
            await db.ref(`users/${deal.sellerId}/sdmBalance`).transaction(c => {
                const bal = parseFloat(c || 0);
                return parseFloat((bal + amount).toFixed(2));
            });
            await escRef.child(id).update({ status: 'completed' });
            sendAlert(deal.sellerId, `💰 تم استلام ${amount} SDM ثمن مبيعاتك (عملية ناجحة)`, 'success');
        }
    }
}

// --- 4. محرك البلاغات ---
async function processReports() {
    const ref = db.ref('user_reports');
    const snap = await ref.orderByChild('status').equalTo('pending').once('value');
    if (snap.exists()) {
        for (const id of Object.keys(snap.val())) {
            await ref.child(id).update({ status: 'received_by_bot' });
        }
    }
}

// --- 5. محرك التنظيف ---
async function cleanupOldPosts() {
    const cutoff = Date.now() - (48 * 60 * 60 * 1000); // 48 ساعة
    const paths = ['posts', 'vip_posts'];
    for (const path of paths) {
        try {
            const snap = await db.ref(path).orderByChild('date').endAt(cutoff).once('value');
            if (snap.exists()) {
                const updates = {};
                Object.keys(snap.val()).forEach(key => { updates[key] = null; });
                await db.ref(path).update(updates);
                console.log(`🧹 تم تنظيف إعلانات قديمة من ${path}`);
            }
        } catch (e) { console.error("Cleanup error:", e); }
    }
}

// --- الحلقة الرئيسية (كل 5 ثوانٍ لسرعة الاستجابة) ---
setInterval(() => {
    processTransfers();
    processRatings();
    processCommerce();
    processReports();
}, 5000);

// تنظيف المنشورات كل ساعة
setInterval(cleanupOldPosts, 3600000);

// --- سيرفر الويب لـ Render ---
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('SDM Market Mega Bot is Active & Fixed 🚀'));
app.listen(PORT, () => console.log(`🌍 السيرفر يعمل على منفذ ${PORT}`));
