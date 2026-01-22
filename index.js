const admin = require('firebase-admin');
const express = require('express');
const app = express();

// 1. إعداد الاتصال بقاعدة البيانات
// تأكد من ضبط FIREBASE_SERVICE_ACCOUNT في الـ Environment Variables بموقع Render
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
});

const db = admin.database();
// أضف في الأعلى
const admin = require('firebase-admin');

// استخدم Admin SDK للكتابة
async function updateUserBalance(uid, amount) {
  const userRef = admin.database().ref(`users/${uid}`);
  await userRef.update({ sdmBalance: amount });
  // البوت لديه صلاحيات خاصة
}
/**
 * دالة مساعدة لإرسال تنبيهات فورية للمستخدمين
 */
function sendAlert(uid, msg, type = 'success') {
    db.ref(`alerts/${uid}`).push({
        msg: msg,
        type: type,
        date: admin.database.ServerValue.TIMESTAMP
    });
}

/**
 * [1] محرك الوسيط الآمن (Escrow System)
 */
/**
 * [1] محرك الوسيط الآمن (Escrow System) - نسخة محدثة بحماية ضد الشراء الذاتي
 */
async function processEscrow() {
    try {
        const escRef = db.ref('requests/escrow_deals');

        const pendingLock = await escRef.orderByChild('status').equalTo('pending_delivery').once('value');
        if (pendingLock.exists()) {
            for (const [id, deal] of Object.entries(pendingLock.val())) {
                
                // --- صمام الأمان البرمجي: منع الشراء من النفس ---
                if (deal.buyerId === deal.sellerId) {
                    await escRef.child(id).update({ 
                        status: 'failed_self_purchase',
                        updatedAt: admin.database.ServerValue.TIMESTAMP 
                    });
                    sendAlert(deal.buyerId, `❌ محاولة فاشلة: لا يمكنك الشراء من نفسك لغرض التقييم.`, 'error');
                    continue; // الانتقال للعملية التالية
                }
                // ---------------------------------------------

                const amount = parseFloat(deal.amount);
                const lockTx = await db.ref(`users/${deal.buyerId}`).transaction(user => {
                    if (!user) return user;
                    const bal = parseFloat(user.sdmBalance || 0);
                    if (bal < amount) return undefined; 
                    user.sdmBalance = Number((bal - amount).toFixed(2));
                    return user;
                });

                if (lockTx.committed) {
                    await escRef.child(id).update({ status: 'secured', updatedAt: admin.database.ServerValue.TIMESTAMP });
                    await db.ref(`${deal.path}/${deal.postId}`).update({ pending: true, buyerId: deal.buyerId });
                    sendAlert(deal.buyerId, `🔒 تم حجز ${amount} SDM. حقك محفوظ في الوسيط الآن.`);
                    sendAlert(deal.sellerId, `🔔 تم دفع مبلغ السلعة للوسيط. يمكنك التسليم للمشتري الآن.`);
                } else {
                    await escRef.child(id).update({ status: 'failed_insufficient_funds' });
                    sendAlert(deal.buyerId, `❌ رصيدك غير كافٍ لإتمام عملية الشراء.`, 'error');
                }
            }
        }
        
        // ... بقية الدالة (confirmed_by_buyer و cancelled_by_buyer) تبقى كما هي
    } catch (e) { console.error("Escrow Error:", e.message); }
}

/**
 * [2] وظيفة تنظيف المتجر (حذف المباع بعد 24 ساعة)
 */
async function cleanupStore() {
    try {
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;
        const paths = ['posts', 'vip_posts'];
        
        for (const path of paths) {
            const snap = await db.ref(path).orderByChild('sold').equalTo(true).once('value');
            if (snap.exists()) {
                snap.forEach(child => {
                    const post = child.val();
                    if (post.soldAt && (now - post.soldAt) > oneDay) {
                        child.ref.remove();
                    }
                });
            }
        }
    } catch (e) { console.error("Cleanup Error:", e.message); }
}

/**
 * [3] محرك التحويل المباشر بين المستخدمين
 */
async function processTransfers() {
    try {
        const snap = await db.ref('requests/transfers').orderByChild('status').equalTo('pending').once('value');
        if (snap.exists()) {
            for (const [id, req] of Object.entries(snap.val())) {
                const amount = parseFloat(req.amount);
                const targetSnap = await db.ref('users').orderByChild('numericId').equalTo(req.toId).once('value');
                
                if (!targetSnap.exists()) {
                    await db.ref(`requests/transfers/${id}`).update({ status: 'failed_not_found' });
                    sendAlert(req.from, `❌ عذراً، لم نجد مستخدماً يحمل الرقم ${req.toId}`, 'error');
                    continue;
                }

                const targetUid = Object.keys(targetSnap.val())[0];
                const tx = await db.ref(`users/${req.from}`).transaction(u => {
                    if (!u || (u.sdmBalance || 0) < amount) return undefined;
                    u.sdmBalance = Number((u.sdmBalance - amount).toFixed(2));
                    return u;
                });

                if (tx.committed) {
                    await db.ref(`users/${targetUid}/sdmBalance`).transaction(b => Number(((b || 0) + amount).toFixed(2)));
                    await db.ref(`requests/transfers/${id}`).update({ status: 'completed' });
                    sendAlert(req.from, `✅ تم تحويل ${amount} SDM بنجاح.`);
                    sendAlert(targetUid, `💰 وصلك تحويل ${amount} SDM من ${req.fromName}.`);
                } else {
                    await db.ref(`requests/transfers/${id}`).update({ status: 'failed_insufficient_funds' });
                    sendAlert(req.from, `❌ فشل التحويل: رصيدك غير كافٍ.`, 'error');
                }
            }
        }
    } catch (e) { console.error("Transfer Error:", e.message); }
}

