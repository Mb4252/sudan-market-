const admin = require('firebase-admin');
const express = require('express');
const app = express();

// 1. إعداد الاتصال بقاعدة البيانات باستخدام المتغيرات البيئية
// تأكد من إضافة FIREBASE_SERVICE_ACCOUNT في إعدادات المنصة التي ترفع عليها الكود
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
});

const db = admin.database();

/**
 * دالة مساعدة لإرسال تنبيهات للمستخدمين تظهر في التطبيق فوراً
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
 * مسؤول عن حجز الأموال عند طلب الشراء وتحويلها عند التأكيد
 */
async function processEscrow() {
    try {
        const escRef = db.ref('requests/escrow_deals');

        // أ- مرحلة حجز الأموال (Securing Funds)
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
                    
                    sendAlert(deal.buyerId, `🔒 تم حجز ${amount} SDM. المبلغ في أمان الآن حتى تستلم السلعة.`);
                    sendAlert(deal.sellerId, `🔔 خبر سار! تم حجز مبلغ "${deal.itemTitle}". يمكنك تسليم السلعة للمشتري الآن.`, 'info');
                } else {
                    await escRef.child(id).update({ status: 'failed_insufficient_funds' });
                    sendAlert(deal.buyerId, `❌ فشل الشراء: رصيدك لا يكفي لإتمام العملية.`, 'error');
                }
            }
        }

        // ب- مرحلة تحويل الأموال للبائع (Release Funds)
        const pendingRelease = await escRef.orderByChild('status').equalTo('confirmed_by_buyer').once('value');
        if (pendingRelease.exists()) {
            for (const [id, deal] of Object.entries(pendingRelease.val())) {
                const amount = parseFloat(deal.amount);
                
                await db.ref(`users/${deal.sellerId}/sdmBalance`).transaction(b => Number(((b || 0) + amount).toFixed(2)));
                
                await escRef.child(id).update({ status: 'completed', completedAt: admin.database.ServerValue.TIMESTAMP });
                await db.ref(`${deal.path}/${deal.postId}`).update({ sold: true, pending: false, soldAt: admin.database.ServerValue.TIMESTAMP });

                sendAlert(deal.sellerId, `💰 مبروك! استلمت ${amount} SDM في محفظتك مقابل بيع "${deal.itemTitle}".`, 'success');
                sendAlert(deal.buyerId, `✅ تم تأكيد الاستلام بنجاح. نتمنى لك تجربة سعيدة!`, 'success');
            }
        }
    } catch (e) { console.error("Escrow Error:", e.message); }
}

/**
 * [2] محرك التحويل المباشر (Direct Transfers)
 * يحول الرصيد بين المستخدمين عبر الرقم التعريفي المكون من 6 أرقام
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
 * [3] محرك مراقبة النزاعات (المحسن والمحمي من الانهيار)
 */
/**
 * [3] محرك مراقبة النزاعات (النسخة المحسنة والمحمية من الانهيار)
 */
const DISPUTE_KEYWORDS = ["نصاب", "حرامي", "غش", "كذاب", "بلاغ", "لم يصلني", "ما استلمت", "سرقة", "يا ادمن", "يا ادمين"];
const recentlyFlagged = new Set();

function startChatMonitor() {
    console.log("🔍 مراقب النزاعات نشط...");
    
    // مراقبة مسار الدردشات
    db.ref('chats').on('child_added', (chatSnap) => {
        const chatId = chatSnap.key;
        
        // مراقبة الرسائل الجديدة فقط داخل كل دردشة
        db.ref(`chats/${chatId}`).limitToLast(1).on('child_added', async (msgSnap) => {
            const msg = msgSnap.val();
            
            // ✅ إضافة فحص الأمان: التأكد أن الرسالة نصية وليست فارغة
            if (!msg || typeof msg.text !== 'string') return; 

            // تجاهل الرسائل القديمة (أقدم من دقيقة) لتفادي التنبيهات المتراكمة عند إعادة التشغيل
            if (msg.date < (Date.now() - 60000)) return;

            const text = msg.text; // لا حاجة لـ toLowerCase مع الكلمات العربية
            const foundKeyword = DISPUTE_KEYWORDS.find(word => text.includes(word));

            // التأكد من وجود الكلمة وأن الدردشة لم يتم التبليغ عنها مؤخراً
            if (foundKeyword && !recentlyFlagged.has(chatId)) {
                console.log(`⚠️ اكتشاف كلمة محظورة: ${foundKeyword} في المحادثة: ${chatId}`);
                
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
                // منع التكرار لنفس المحادثة لمدة 5 دقائق
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
 * المجدولات الزمنية لتشغيل المهام
 */
setInterval(processEscrow, 5000);    // كل 5 ثواني
setInterval(processTransfers, 6000); // كل 6 ثواني
setInterval(processVIP, 10000);      // كل 10 ثواني
startChatMonitor();                  // يعمل باستمرار (Real-time)

// سيرفر للبقاء حياً على الاستضافات
app.get('/', (req, res) => res.send("🚀 SDM Secure Bot is Online and Guarding Transactions..."));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
