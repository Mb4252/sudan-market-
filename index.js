const admin = require('firebase-admin');
const express = require('express');
const app = express();

// --- 1. إعداد Firebase ---
// تأكد من وضع ملف الـ JSON الخاص بالحساب الخدمي في متغير البيئة FIREBASE_SERVICE_ACCOUNT على Render
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.error("❌ خطأ: لم يتم ضبط متغير FIREBASE_SERVICE_ACCOUNT");
    process.exit(1);
}

try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
    });
    console.log("🚀 SDM Secure Bot Started | المحرك يعمل وبانتظار العمليات...");
} catch (error) {
    console.error("❌ خطأ في تشغيل Firebase:", error.message);
    process.exit(1);
}

const db = admin.database();

// دالة مساعدة لإرسال التنبيهات للتطبيق
function sendAlert(uid, msg, type = 'success') {
    if (!uid) return;
    db.ref(`alerts/${uid}`).push({
        msg: msg,
        type: type,
        date: admin.database.ServerValue.TIMESTAMP
    });
}

/**
 * [أ] محرك نظام الوسيط (Escrow Engine)
 * يعالج حجز الأموال (Stage 1) وتحويلها للبائع (Stage 2)
 */
async function processEscrow() {
    try {
        const escRef = db.ref('requests/escrow_deals');

        // --- المرحلة 1: حجز المبلغ (عندما يضغط المشتري "شراء") ---
        const pendingLock = await escRef.orderByChild('status').equalTo('pending_delivery').once('value');
        if (pendingLock.exists()) {
            for (const [id, deal] of Object.entries(pendingLock.val())) {
                const amount = parseFloat(deal.amount);
                const buyerRef = db.ref(`users/${deal.buyerId}`);

                const lockTx = await buyerRef.transaction(userData => {
                    if (!userData) return userData;
                    const balance = parseFloat(userData.sdmBalance || 0);
                    if (balance < amount) return undefined; // إلغاء إذا الرصيد لا يكفي
                    userData.sdmBalance = Number((balance - amount).toFixed(2));
                    return userData;
                });

                if (lockTx.committed) {
                    // تحديث الصفقة إلى "مؤمنة/محجوزة"
                    await escRef.child(id).update({ status: 'secured' });
                    // تحديث المنشور ليظهر كـ "قيد الشراء"
                    const path = deal.path || 'posts';
                    await db.ref(`${path}/${deal.postId}`).update({ 
                        pending: true,
                        buyerId: deal.buyerId 
                    });

                    sendAlert(deal.buyerId, `🔒 تم حجز ${amount} SDM بنجاح. المبلغ الآن في أمان الوسيط.`, 'info');
                    sendAlert(deal.sellerId, `🔔 طلب شراء جديد لـ "${deal.itemTitle}". المبلغ محجوز، يمكنك تسليم السلعة الآن.`, 'success');
                    console.log(`[Escrow] Funds locked for deal: ${id}`);
                } else {
                    await escRef.child(id).update({ status: 'failed_insufficient_funds' });
                    sendAlert(deal.buyerId, `❌ فشل الشراء: رصيدك الحالي أقل من ${amount} SDM`, 'error');
                }
            }
        }

        // --- المرحلة 2: تحويل المال للبائع (عندما يضغط المشتري "تم الاستلام") ---
        const pendingRelease = await escRef.orderByChild('status').equalTo('confirmed_by_buyer').once('value');
        if (pendingRelease.exists()) {
            for (const [id, deal] of Object.entries(pendingRelease.val())) {
                try {
                    const amount = parseFloat(deal.amount);
                    const sellerRef = db.ref(`users/${deal.sellerId}/sdmBalance`);

                    // 1. إضافة المال لرصيد البائع
                    await sellerRef.transaction(currentBal => {
                        return Number(((currentBal || 0) + amount).toFixed(2));
                    });

                    // 2. تحديث حالة المنشور إلى "تم البيع" نهائياً
                    const path = deal.path || 'posts';
                    await db.ref(`${path}/${deal.postId}`).update({ 
                        sold: true, 
                        pending: false,
                        buyerId: deal.buyerId 
                    });

                    // 3. إغلاق الصفقة
                    await escRef.child(id).update({ 
                        status: 'completed', 
                        completedAt: admin.database.ServerValue.TIMESTAMP 
                    });

                    // 4. تسجيل المعاملة في السجل العام
                    await db.ref('transactions').push({
                        type: 'escrow_payout',
                        from: deal.buyerId,
                        to: deal.sellerId,
                        amount: amount,
                        item: deal.itemTitle,
                        date: admin.database.ServerValue.TIMESTAMP
                    });

                    sendAlert(deal.sellerId, `💰 مبروك! استلمت ${amount} SDM مقابل مبيع "${deal.itemTitle}"`, 'success');
                    sendAlert(deal.buyerId, `✅ تم تحويل المال للبائع بنجاح. شكراً لثقتك بالوسيط الآمن.`, 'success');
                    
                    console.log(`[Escrow] Payout completed for deal: ${id}`);
                } catch (err) {
                    console.error("Error in Payout Loop:", err);
                }
            }
        }
    } catch (err) {
        console.error("❌ Escrow Engine Error:", err.message);
    }
}