/**
 * [4] محرك الـ VIP (شراء + فحص انتهاء الصلاحية)
 */
async function processVIP() {
    try {
        // أ- معالجة طلبات الشراء الجديدة
        const snap = await db.ref('requests/vip_subscriptions').orderByChild('status').equalTo('pending').once('value');
        if (snap.exists()) {
            for (const [id, req] of Object.entries(snap.val())) {
                const cost = parseFloat(req.cost);
                const tx = await db.ref(`users/${req.userId}`).transaction(u => {
                    if (!u || (u.sdmBalance || 0) < cost) return undefined;
                    u.sdmBalance = Number((u.sdmBalance - cost).toFixed(2));
                    u.vipStatus = 'active';
                    u.vipExpiry = (Math.max(u.vipExpiry || 0, Date.now())) + (req.days * 86400000);
                    return u;
                });
                if (tx.committed) {
                    await db.ref(`requests/vip_subscriptions/${id}`).update({ status: 'completed' });
                    sendAlert(req.userId, `👑 مبروك! تم تفعيل ميزات VIP لمدة ${req.days} يوم.`);
                }
            }
        }

        // ب- فحص انتهاء الصلاحية (لسحب التاج)
        const now = Date.now();
        const activeVips = await db.ref('users').orderByChild('vipStatus').equalTo('active').once('value');
        if (activeVips.exists()) {
            activeVips.forEach(child => {
                const user = child.val();
                if (user.vipExpiry && now > user.vipExpiry) {
                    child.ref.update({ vipStatus: 'expired' });
                    sendAlert(child.key, "⚠️ انتهى اشتراك VIP الخاص بك. يمكنك التجديد من لوحة VIP.", "info");
                }
            });
        }
    } catch (e) {}
}
/**
 * [6] محرك معالجة تحويلات البنوك
 */
async function processBankTransfers() {
    try {
        const snap = await db.ref('bank_transfer_requests').orderByChild('status').equalTo('pending').once('value');
        if (snap.exists()) {
            for (const [id, req] of Object.entries(snap.val())) {
                // التحقق من رصيد المستخدم
                const userSnap = await db.ref(`users/${req.userId}`).once('value');
                const user = userSnap.val();
                
                if (!user || (user.sdmBalance || 0) < req.amountSDM) {
                    // رفض الطلب تلقائياً إذا الرصيد غير كافٍ
                    await db.ref(`bank_transfer_requests/${id}`).update({
                        status: 'auto_rejected',
                        reason: 'رصيد غير كافٍ',
                        processedAt: admin.database.ServerValue.TIMESTAMP
                    });
                    
                    await db.ref(`alerts/${req.userId}`).push({
                        msg: `❌ تم رفض طلب التحويل تلقائياً: رصيدك غير كافٍ`,
                        type: 'error',
                        date: admin.database.ServerValue.TIMESTAMP
                    });
                    continue;
                }
                
                // إرسال تنبيه للإدمن (إذا لم يكن موجوداً بالفعل)
                const adminNotification = await db.ref('admin_notifications')
                    .orderByChild('transferId')
                    .equalTo(id)
                    .once('value');
                
                if (!adminNotification.exists()) {
                    await db.ref('admin_notifications').push({
                        type: 'bank_transfer_request',
                        userId: req.userId,
                        userName: req.userName,
                        userNumericId: req.userNumericId,
                        fullName: req.fullName,
                        accountNumber: req.accountNumber,
                        amountSDG: req.amountSDG,
                        amountSDM: req.amountSDM,
                        transferType: req.transferType,
                        transferId: id,
                        status: 'pending',
                        date: admin.database.ServerValue.TIMESTAMP
                    });
                }
            }
        }
    } catch (e) {
        console.error("Bank Transfer Error:", e.message);
    }
}
/**
 * [5] مراقب النزاعات في الدردشة
 */
const DISPUTE_KEYWORDS = ["نصاب", "حرامي", "غش", "كذاب", "بلاغ"];
function startChatMonitor() {
    db.ref('chats').on('child_added', (chatSnap) => {
        db.ref(`chats/${chatSnap.key}`).limitToLast(1).on('child_added', async (msgSnap) => {
            const msg = msgSnap.val();
            // حماية: التأكد من وجود نص الرسالة لتجنب الـ Crash
            if (!msg || !msg.text || msg.date < (Date.now() - 60000)) return;
            
            const hasBadWord = DISPUTE_KEYWORDS.some(word => msg.text.includes(word));
            if (hasBadWord) {
                await db.ref('admin_notifications').push({
                    type: 'dispute_alert',
                    chatId: chatSnap.key,
                    lastMessage: msg.text,
                    senderName: msg.senderName,
                    date: admin.database.ServerValue.TIMESTAMP
                });
            }
        });
    });
}

// ---------------------------------------------------------
// المجدولات الزمنية (Timers) لضمان استمرار العمل الآلي
// ---------------------------------------------------------

setInterval(processEscrow, 5000);    // معالجة الوسيط كل 5 ثواني
setInterval(processTransfers, 6000); // معالجة التحويلات كل 6 ثواني
setInterval(processVIP, 15000);      // فحص الـ VIP والانتهاء كل 15 ثانية
setInterval(processBankTransfers, 7000); // معالجة طلبات التحويل البنكي كل 7 ثواني
setInterval(cleanupStore, 3600000);  // تنظيف المتجر من المباع كل ساعة واحدة
startChatMonitor();                  // تشغيل مراقب الدردشة الفوري

// إعداد السيرفر الأساسي
app.get('/', (req, res) => res.send("🚀 SDM Market Security Bot is Fully Operational"));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Backend Server Live on Port ${PORT}`));
