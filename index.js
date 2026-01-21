const admin = require('firebase-admin');
const express = require('express');
const app = express();

/**
 * 1. تهيئة النظام
 */
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.error("❌ خطأ: لم يتم ضبط متغير FIREBASE_SERVICE_ACCOUNT");
    process.exit(1);
}

try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
        });
    }
    console.log("🚀 SDM BOT: المحرك المطور يعمل الآن...");
} catch (error) {
    console.error("❌ خطأ في التهيئة:", error.message);
    process.exit(1);
}

const db = admin.database();

/**
 * دالة التنبيهات
 */
function sendAlert(uid, msg, type = 'success') {
    if (!uid) return;
    db.ref(`alerts/${uid}`).push({
        msg: msg,
        type: type,
        date: admin.database.ServerValue.TIMESTAMP
    });
}

/**
 * [1] محرك الوسيط (Escrow)
 */
async function processEscrow() {
    try {
        const escRef = db.ref('requests/escrow_deals');

        // حجز المبلغ
        const pendingLock = await escRef.orderByChild('status').equalTo('pending_delivery').once('value');
        if (pendingLock.exists()) {
            for (const [id, deal] of Object.entries(pendingLock.val())) {
                const amount = parseFloat(deal.amount);
                const lockTx = await db.ref(`users/${deal.buyerId}`).transaction(userData => {
                    if (!userData) return userData;
                    const balance = parseFloat(userData.sdmBalance || 0);
                    if (balance < amount) return undefined; 
                    userData.sdmBalance = Number((balance - amount).toFixed(2));
                    return userData;
                });

                if (lockTx.committed) {
                    await escRef.child(id).update({ status: 'secured', updatedAt: admin.database.ServerValue.TIMESTAMP });
                    if (deal.path && deal.postId) {
                        await db.ref(`${deal.path}/${deal.postId}`).update({ pending: true, buyerId: deal.buyerId });
                    }
                    sendAlert(deal.buyerId, `🔒 تم حجز ${amount} SDM للوسيط.`, 'info');
                    sendAlert(deal.sellerId, `🔔 طلب شراء لـ "${deal.itemTitle}". المبلغ محجوز، سلم السلعة الآن.`, 'success');
                } else {
                    await escRef.child(id).update({ status: 'failed_insufficient_funds' });
                    sendAlert(deal.buyerId, `❌ فشل الحجز: رصيدك أقل من ${amount} SDM`, 'error');
                }
            }
        }

        // تحرير المبلغ
        const pendingRelease = await escRef.orderByChild('status').equalTo('confirmed_by_buyer').once('value');
        if (pendingRelease.exists()) {
            for (const [id, deal] of Object.entries(pendingRelease.val())) {
                const amount = parseFloat(deal.amount);
                await db.ref(`users/${deal.sellerId}/sdmBalance`).transaction(curr => Number(((curr || 0) + amount).toFixed(2)));
                
                await escRef.child(id).update({ status: 'completed', completedAt: admin.database.ServerValue.TIMESTAMP });

                if (deal.path && deal.postId) {
                    await db.ref(`${deal.path}/${deal.postId}`).update({ 
                        sold: true, 
                        pending: false,
                        soldAtTimestamp: Date.now() // تاريخ البيع للمسح التلقائي لاحقاً
                    });
                }

                sendAlert(deal.sellerId, `💰 استلمت ${amount} SDM مقابل بيع: ${deal.itemTitle}`, 'success');
                sendAlert(deal.buyerId, `✅ تم تحويل المال للبائع بنجاح.`, 'success');
            }
        }
    } catch (err) { console.error("Escrow Error:", err.message); }
}