/**
 * [ب] محرك التحويلات المباشرة
 */
async function processTransfers() {
    try {
        const transRef = db.ref('requests/transfers');
        const snap = await transRef.orderByChild('status').equalTo('pending').once('value');

        if (snap.exists()) {
            for (const [id, req] of Object.entries(snap.val())) {
                const amount = parseFloat(req.amount);
                const targetSnap = await db.ref('users').orderByChild('numericId').equalTo(req.toId).once('value');
                
                if (!targetSnap.exists()) {
                    await transRef.child(id).update({ status: 'failed_invalid_recipient' });
                    sendAlert(req.from, `❌ الرقم ${req.toId} غير موجود.`, 'error');
                    continue;
                }

                const targetUid = Object.keys(targetSnap.val())[0];
                const tx = await db.ref(`users/${req.from}`).transaction(u => {
                    if (!u) return u;
                    if ((u.sdmBalance || 0) < amount) return undefined;
                    u.sdmBalance = Number((u.sdmBalance - amount).toFixed(2));
                    return u;
                });

                if (tx.committed) {
                    await db.ref(`users/${targetUid}/sdmBalance`).transaction(b => Number(((b || 0) + amount).toFixed(2)));
                    await transRef.child(id).update({ status: 'completed', toUid: targetUid });
                    sendAlert(req.from, `✅ تم تحويل ${amount} SDM بنجاح.`, 'success');
                    sendAlert(targetUid, `💰 استلمت ${amount} SDM من ${req.fromName}`, 'success');
                } else {
                    await transRef.child(id).update({ status: 'failed_balance' });
                    sendAlert(req.from, `❌ رصيدك لا يكفي للتحويل.`, 'error');
                }
            }
        }
    } catch (e) { console.error("Transfer Error:", e.message); }
}

/**
 * [ج] محرك اشتراكات VIP
 */
async function processVIP() {
    try {
        const snap = await db.ref('requests/vip_subscriptions').orderByChild('status').equalTo('pending').once('value');
        if (snap.exists()) {
            for (const [id, req] of Object.entries(snap.val())) {
                const cost = parseFloat(req.cost);
                const tx = await db.ref(`users/${req.userId}`).transaction(u => {
                    if (!u) return u;
                    if ((u.sdmBalance || 0) < cost) return undefined;
                    const now = Date.now();
                    u.sdmBalance = Number((u.sdmBalance - cost).toFixed(2));
                    u.vipStatus = 'active';
                    u.vipExpiry = ((u.vipExpiry > now) ? u.vipExpiry : now) + (req.days * 86400000);
                    return u;
                });

                if (tx.committed) {
                    await db.ref(`requests/vip_subscriptions/${id}`).update({ status: 'completed' });
                    sendAlert(req.userId, `👑 تم تفعيل اشتراك VIP لمدة ${req.days} يوم!`, 'success');
                } else {
                    await db.ref(`requests/vip_subscriptions/${id}`).update({ status: 'failed' });
                    sendAlert(req.userId, `❌ رصيدك لا يكفي لتفعيل VIP.`, 'error');
                }
            }
        }
    } catch (e) { console.error("VIP Error:", e.message); }
}

// المجدولات الزمنية (كل بضع ثوانٍ)
setInterval(processEscrow, 5000); 
setInterval(processTransfers, 6000);
setInterval(processVIP, 8000);

// سيرفر بسيط للبقاء حياً
app.get('/', (req, res) => res.send('SDM Secure Bot is Running... 🚀'));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server is on port ${PORT}`));
