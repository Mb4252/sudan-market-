const admin = require('firebase-admin');
const express = require('express');
const app = express();

// --- 1. إعداد الاتصال ---
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
    });
    console.log("✅ البوت الشامل يعمل بنسخة (الوسيط المطور)");
} catch (error) {
    console.error("❌ خطأ في الاتصال:", error.message);
    process.exit(1);
}

const db = admin.database();

// دالة إرسال التنبيهات
function sendAlert(uid, msg, type = 'success') {
    db.ref(`alerts/${uid}`).push({ 
        msg, 
        type, 
        date: admin.database.ServerValue.TIMESTAMP 
    });
}

// --- 2. محرك التحويلات المباشرة ---
async function processTransfers() {
    const ref = db.ref('requests/transfers');
    const snap = await ref.orderByChild('status').equalTo('pending').limitToFirst(5).once('value');
    if (!snap.exists()) return;

    for (const [id, task] of Object.entries(snap.val())) {
        const { from, toId, amount, fromName } = task;
        const numAmount = parseFloat(amount);

        try {
            const userSnap = await db.ref('users').orderByChild('numericId').equalTo(String(toId)).once('value');
            if (!userSnap.exists()) {
                await ref.child(id).update({ status: 'failed', reason: 'المستلم غير موجود' });
                sendAlert(from, `❌ رقم الحساب ${toId} غير صحيح`, 'error');
                continue;
            }

            const receiverUid = Object.keys(userSnap.val())[0];
            const senderRef = db.ref(`users/${from}/sdmBalance`);

            const tx = await senderRef.transaction(currentBalance => {
                if (currentBalance === null) return 0; 
                let balance = parseFloat(currentBalance);
                if (balance < numAmount) return; // إلغاء إذا لم يتوفر الرصيد
                return parseFloat((balance - numAmount).toFixed(2));
            });

            if (tx.committed) {
                await db.ref(`users/${receiverUid}/sdmBalance`).transaction(c => {
                    return parseFloat((parseFloat(c || 0) + numAmount).toFixed(2));
                });

                await ref.child(id).update({ status: 'completed' });
                sendAlert(receiverUid, `💰 استلمت ${numAmount} SDM من ${fromName}`, 'success');
                sendAlert(from, `✅ تم تحويل ${numAmount} SDM بنجاح`, 'success');
            } else {
                await ref.child(id).update({ status: 'failed_balance' }); // تغيير الحالة يوقف التكرار
                sendAlert(from, `❌ فشل: رصيدك الحالي لا يكفي للتحويل`, 'error');
            }
        } catch (e) { console.error("Transfer Error:", e); }
    }
}