/**
 * [2] محرك التحويل (Transfer) - ميزة إظهار اسم المرسل والكمية
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
                    continue;
                }

                const targetUid = Object.keys(targetSnap.val())[0];
                const senderName = req.fromName || "مستخدم";

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
                    
                    sendAlert(req.from, `✅ تم تحويل ${amount} SDM إلى ${req.toId}`, 'success');
                    // ميزة إظهار اسم المرسل والكمية للمستلم
                    sendAlert(targetUid, `💰 استلمت مبلغ ${amount} SDM من المرسل: ${senderName}`, 'success');
                } else {
                    await transRef.child(id).update({ status: 'insufficient_funds' });
                }
            }
        }
    } catch (e) { console.error("Transfer Error:", e.message); }
}

/**
 * [3] محرك VIP - تفعيل + إلغاء تلقائي بعد الانتهاء
 */
async function processVIP() {
    try {
        // تفعيل الاشتراكات الجديدة
        const vipSnap = await db.ref('requests/vip_subscriptions').orderByChild('status').equalTo('pending').once('value');
        if (vipSnap.exists()) {
            for (const [id, req] of Object.entries(vipSnap.val())) {
                const cost = parseFloat(req.cost);
                const tx = await db.ref(`users/${req.userId}`).transaction(u => {
                    if (!u) return u;
                    if (parseFloat(u.sdmBalance || 0) >= cost) {
                        const now = Date.now();
                        u.sdmBalance = Number((u.sdmBalance - cost).toFixed(2));
                        u.vipStatus = 'active';
                        u.vipExpiry = ((u.vipExpiry > now) ? u.vipExpiry : now) + (req.days * 86400000);
                        return u;
                    }
                    return undefined;
                });
                if (tx.committed) {
                    await db.ref(`requests/vip_subscriptions/${id}`).update({ status: 'completed' });
                    sendAlert(req.userId, `👑 تم تفعيل VIP لمدة ${req.days} يوم.`, 'success');
                } else {
                    await db.ref(`requests/vip_subscriptions/${id}`).update({ status: 'failed' });
                }
            }
        }

        // ميزة إلغاء الاشتراك التلقائي بعد الانتهاء
        const now = Date.now();
        const activeVIPs = await db.ref('users').orderByChild('vipStatus').equalTo('active').once('value');
        if (activeVIPs.exists()) {
            for (const [uid, user] of Object.entries(activeVIPs.val())) {
                if (user.vipExpiry && now > user.vipExpiry) {
                    await db.ref(`users/${uid}`).update({ vipStatus: 'expired' });
                    sendAlert(uid, `⚠️ انتهى اشتراك VIP الخاص بك. يمكنك التجديد الآن.`, 'info');
                    console.log(`🚫 تم إنهاء اشتراك VIP للمستخدم: ${uid}`);
                }
            }
        }
    } catch (e) { console.error("VIP Error:", e.message); }
}

/**
 * [4] محرك مسح المنشورات المباعة بعد يوم (24 ساعة)
 */
async function cleanupSoldPosts() {
    try {
        const categories = ['cars_posts', 'phones_posts', 'realestate_posts', 'electronics_posts', 'others_posts'];
        const oneDayMs = 24 * 60 * 60 * 1000;
        const now = Date.now();

        for (const cat of categories) {
            const soldPosts = await db.ref(cat).orderByChild('sold').equalTo(true).once('value');
            if (soldPosts.exists()) {
                for (const [postId, post] of Object.entries(soldPosts.val())) {
                    if (post.soldAtTimestamp && (now - post.soldAtTimestamp) > oneDayMs) {
                        await db.ref(`${cat}/${postId}`).remove();
                        console.log(`🗑️ تم مسح المنشور المبيع: ${postId} من قسم ${cat}`);
                    }
                }
            }
        }
    } catch (e) { console.error("Cleanup Error:", e.message); }
}

/**
 * المجدولات الزمنية
 */
setInterval(processEscrow, 10000);   
setInterval(processTransfers, 12000); 
setInterval(processVIP, 60000);       // فحص الـ VIP كل دقيقة
setInterval(cleanupSoldPosts, 3600000); // فحص المنشورات الممسوحة كل ساعة

app.get('/', (req, res) => res.send('SDM Secure Bot is Online...'));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Server on port: ${PORT}`));
