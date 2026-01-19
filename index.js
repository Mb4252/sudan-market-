const admin = require('firebase-admin');
const express = require('express');
const app = express();

// --- 1. إعداد الاتصال بقاعدة البيانات ---
try {
    // تأكد من وضع متغير البيئة FIREBASE_SERVICE_ACCOUNT في إعدادات السيرفر
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
    });
    console.log("✅ SDM Bot: النظام يعمل بكفاءة مع تحديثات الوسيط الآمن");
} catch (error) {
    console.error("❌ خطأ في تهيئة Firebase:", error.message);
    process.exit(1);
}

const db = admin.database();

// دالة مساعدة لإرسال التنبيهات الفورية للمستخدم
function sendAlert(uid, msg, type = 'success') {
    db.ref(`alerts/${uid}`).push({
        msg,
        type,
        date: admin.database.ServerValue.TIMESTAMP
    });
}

// --- 2. محرك الوسيط الآمن (Escrow System) ---
async function processEscrow() {
    const escRef = db.ref('requests/escrow_deals');

    // أ- حجز الأموال: تحويل الحالة من 'pending_delivery' إلى 'secured'
    const pendingSnap = await escRef.orderByChild('status').equalTo('pending_delivery').once('value');
    if (pendingSnap.exists()) {
        for (const [id, deal] of Object.entries(pendingSnap.val())) {
            const amount = parseFloat(deal.amount);
            const buyerRef = db.ref(`users/${deal.buyerId}/sdmBalance`);

            try {
                const tx = await buyerRef.transaction(currentBal => {
                    if (currentBal === null) return 0;
                    let bal = parseFloat(currentBal);
                    if (bal < amount) return; // رصيد غير كافي، إلغاء العملية
                    return parseFloat((bal - amount).toFixed(2));
                });

                if (tx.committed) {
                    await escRef.child(id).update({ status: 'secured' });
                    sendAlert(deal.buyerId, `✅ تم حجز ${amount} SDM بنجاح لعملية الشراء: ${deal.itemTitle}`, 'success');
                    sendAlert(deal.sellerId, `🔔 طلب شراء جديد: تم حجز المبلغ لدى الوسيط لسلعتك (${deal.itemTitle}). يمكنك التسليم الآن.`, 'info');
                } else {
                    await escRef.child(id).update({ status: 'failed', reason: 'insufficient_balance' });
                    sendAlert(deal.buyerId, `❌ فشل حجز المبلغ لـ ${deal.itemTitle}: رصيدك الحالي لا يكفي.`, 'error');
                }
            } catch (e) { console.error("Escrow Secure Error:", e); }
        }
    }

    // ب- تحرير الأموال للبائع: من 'confirmed_by_buyer' إلى 'completed'
    const confirmedSnap = await escRef.orderByChild('status').equalTo('confirmed_by_buyer').once('value');
    if (confirmedSnap.exists()) {
        for (const [id, deal] of Object.entries(confirmedSnap.val())) {
            const amount = parseFloat(deal.amount);
            const sellerRef = db.ref(`users/${deal.sellerId}/sdmBalance`);

            try {
                await sellerRef.transaction(currentBal => {
                    return parseFloat((parseFloat(currentBal || 0) + amount).toFixed(2));
                });

                await escRef.child(id).update({ status: 'completed' });
                sendAlert(deal.sellerId, `💰 تم إيداع ${amount} SDM في رصيدك بعد تأكيد المشتري للاستلام.`, 'success');
                sendAlert(deal.buyerId, `🏁 تمت العملية بنجاح. شكراً لثقتك بـ SDM Market.`, 'success');
                
                // تسجيل في السجل العام
                db.ref('transactions').push({
                    type: 'escrow_payout',
                    to: deal.sellerId,
                    amount: amount,
                    item: deal.itemTitle,
                    date: admin.database.ServerValue.TIMESTAMP
                });
            } catch (e) { console.error("Escrow Payout Error:", e); }
        }
    }
}

