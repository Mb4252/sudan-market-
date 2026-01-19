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
    console.log("✅ SDM Bot Online - نظام الوسيط المطور قيد التشغيل");
} catch (error) {
    console.error("❌ خطأ في الاتصال بـ Firebase:", error.message);
    process.exit(1);
}

const db = admin.database();

// دالة إرسال التنبيهات للمستخدمين
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
                sendAlert(from, `❌ الحساب ${toId} غير موجود`, 'error');
                continue;
            }

            const receiverUid = Object.keys(userSnap.val())[0];
            const senderRef = db.ref(`users/${from}/sdmBalance`);

            const tx = await senderRef.transaction(current => {
                let bal = (current === null) ? 0 : parseFloat(current);
                if (bal >= numAmount) return parseFloat((bal - numAmount).toFixed(2));
                return; // إلغاء إذا لم يتوفر الرصيد
            });

            if (tx.committed) {
                await db.ref(`users/${receiverUid}/sdmBalance`).transaction(c => parseFloat((parseFloat(c || 0) + numAmount).toFixed(2)));
                await ref.child(id).update({ status: 'completed' });
                sendAlert(receiverUid, `💰 استلمت ${numAmount} SDM من ${fromName}`, 'success');
                sendAlert(from, `✅ تم تحويل ${numAmount} SDM للمستلم ${toId}`, 'success');
            } else {
                await ref.child(id).update({ status: 'failed_balance' });
                sendAlert(from, `❌ فشل: رصيدك الحالي لا يكفي للتحويل`, 'error');
            }
        } catch (e) { console.error("Transfer Error:", e); }
    }
}

// --- 3. محرك التجارة (VIP + الشراء الآمن) ---
async function processCommerce() {
    // أ- اشتراكات VIP
    const vipRef = db.ref('requests/vip_subscriptions');
    const vSnap = await vipRef.orderByChild('status').equalTo('pending').once('value');
    if (vSnap.exists()) {
        for (const [id, task] of Object.entries(vSnap.val())) {
            const cost = parseFloat(task.cost);
            const userBalRef = db.ref(`users/${task.userId}/sdmBalance`);

            const tx = await userBalRef.transaction(current => {
                let bal = (current === null) ? 0 : parseFloat(current);
                if (bal >= cost) return parseFloat((bal - cost).toFixed(2));
                return;
            });

            if (tx.committed) {
                const now = Date.now();
                await db.ref(`users/${task.userId}`).update({
                    vipStatus: 'active',
                    vipExpiry: now + (parseInt(task.days) * 86400000)
                });
                await vipRef.child(id).update({ status: 'completed' });
                sendAlert(task.userId, `👑 تم تفعيل اشتراك VIP بنجاح`, 'success');
            } else {
                await vipRef.child(id).update({ status: 'failed_balance' });
                sendAlert(task.userId, `❌ فشل تفعيل VIP: الرصيد غير كافٍ`, 'error');
            }
        }
    }

    // ب- الشراء الآمن (Escrow): المرحلة 1 - حجز المال من المشتري
    const escRef = db.ref('requests/escrow_deals');
    const eSnap = await escRef.orderByChild('status').equalTo('pending_delivery').once('value');
    if (eSnap.exists()) {
        for (const [id, deal] of Object.entries(eSnap.val())) {
            const amount = parseFloat(deal.amount);
            const buyerBalRef = db.ref(`users/${deal.buyerId}/sdmBalance`);

            console.log(`🔍 فحص طلب شراء: المشتري ${deal.buyerId} يطلب حجز ${amount} SDM`);

            const tx = await buyerBalRef.transaction(current => {
                let bal = (current === null) ? 0 : parseFloat(current);
                if (bal >= amount) {
                    return parseFloat((bal - amount).toFixed(2));
                }
                console.log(`⚠️ رصيد غير كافٍ فعلياً في القاعدة: ${bal} أقل من ${amount}`);
                return; 
            });

            if (tx.committed) {
                await escRef.child(id).update({ status: 'secured' });
                sendAlert(deal.buyerId, `✅ تم حجز مبلغ ${amount} SDM. تواصل مع البائع للاستلام.`, 'success');
                sendAlert(deal.sellerId, `📢 قام ${deal.buyerName} بحجز مبلغ مقابل سلعتك. قم بتسليمه الآن.`, 'info');
                console.log(`✅ تمت عملية الحجز بنجاح للطلب ${id}`);
            } else {
                await escRef.child(id).update({ status: 'failed_balance' });
                sendAlert(deal.buyerId, `❌ فشل الشراء: رصيدك الحالي لا يكفي للحجز`, 'error');
                console.log(`❌ فشلت عملية الحجز للطلب ${id} بسبب الرصيد`);
            }
        }
    }

    // ج- الشراء الآمن (Escrow): المرحلة 2 - تحرير المال للبائع عند التأكيد
    const confirmedSnap = await escRef.orderByChild('status').equalTo('confirmed_by_buyer').once('value');
    if (confirmedSnap.exists()) {
        for (const [id, deal] of Object.entries(confirmedSnap.val())) {
            const amount = parseFloat(deal.amount);
            const sellerRef = db.ref(`users/${deal.sellerId}/sdmBalance`);

            await sellerRef.transaction(c => parseFloat((parseFloat(c || 0) + amount).toFixed(2)));
            await escRef.child(id).update({ status: 'completed' });
            
            sendAlert(deal.sellerId, `💰 تم استلام ${amount} SDM في محفظتك من عملية بيع ${deal.itemTitle}`, 'success');
            sendAlert(deal.buyerId, `✅ تم إكمال العملية بنجاح.`, 'success');
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
            console.log(`🧹 تم تنظيف المنشورات القديمة من ${path}`);
        }
    }
}

// --- التشغيل الدوري ---
setInterval(() => {
    processTransfers();
    processCommerce();
    processRatings();
}, 5000); // كل 5 ثواني

setInterval(cleanupOldPosts, 3600000); // كل ساعة

const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('SDM Bot Active...'));
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
