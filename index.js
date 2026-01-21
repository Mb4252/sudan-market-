const admin = require('firebase-admin');
const express = require('express');
const app = express();

// 1. إعداد الاتصال بقاعدة البيانات
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
});

const db = admin.database();

/**
 * دالة مساعدة لإرسال تنبيهات للمستخدمين
 */
function sendAlert(uid, msg, type = 'success') {
    db.ref(`alerts/${uid}`).push({
        msg: msg,
        type: type,
        date: admin.database.ServerValue.TIMESTAMP
    });
}

/**
 * [1] محرك الوسيط الآمن (Escrow System) - النسخة النهائية المتكاملة
 */
async function processEscrow() {
    try {
        const escRef = db.ref('requests/escrow_deals');

        // أ- مرحلة حجز الأموال (Securing Funds) - [تمت استعادتها]
        const pendingLock = await escRef.orderByChild('status').equalTo('pending_delivery').once('value');
        if (pendingLock.exists()) {
            for (const [id, deal] of Object.entries(pendingLock.val())) {
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
                    
                    sendAlert(deal.buyerId, `🔒 تم حجز ${amount} SDM بنجاح. المبلغ في أمان الآن.`);
                    sendAlert(deal.sellerId, `🔔 تم حجز مبلغ السلعة "${deal.itemTitle}". يمكنك التسليم للمشتري الآن.`, 'info');
                } else {
                    await escRef.child(id).update({ status: 'failed_insufficient_funds' });
                    sendAlert(deal.buyerId, `❌ رصيدك غير كافٍ لإتمام عملية الشراء.`, 'error');
                }
            }
        }

        // ب- مرحلة تحويل الأموال للبائع + نظام التقييم والتوثيق المطور
        const pendingRelease = await escRef.orderByChild('status').equalTo('confirmed_by_buyer').once('value');
        if (pendingRelease.exists()) {
            for (const [id, deal] of Object.entries(pendingRelease.val())) {
                const amount = parseFloat(deal.amount);
                const stars = parseInt(deal.reviewStars || 5);
                const comment = deal.reviewComment || "";

                // 1. تحويل المال للبائع
                await db.ref(`users/${deal.sellerId}/sdmBalance`).transaction(b => Number(((b || 0) + amount).toFixed(2)));

                // 2. تحديث ملف البائع (التقييم + عدد العمليات + التوثيق)
                await db.ref(`users/${deal.sellerId}`).transaction(user => {
                    if (user) {
                        user.reviewCount = (user.reviewCount || 0) + 1;
                        user.ratingSum = (user.ratingSum || 0) + stars;
                        user.rating = Number((user.ratingSum / user.reviewCount).toFixed(1));
                        
                        // التوثيق التلقائي عند الوصول لـ 100 تقييم
                        if (user.reviewCount >= 100) {
                            user.verified = true;
                        }
                    }
                    return user;
                });

                // 3. حفظ التعليق في سجل التعليقات ليراه الناس
                await db.ref(`reviews/${deal.sellerId}`).push({
                    buyerName: deal.buyerName || "مشتري",
                    stars: stars,
                    comment: comment,
                    date: admin.database.ServerValue.TIMESTAMP
                });

                // 4. إنهاء الطلب وتحديث حالة المنشور
                await escRef.child(id).update({ status: 'completed', completedAt: admin.database.ServerValue.TIMESTAMP });
                await db.ref(`${deal.path}/${deal.postId}`).update({ sold: true, pending: false });

                sendAlert(deal.sellerId, `💰 استلمت ${amount} SDM وتقييم جديد (${stars} نجوم)!`, 'success');
                sendAlert(deal.buyerId, `✅ تم تأكيد الاستلام، شكراً لتقييمك!`, 'success');
            }
        }

        // ج- مرحلة إلغاء الطلب (Refund)
        const pendingCancel = await escRef.orderByChild('status').equalTo('cancelled_by_buyer').once('value');
        if (pendingCancel.exists()) {
            for (const [id, deal] of Object.entries(pendingCancel.val())) {
                const amount = parseFloat(deal.amount);
                await db.ref(`users/${deal.buyerId}/sdmBalance`).transaction(b => Number(((b || 0) + amount).toFixed(2)));
                await escRef.child(id).update({ status: 'refunded', refundedAt: admin.database.ServerValue.TIMESTAMP });
                await db.ref(`${deal.path}/${deal.postId}`).update({ pending: false, buyerId: null });
                sendAlert(deal.buyerId, `💰 تم إلغاء الطلب وإرجاع ${amount} SDM لمحفظتك.`);
                sendAlert(deal.sellerId, `⚠️ قام المشتري بإلغاء طلب الشراء لـ "${deal.itemTitle}".`, 'info');
            }
        }

    } catch (e) { console.error("Escrow Error:", e.message); }
}

/**
 * [2] محرك التحويل المباشر
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
                    await transRef.child(id).update({ status: 'failed_target_not_found' });
                    sendAlert(req.from, `❌ الرقم غير موجود.`, 'error');
                    continue;
                }
                const targetUid = Object.keys(targetSnap.val())[0];
                const tx = await db.ref(`users/${req.from}`).transaction(sender => {
                    if (!sender) return sender;
                    if (parseFloat(sender.sdmBalance || 0) < amount) return undefined;
                    sender.sdmBalance = Number((sender.sdmBalance - amount).toFixed(2));
                    return sender;
                });
                if (tx.committed) {
                    await db.ref(`users/${targetUid}/sdmBalance`).transaction(b => Number(((b || 0) + amount).toFixed(2)));
                    await transRef.child(id).update({ status: 'completed', toUid: targetUid });
                    sendAlert(req.from, `✅ تم تحويل ${amount} SDM بنجاح.`);
                    sendAlert(targetUid, `💰 وصلك تحويل ${amount} SDM من ${req.fromName}.`);
                } else {
                    await transRef.child(id).update({ status: 'insufficient_funds' });
                }
            }
        }
    } catch (e) { console.error("Transfer Error:", e.message); }
}

/**
 * [3] مراقب النزاعات والـ VIP
 */
const DISPUTE_KEYWORDS = ["نصاب", "حرامي", "غش", "كذاب", "بلاغ"];
const recentlyFlagged = new Set();
function startChatMonitor() {
    db.ref('chats').on('child_added', (chatSnap) => {
        db.ref(`chats/${chatSnap.key}`).limitToLast(1).on('child_added', async (msgSnap) => {
            const msg = msgSnap.val();
            if (!msg || msg.date < (Date.now() - 60000)) return;
            const foundKeyword = DISPUTE_KEYWORDS.find(word => msg.text.includes(word));
            if (foundKeyword && !recentlyFlagged.has(chatSnap.key)) {
                await db.ref('admin_notifications').push({
                    type: 'dispute_alert',
                    chatId: chatSnap.key,
                    lastMessage: msg.text,
                    senderName: msg.senderName,
                    date: admin.database.ServerValue.TIMESTAMP
                });
                recentlyFlagged.add(chatSnap.key);
                setTimeout(() => recentlyFlagged.delete(chatSnap.key), 300000);
            }
        });
    });
}

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
                    sendAlert(req.userId, `👑 تم تفعيل VIP لمدة ${req.days} يوم.`);
                }
            }
        }
    } catch (e) {}
}

// المجدولات
setInterval(processEscrow, 5000);    
setInterval(processTransfers, 6000); 
setInterval(processVIP, 10000);      
startChatMonitor();                  

app.get('/', (req, res) => res.send("🚀 SDM Bot Online"));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Running on ${PORT}`));
