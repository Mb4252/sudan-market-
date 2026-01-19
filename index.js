const admin = require('firebase-admin');
const express = require('express');
const app = express();

// --- 1. إعداد الاتصال بقاعدة البيانات ---
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
    });
    console.log("✅ SDM Secure Bot: يعمل الآن بنظام الحماية الشامل");
} catch (error) {
    console.error("❌ خطأ في تشغيل البوت:", error.message);
    process.exit(1);
}

const db = admin.database();

// دالة مساعدة لإرسال تنبيه للمستخدم داخل التطبيق
function sendAlert(uid, msg, type = 'success') {
    db.ref(`alerts/${uid}`).push({ 
        msg, 
        type, 
        date: admin.database.ServerValue.TIMESTAMP 
    });
}

// --- 2. محرك التحويلات بين المستخدمين ---
async function processTransfers() {
    const ref = db.ref('requests/transfers');
    const snap = await ref.orderByChild('status').equalTo('pending').limitToFirst(5).once('value');
    if (!snap.exists()) return;

    for (const [id, task] of Object.entries(snap.val())) {
        const { from, toId, amount, fromName } = task;
        const numAmount = parseFloat(amount);

        try {
            // البحث عن المستلم عبر رقم التعريف (6 أرقام)
            const userSnap = await db.ref('users').orderByChild('numericId').equalTo(String(toId)).once('value');
            if (!userSnap.exists()) {
                await ref.child(id).update({ status: 'failed', reason: 'المستلم غير موجود' });
                sendAlert(from, `❌ رقم الحساب ${toId} غير صحيح`, 'error');
                continue;
            }

            const receiverUid = Object.keys(userSnap.val())[0];
            const senderRef = db.ref(`users/${from}/sdmBalance`);

            // استخدام Transaction لخصم الرصيد بأمان
            const tx = await senderRef.transaction(current => {
                if (current === null) return 0;
                let balance = parseFloat(current);
                if (balance < numAmount) return; // إلغاء العملية إذا الرصيد لا يكفي
                return parseFloat((balance - numAmount).toFixed(2));
            });

            if (tx.committed) {
                // إضافة الرصيد للمستلم
                await db.ref(`users/${receiverUid}/sdmBalance`).transaction(c => {
                    return parseFloat((parseFloat(c || 0) + numAmount).toFixed(2));
                });

                await ref.child(id).update({ status: 'completed' });
                sendAlert(receiverUid, `💰 استلمت ${numAmount} SDM من ${fromName}`, 'success');
                sendAlert(from, `✅ تم تحويل ${numAmount} SDM للمستلم ${toId}`, 'success');
            } else {
                await ref.child(id).update({ status: 'failed', reason: 'رصيد غير كافي' });
                sendAlert(from, `❌ فشل: رصيدك لا يكفي للتحويل`, 'error');
            }
        } catch (e) { console.error("Transfer Error:", e); }
    }
}

// --- 3. محرك البيع الآمن (Escrow) والـ VIP والودائع ---
async function processCommerce() {
    // أ- حماية البيع الآمن: خصم وحجز المال فور الطلب
    const escRef = db.ref('requests/escrow_deals');
    const newDeals = await escRef.orderByChild('status').equalTo('pending_delivery').once('value');
    if (newDeals.exists()) {
        for (const [id, deal] of Object.entries(newDeals.val())) {
            const amt = parseFloat(deal.amount);
            // الخصم من المشتري فوراً
            const tx = await db.ref(`users/${deal.buyerId}/sdmBalance`).transaction(c => {
                if (c !== null && parseFloat(c) >= amt) return parseFloat((parseFloat(c) - amt).toFixed(2));
            });

            if (tx.committed) {
                await escRef.child(id).update({ status: 'secured' }); // تغيير الحالة لـ "مؤمن"
                sendAlert(deal.buyerId, `🔒 تم حجز ${amt} SDM لضمان حق البائع. مبالغك الآن في أمان.`, 'info');
            } else {
                await escRef.child(id).update({ status: 'failed', reason: 'رصيد غير كافي' });
                sendAlert(deal.buyerId, `❌ رصيدك لا يكفي لإتمام الشراء الآمن`, 'error');
            }
        }
    }

    // ب- تحرير المال: إرسال المبلغ المحجوز للبائع بعد تأكيد المشتري
    const confirmedDeals = await escRef.orderByChild('status').equalTo('confirmed_by_buyer').once('value');
    if (confirmedDeals.exists()) {
        for (const [id, deal] of Object.entries(confirmedDeals.val())) {
            await db.ref(`users/${deal.sellerId}/sdmBalance`).transaction(c => {
                return parseFloat((parseFloat(c || 0) + parseFloat(deal.amount)).toFixed(2));
            });
            await escRef.child(id).update({ status: 'completed' });
            sendAlert(deal.sellerId, `💰 تم استلام ${deal.amount} SDM من عملية بيع (وسيط)`, 'success');
        }
    }

    // ج- شحن الرصيد (الودائع): معالجة موافقة الأدمن
    const coinRequests = await db.ref('coin_requests').orderByChild('status').equalTo('approved_by_admin').once('value');
    if (coinRequests.exists()) {
        for (const [id, req] of Object.entries(coinRequests.val())) {
            const qty = parseFloat(req.qty);
            await db.ref(`users/${req.uP}/sdmBalance`).transaction(c => {
                return parseFloat((parseFloat(c || 0) + qty).toFixed(2));
            });
            await db.ref(`coin_requests/${id}`).update({ status: 'completed' });
            sendAlert(req.uP, `✅ تم إضافة ${qty} SDM إلى محفظتك`, 'success');
        }
    }

    // د- اشتراكات VIP
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
                sendAlert(task.userId, `👑 تم تفعيل اشتراك VIP بنجاح!`, 'success');
            }
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

// --- 5. تنظيف التنبيهات والمنشورات القديمة ---
async function cleanupSystem() {
    const cutoff = Date.now() - (48 * 60 * 60 * 1000); // 48 ساعة
    // تنظيف المنشورات القديمة تلقائياً
    ['posts', 'vip_posts'].forEach(async path => {
        const snap = await db.ref(path).orderByChild('date').endAt(cutoff).once('value');
        if (snap.exists()) {
            const updates = {};
            Object.keys(snap.val()).forEach(k => updates[k] = null);
            db.ref(path).update(updates);
        }
    });
}

// --- التشغيل الدوري (النبض) ---
setInterval(() => {
    processTransfers();
    processCommerce();
    processRatings();
}, 3000); // كل 3 ثواني للسرعة الفائقة

setInterval(cleanupSystem, 3600000); // كل ساعة

// --- خادم الصحة (Health Check) لابقاء البوت حياً ---
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('SDM Secure Bot is Online 🛡️'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