// --- 3. محرك التحويلات بين المستخدمين (P2P) ---
async function processTransfers() {
    const ref = db.ref('requests/transfers');
    const snap = await ref.orderByChild('status').equalTo('pending').limitToFirst(10).once('value');
    if (!snap.exists()) return;

    for (const [id, task] of Object.entries(snap.val())) {
        const amount = parseFloat(task.amount);
        try {
            // البحث عن المستلم بواسطة الرقم التعريفي
            const uSnap = await db.ref('users').orderByChild('numericId').equalTo(String(task.toId)).once('value');
            if (!uSnap.exists()) {
                await ref.child(id).update({ status: 'failed', reason: 'recipient_not_found' });
                sendAlert(task.from, `❌ الرقم التعريف ${task.toId} غير صحيح.`, 'error');
                continue;
            }

            const receiverUid = Object.keys(uSnap.val())[0];
            const senderRef = db.ref(`users/${task.from}/sdmBalance`);

            const tx = await senderRef.transaction(curr => {
                if (curr === null) return 0;
                if (parseFloat(curr) < amount) return;
                return parseFloat((parseFloat(curr) - amount).toFixed(2));
            });

            if (tx.committed) {
                await db.ref(`users/${receiverUid}/sdmBalance`).transaction(c => parseFloat((parseFloat(c || 0) + amount).toFixed(2)));
                await ref.child(id).update({ status: 'completed' });
                sendAlert(receiverUid, `💰 استلمت تحويل: ${amount} SDM من ${task.fromName}`, 'success');
                sendAlert(task.from, `✅ تم تحويل ${amount} SDM بنجاح.`, 'success');
            } else {
                await ref.child(id).update({ status: 'failed', reason: 'insufficient_balance' });
                sendAlert(task.from, `❌ فشل التحويل: رصيدك غير كافٍ.`, 'error');
            }
        } catch (e) { console.error("Transfer Error:", e); }
    }
}

// --- 4. محرك الـ VIP والتقييمات ---
async function processOthers() {
    // معالجة VIP
    const vipRef = db.ref('requests/vip_subscriptions');
    const vSnap = await vipRef.orderByChild('status').equalTo('pending').once('value');
    if (vSnap.exists()) {
        for (const [id, t] of Object.entries(vSnap.val())) {
            const cost = parseFloat(t.cost);
            const userRef = db.ref(`users/${t.userId}`);
            const tx = await userRef.transaction(u => {
                if (u && parseFloat(u.sdmBalance || 0) >= cost) {
                    const start = (u.vipExpiry && u.vipExpiry > Date.now()) ? u.vipExpiry : Date.now();
                    u.sdmBalance = parseFloat((parseFloat(u.sdmBalance) - cost).toFixed(2));
                    u.vipStatus = 'active';
                    u.vipExpiry = start + (parseInt(t.days) * 86400000);
                    return u;
                }
            });
            if (tx.committed) {
                await vipRef.child(id).update({ status: 'completed' });
                sendAlert(t.userId, `👑 تم تفعيل اشتراك VIP بنجاح!`, 'success');
            }
        }
    }

    // معالجة التقييمات
    const rateRef = db.ref('rating_queue');
    const rSnap = await rateRef.orderByChild('status').equalTo('pending').once('value');
    if (rSnap.exists()) {
        for (const [id, t] of Object.entries(rSnap.val())) {
            await db.ref(`users/${t.target}`).transaction(u => {
                if (u) {
                    const oldR = parseFloat(u.rating || 5);
                    const count = parseInt(u.ratingCount || 1);
                    u.rating = ((oldR * count) + parseFloat(t.stars)) / (count + 1);
                    u.ratingCount = count + 1;
                    return u;
                }
            });
            await rateRef.child(id).update({ status: 'completed' });
        }
    }
}

// --- 5. التشغيل الدوري للمحركات ---
setInterval(processEscrow, 5000);   // كل 5 ثواني
setInterval(processTransfers, 6000); // كل 6 ثواني
setInterval(processOthers, 10000);  // كل 10 ثواني

// إبقاء السيرفر نشطاً
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('🚀 SDM Secure Bot is Online'));
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
