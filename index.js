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
 * يدير عمليات حجز الأموال، التأكيد، والإلغاء
 */
async function processEscrow() {
    try {
        const escRef = db.ref('requests/escrow_deals');

        // أ- حجز الأموال (Pending -> Secured)
        const pendingLock = await escRef.orderByChild('status').equalTo('pending_delivery').once('value');
        if (pendingLock.exists()) {
            for (const [id, deal] of Object.entries(pendingLock.val())) {
                if (deal.buyerId === deal.sellerId) {
                    await escRef.child(id).update({ status: 'failed_self_purchase' });
                    sendAlert(deal.buyerId, `❌ لا يمكنك الشراء من نفسك.`, 'error');
                    continue;
                }

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
                    sendAlert(deal.buyerId, `🔒 تم حجز ${amount} SDM. المبلغ الآن في أمان لدى الوسيط.`);
                    sendAlert(deal.sellerId, `🔔 قام ${deal.buyerName} بدفع مبلغ السلعة للوسيط. سلم السلعة الآن.`);
                } else {
                    await escRef.child(id).update({ status: 'failed_insufficient_funds' });
                    sendAlert(deal.buyerId, `❌ رصيدك غير كافٍ للشراء.`, 'error');
                }
            }
        }

        // ب- تحويل المال للبائع (Confirmed by Buyer -> Completed)
        const confirmedByBuyer = await escRef.orderByChild('status').equalTo('confirmed_by_buyer').once('value');
        if (confirmedByBuyer.exists()) {
            for (const [id, deal] of Object.entries(confirmedByBuyer.val())) {
                const amount = parseFloat(deal.amount);
                // تحويل المبلغ لمحفظة البائع
                await db.ref(`users/${deal.sellerId}/sdmBalance`).transaction(b => Number(((b || 0) + amount).toFixed(2)));
                
                await escRef.child(id).update({ status: 'completed', updatedAt: admin.database.ServerValue.TIMESTAMP });
                await db.ref(`${deal.path}/${deal.postId}`).update({ sold: true, pending: false, soldAt: Date.now() });
                
                sendAlert(deal.sellerId, `💰 مبروك! استلمت ${amount} SDM ثمن سلعتك "${deal.itemTitle}".`);
            }
        }

        // ج- إلغاء العملية وإرجاع المال للمشتري
        const cancelledByBuyer = await escRef.orderByChild('status').equalTo('cancelled_by_buyer').once('value');
        if (cancelledByBuyer.exists()) {
            for (const [id, deal] of Object.entries(cancelledByBuyer.val())) {
                const amount = parseFloat(deal.amount);
                await db.ref(`users/${deal.buyerId}/sdmBalance`).transaction(b => Number(((b || 0) + amount).toFixed(2)));
                
                await escRef.child(id).update({ status: 'refunded', updatedAt: admin.database.ServerValue.TIMESTAMP });
                await db.ref(`${deal.path}/${deal.postId}`).update({ pending: false, buyerId: null });
                
                sendAlert(deal.buyerId, `💰 تم إلغاء الطلب وإرجاع ${amount} SDM لمحفظتك.`);
            }
        }
    } catch (e) { console.error("Escrow Error:", e.message); }
}

/**
 * [2] محرك السحب (Withdrawal Engine) - الميزة الجديدة
 * خصم الرصيد عند الطلب وتنبيه المستخدم عند تحويل الأدمن للمال
 */
