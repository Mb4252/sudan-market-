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
 * [1] محرك الوسيط الآمن (Escrow System) - المحدث
 */
async function processEscrow() {
    try {
        const escRef = db.ref('requests/escrow_deals');

        // أ- مرحلة حجز الأموال (Securing Funds)
        
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
                
                // شرط التوثيق التلقائي عند الوصول لـ 100 تقييم
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

        // 4. إنهاء الطلب
        await escRef.child(id).update({ status: 'completed', completedAt: admin.database.ServerValue.TIMESTAMP });
        await db.ref(`${deal.path}/${deal.postId}`).update({ sold: true, pending: false });

        sendAlert(deal.sellerId, `💰 استلمت ${amount} SDM وتقييم جديد (${stars} نجوم)!`);
    }
}
        // ج- مرحلة إلغاء الطلب وإرجاع المال للمشتري (Refund Funds) 🌟 [إضافة جديدة]
        const pendingCancel = await escRef.orderByChild('status').equalTo('cancelled_by_buyer').once('value');
        if (pendingCancel.exists()) {
            for (const [id, deal] of Object.entries(pendingCancel.val())) {
                const amount = parseFloat(deal.amount);

                // 1. إرجاع المال لمحفظة المشتري
                await db.ref(`users/${deal.buyerId}/sdmBalance`).transaction(b => Number(((b || 0) + amount).toFixed(2)));

                // 2. تحديث حالة الصفقة إلى "تم الإرجاع"
                await escRef.child(id).update({ status: 'refunded', refundedAt: admin.database.ServerValue.TIMESTAMP });

                // 3. فك حجز المنشور ليعود متاحاً للبيع مرة أخرى
                await db.ref(`${deal.path}/${deal.postId}`).update({
                    pending: false,
                    buyerId: null // إزالة معرف المشتري ليعود المنشور عاماً
                });

                // 4. إرسال التنبيهات
                sendAlert(deal.buyerId, `💰 تم إلغاء الطلب وإرجاع ${amount} SDM إلى محفظتك بنجاح.`);
                sendAlert(deal.sellerId, `⚠️ نأسف، قام المشتري بإلغاء طلب شراء "${deal.itemTitle}". المنشور عاد متاحاً للآخرين الآن.`, 'info');
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
                    sendAlert(req.from, `❌ الرقم (${req.toId}) غير صحيح.`, 'error');
                    continue;
                }

                const targetUid = Object.keys(targetSnap.val())[0];
                const tx = await db.ref(`users/${req.from}`).transaction(sender => {
                    if (!sender) return sender;
                    const bal = parseFloat(sender.sdmBalance || 0);
                    if (bal < amount) return undefined;
                    sender.sdmBalance = Number((bal - amount).toFixed(2));
                    return sender;
                });

                if (tx.committed) {
                    await db.ref(`users/${targetUid}/sdmBalance`).transaction(b => Number(((b || 0) + amount).toFixed(2)));
                    await transRef.child(id).update({ status: 'completed', toUid: targetUid });
                    sendAlert(req.from, `✅ تم تحويل ${amount} SDM بنجاح.`, 'success');
                    sendAlert(targetUid, `💰 وصلك تحويل بقيمة ${amount} SDM من ${req.fromName}.`, 'success');
                } else {
                    await transRef.child(id).update({ status: 'insufficient_funds' });
                    sendAlert(req.from, `❌ رصيدك لا يكفي لهذا التحويل.`, 'error');
                }
            }
        }
    } catch (e) { console.error("Transfer Error:", e.message); }
}

/**
 * [3] محرك مراقبة النزاعات
 */
const DISPUTE_KEYWORDS = ["نصاب", "حرامي", "غش", "كذاب", "بلاغ", "لم يصلني", "ما استلمت", "سرقة", "يا ادمن", "يا ادمين"];
const recentlyFlagged = new Set();

function startChatMonitor() {
    console.log("🔍 مراقب النزاعات نشط...");
    db.ref('chats').on('child_added', (chatSnap) => {
        const chatId = chatSnap.key;
        db.ref(`chats/${chatId}`).limitToLast(1).on('child_added', async (msgSnap) => {
            const msg = msgSnap.val();
            if (!msg || typeof msg.text !== 'string') return; 
            if (msg.date < (Date.now() - 60000)) return;

            const text = msg.text; 
            const foundKeyword = DISPUTE_KEYWORDS.find(word => text.includes(word));

            if (foundKeyword && !recentlyFlagged.has(chatId)) {
                await db.ref('admin_notifications').push({
                    type: 'dispute_alert',
                    chatId: chatId,
                    keyword: foundKeyword,
                    lastMessage: msg.text,
                    senderName: msg.senderName,
                    date: admin.database.ServerValue.TIMESTAMP,
                    read: false
                });
                recentlyFlagged.add(chatId);
                setTimeout(() => recentlyFlagged.delete(chatId), 300000);
            }
        });
    });
}

/**
 * [4] محرك الـ VIP
 */
async function processVIP() {
    try {
        const vipRef = db.ref('requests/vip_subscriptions');
        const snap = await vipRef.orderByChild('status').equalTo('pending').once('value');

        if (snap.exists()) {
            for (const [id, req] of Object.entries(snap.val())) {
                const cost = parseFloat(req.cost);
                const tx = await db.ref(`users/${req.userId}`).transaction(u => {
                    if (!u) return u;
                    if (parseFloat(u.sdmBalance || 0) < cost) return undefined;
                    const now = Date.now();
                    u.sdmBalance = Number((u.sdmBalance - cost).toFixed(2));
                    u.vipStatus = 'active';
                    u.vipExpiry = ((u.vipExpiry > now) ? u.vipExpiry : now) + (req.days * 86400000);
                    return u;
                });

                if (tx.committed) {
                    await vipRef.child(id).update({ status: 'completed' });
                    sendAlert(req.userId, `👑 مبروك! تم تفعيل VIP لمدة ${req.days} يوم.`, 'success');
                } else {
                    await vipRef.child(id).update({ status: 'failed_balance' });
                    sendAlert(req.userId, `❌ فشل تفعيل VIP: الرصيد غير كافٍ.`, 'error');
                }
            }
        }
    } catch (e) { console.error("VIP Error:", e.message); }
}

/**
 * المجدولات الزمنية
 */
setInterval(processEscrow, 5000);    
setInterval(processTransfers, 6000); 
setInterval(processVIP, 10000);      
startChatMonitor();                  

app.get('/', (req, res) => res.send("🚀 SDM Secure Bot is Online..."));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