// --- 3. محرك التجارة (VIP + الشراء الآمن) ---
async function processCommerce() {
    // أ- معالجة اشتراكات VIP
    const vipRef = db.ref('requests/vip_subscriptions');
    const vSnap = await vipRef.orderByChild('status').equalTo('pending').once('value');
    if (vSnap.exists()) {
        for (const [id, task] of Object.entries(vSnap.val())) {
            const cost = parseFloat(task.cost);
            const tx = await db.ref(`users/${task.userId}`).transaction(u => {
                if (u && parseFloat(u.sdmBalance || 0) >= cost) {
                    const now = Date.now();
                    const start = (u.vipExpiry && u.vipExpiry > now) ? u.vipExpiry : now;
                    u.sdmBalance = parseFloat((parseFloat(u.sdmBalance) - cost).toFixed(2));
                    u.vipStatus = 'active';
                    u.vipExpiry = start + (parseInt(task.days) * 86400000);
                    return u;
                }
            });
            if (tx.committed) {
                await vipRef.child(id).update({ status: 'completed' });
                sendAlert(task.userId, `👑 تم تفعيل اشتراك VIP بنجاح`, 'success');
            } else {
                await vipRef.child(id).update({ status: 'failed_balance' });
                sendAlert(task.userId, `❌ فشل تفعيل VIP: رصيدك غير كافٍ`, 'error');
            }
        }
    }

    // ب- الشراء الآمن (Escrow): المرحلة 1 - حجز المال من المشتري
    const escRef = db.ref('requests/escrow_deals');
    const eSnap = await escRef.orderByChild('status').equalTo('pending_delivery').once('value');
    if (eSnap.exists()) {
        for (const [id, deal] of Object.entries(eSnap.val())) {
            const amount = parseFloat(deal.amount);
            const buyerRef = db.ref(`users/${deal.buyerId}/sdmBalance`);

            const tx = await buyerRef.transaction(current => {
                if (current !== null && parseFloat(current) >= amount) {
                    return parseFloat((parseFloat(current) - amount).toFixed(2));
                }
                return; // سيفشل إذا كان الرصيد أقل
            });

            if (tx.committed) {
                // المال الآن "مؤمن" لدى الوسيط
                await escRef.child(id).update({ status: 'secured' });
                sendAlert(deal.buyerId, `✅ تم تأمين مبلغ ${amount} SDM. الطلب قيد التنفيذ الآن.`, 'success');
                sendAlert(deal.sellerId, `📢 قام ${deal.buyerName} بحجز مبلغ لسلعتك. قم بتسليمه الآن.`, 'info');
            } else {
                // فشل الرصيد: نغير الحالة فوراً لإيقاف التكرار
                await escRef.child(id).update({ status: 'failed_balance' });
                sendAlert(deal.buyerId, `❌ فشل الشراء: رصيدك الحالي لا يكفي للحجز`, 'error');
            }
        }
    }

    // ج- الشراء الآمن (Escrow): المرحلة 2 - تحرير المال للبائع
    const confirmedSnap = await escRef.orderByChild('status').equalTo('confirmed_by_buyer').once('value');
    if (confirmedSnap.exists()) {
        for (const [id, deal] of Object.entries(confirmedSnap.val())) {
            await db.ref(`users/${deal.sellerId}/sdmBalance`).transaction(c => {
                return parseFloat((parseFloat(c || 0) + parseFloat(deal.amount)).toFixed(2));
            });
            await escRef.child(id).update({ status: 'completed' });
            sendAlert(deal.sellerId, `💰 مبروك! استلمت ${deal.amount} SDM من عملية بيع ${deal.itemTitle}`, 'success');
            sendAlert(deal.buyerId, `✅ تم إغلاق الطلب بنجاح. شكراً لثقتك بنا.`, 'success');
        }
    }
}

// --- 4. محرك التقييمات ---
async function processRatings() {
    const ref = db.ref('rating_queue');
    const snap = await ref.orderByChild('status').equalTo('pending').once('value');
    if (snap.exists()) {
        for (const [id, task] of Object.entries(snap.val())) {
            await db.ref(`users/${task.target}`).transaction(user => {
                if (user) {
                    const currentRating = parseFloat(user.rating || 5);
                    const count = parseInt(user.ratingCount || 1);
                    user.rating = ((currentRating * count) + parseFloat(task.stars)) / (count + 1);
                    user.ratingCount = count + 1;
                    return user;
                }
            });
            await ref.child(id).update({ status: 'completed' });
        }
    }
}

// --- 5. محرك تنظيف المنشورات القديمة (كل 48 ساعة) ---
async function cleanupOldPosts() {
    const cutoff = Date.now() - (48 * 60 * 60 * 1000);
    const paths = ['posts', 'vip_posts'];
    for (const path of paths) {
        const snap = await db.ref(path).orderByChild('date').endAt(cutoff).once('value');
        if (snap.exists()) {
            const updates = {};
            Object.keys(snap.val()).forEach(key => { updates[key] = null; });
            await db.ref(path).update(updates);
            console.log(`🧹 تنظيف: تم حذف منشورات قديمة من ${path}`);
        }
    }
}

// --- التشغيل الدوري ---
setInterval(() => {
    processTransfers();
    processCommerce();
    processRatings();
}, 5000); // يعمل كل 5 ثواني لفحص الطلبات

setInterval(cleanupOldPosts, 3600000); // فحص التنظيف كل ساعة

const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('SDM Secure Bot is Online...'));
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