async function processWithdrawals() {
    try {
        const withRef = db.ref('requests/withdrawals');
        const snap = await withRef.orderByChild('status').once('value');

        if (snap.exists()) {
            for (const [id, req] of Object.entries(snap.val())) {
                
                // الحالة 1: الطلب جديد (Pending) -> نخصم الرصيد فوراً ونحجزه
                if (req.status === 'pending' && !req.isDeducted) {
                    const tx = await db.ref(`users/${req.userId}`).transaction(u => {
                        if (!u) return u;
                        const bal = parseFloat(u.sdmBalance || 0);
                        if (bal < req.amount) return undefined; 
                        u.sdmBalance = Number((bal - req.amount).toFixed(2));
                        return u;
                    });

                    if (tx.committed) {
                        await withRef.child(id).update({ isDeducted: true });
                        console.log(`✅ تم خصم وحجز مبلغ السحب (${req.amount}) من المستخدم ${req.userName}`);
                    } else {
                        // إذا اكتشف البوت أن الرصيد لا يكفي فعلياً في السيرفر
                        await withRef.child(id).update({ status: 'failed_no_balance' });
                        sendAlert(req.userId, `❌ فشل طلب السحب: رصيدك غير كافي.`, 'error');
                    }
                }

                // الحالة 2: الأدمن أدخل رقم العملية وضغط تأكيد (Confirmed)
                if (req.status === 'confirmed' && !req.isNotified) {
                    sendAlert(req.userId, `✅ تمت تغذية حسابك بنجاح! رقم العملية: ${req.txId}`, 'success');
                    await withRef.child(id).update({ status: 'completed', isNotified: true });
                    console.log(`📱 تم إرسال إشعار اكتمال السحب للمستخدم ${req.userName}`);
                }
            }
        }
    } catch (e) { console.error("Withdrawal Error:", e.message); }
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
                    sendAlert(req.from, `❌ لم نجد حساب بالرقم ${req.toId}`, 'error');
                    continue;
                }

                const targetUid = Object.keys(targetSnap.val())[0];
                if (req.from === targetUid) {
                    await db.ref(`requests/transfers/${id}`).update({ status: 'failed_self_transfer' });
                    continue;
                }

                const tx = await db.ref(`users/${req.from}`).transaction(u => {
                    if (!u || (u.sdmBalance || 0) < amount) return undefined;
                    u.sdmBalance = Number((u.sdmBalance - amount).toFixed(2));
                    return u;
                });

                if (tx.committed) {
                    await db.ref(`users/${targetUid}/sdmBalance`).transaction(b => Number(((b || 0) + amount).toFixed(2)));
                    await db.ref(`requests/transfers/${id}`).update({ status: 'completed' });
                    sendAlert(req.from, `✅ تم تحويل ${amount} SDM.`);
                    sendAlert(targetUid, `💰 استلمت ${amount} SDM من ${req.fromName}.`);
                } else {
                    await db.ref(`requests/transfers/${id}`).update({ status: 'failed_balance' });
                    sendAlert(req.from, `❌ فشل التحويل: رصيدك غير كافٍ.`, 'error');
                }
            }
        }
    } catch (e) { console.error("Transfer Error:", e.message); }
}

/**
 * [4] محرك الـ VIP
 */
async function processVIP() {
    try {
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
                    sendAlert(req.userId, `👑 مبروك! تم تفعيل VIP لمدة ${req.days} يوم.`);
                }
            }
        }

        const now = Date.now();
        const activeVips = await db.ref('users').orderByChild('vipStatus').equalTo('active').once('value');
        if (activeVips.exists()) {
            activeVips.forEach(child => {
                const user = child.val();
                if (user.vipExpiry && now > user.vipExpiry) {
                    child.ref.update({ vipStatus: 'expired' });
                    sendAlert(child.key, "⚠️ انتهى اشتراك VIP الخاص بك.", "info");
                }
            });
        }
    } catch (e) {}
}

/**
 * [5] وظيفة تنظيف المتجر (حذف المباع بعد 24 ساعة)
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
                    if (post.soldAt && (now - post.soldAt) > oneDay) child.ref.remove();
                });
            }
        }
    } catch (e) {}
}

/**
 * [6] مراقب النزاعات
 */
const DISPUTE_KEYWORDS = ["نصاب", "حرامي", "غش", "كذاب", "بلاغ"];
function startChatMonitor() {
    db.ref('chats').on('child_added', (chatSnap) => {
        db.ref(`chats/${chatSnap.key}`).limitToLast(1).on('child_added', async (msgSnap) => {
            const msg = msgSnap.val();
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
// المجدولات الزمنية (Timers)
// ---------------------------------------------------------

setInterval(processEscrow, 5000);     // الوسيط كل 5 ثواني
setInterval(processTransfers, 6000);  // التحويلات كل 6 ثواني
setInterval(processWithdrawals, 8000); // السحب كل 8 ثواني (جديد)
setInterval(processVIP, 20000);       // VIP كل 20 ثانية
setInterval(cleanupStore, 3600000);   // التنظيف كل ساعة
startChatMonitor();                   // مراقب الدردشة

app.get('/', (req, res) => res.send("🚀 SDM Security Bot - ONLINE"));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server Live on ${PORT}`));
