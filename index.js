const admin = require('firebase-admin');
const express = require('express');
const app = express();

// 1. إعداد الاتصال بقاعدة البيانات
// ملاحظة: تأكد من وضع ملف الخدمة في نفس المجلد أو ضبط المتغير البيئي
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); 

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
});

const db = admin.database();

/**
 * وظيفة إرسال التنبيهات للمستخدمين (تظهر فوراً في التطبيق)
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
 * يراقب عمليات الشراء، يحجز المال، ويحوله عند التأكيد
 */
async function processEscrow() {
    try {
        const escRef = db.ref('requests/escrow_deals');

        // أ- حجز الأموال (عندما يضغط المشتري "شراء عبر الوسيط")
        const pendingLock = await escRef.orderByChild('status').equalTo('pending_delivery').once('value');
        if (pendingLock.exists()) {
            for (const [id, deal] of Object.entries(pendingLock.val())) {
                const amount = parseFloat(deal.amount);
                
                // عملية ذرية (Atomic Transaction) لخصم الرصيد
                const lockTx = await db.ref(`users/${deal.buyerId}`).transaction(user => {
                    if (!user) return user;
                    const bal = parseFloat(user.sdmBalance || 0);
                    if (bal < amount) return undefined; // رصيد غير كافٍ
                    user.sdmBalance = Number((bal - amount).toFixed(2));
                    return user;
                });

                if (lockTx.committed) {
                    await escRef.child(id).update({ 
                        status: 'secured', 
                        updatedAt: admin.database.ServerValue.TIMESTAMP 
                    });
                    // تحديث حالة المنشور في الأقسام
                    await db.ref(`${deal.path}/${deal.postId}`).update({ 
                        pending: true, 
                        buyerId: deal.buyerId 
                    });
                    
                    sendAlert(deal.buyerId, `🔒 تم حجز ${amount} SDM بنجاح. المال الآن في عهدة الوسيط.`);
                    sendAlert(deal.sellerId, `🔔 طلب شراء لـ "${deal.itemTitle}". المبلغ محجوز لدى النظام، يمكنك التسليم الآن.`, 'info');
                    console.log(`[Escrow] Funds locked for deal: ${id}`);
                } else {
                    await escRef.child(id).update({ status: 'failed_insufficient_funds' });
                    sendAlert(deal.buyerId, `❌ فشل الشراء: رصيدك الحالي لا يكفي.`, 'error');
                }
            }
        }

        // ب- تحويل الأموال للبائع (عندما يضغط المشتري "تأكيد الاستلام")
        const pendingRelease = await escRef.orderByChild('status').equalTo('confirmed_by_buyer').once('value');
        if (pendingRelease.exists()) {
            for (const [id, deal] of Object.entries(pendingRelease.val())) {
                const amount = parseFloat(deal.amount);
                
                // إضافة المال للبائع
                await db.ref(`users/${deal.sellerId}/sdmBalance`).transaction(b => Number(((b || 0) + amount).toFixed(2)));
                
                // إنهاء الصفقة
                await escRef.child(id).update({ 
                    status: 'completed', 
                    completedAt: admin.database.ServerValue.TIMESTAMP 
                });
                // وسم المنتج كمباع نهائياً
                await db.ref(`${deal.path}/${deal.postId}`).update({ 
                    sold: true, 
                    pending: false,
                    soldAt: admin.database.ServerValue.TIMESTAMP
                });

                sendAlert(deal.sellerId, `💰 تم تحويل ${amount} SDM لرصيدك مقابل بيع "${deal.itemTitle}".`, 'success');
                sendAlert(deal.buyerId, `✅ تم إكمال الصفقة بنجاح. شكراً لاستخدامك الوسيط الآمن.`, 'success');
                console.log(`[Escrow] Deal completed: ${id}`);
            }
        }
    } catch (e) { console.error("Escrow Error:", e.message); }
}

/**
 * [2] محرك التحويل المباشر (Direct Transfers)
 */
async function processTransfers() {
    try {
        const transRef = db.ref('requests/transfers');
        const snap = await transRef.orderByChild('status').equalTo('pending').once('value');

        if (snap.exists()) {
            for (const [id, req] of Object.entries(snap.val())) {
                const amount = parseFloat(req.amount);
                
                // البحث عن المستلم بالرقم التعريفي (numericId)
                const targetSnap = await db.ref('users').orderByChild('numericId').equalTo(req.toId).once('value');
                
                if (!targetSnap.exists()) {
                    await transRef.child(id).update({ status: 'failed_target_not_found' });
                    sendAlert(req.from, `❌ الرقم التعريفي (${req.toId}) غير موجود.`, 'error');
                    continue;
                }

                const targetUid = Object.keys(targetSnap.val())[0];
                if (targetUid === req.from) {
                    await transRef.child(id).update({ status: 'failed_self_transfer' });
                    sendAlert(req.from, `❌ لا يمكنك التحويل لنفسك!`, 'error');
                    continue;
                }

                // تنفيذ عملية التحويل
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
                    
                    sendAlert(req.from, `✅ تم تحويل ${amount} SDM للمستخدم ${req.toId}.`, 'success');
                    sendAlert(targetUid, `💰 استلمت تحويل بقيمة ${amount} SDM من ${req.fromName}.`, 'success');
                    console.log(`[Transfer] ${amount} SDM from ${req.from} to ${targetUid}`);
                } else {
                    await transRef.child(id).update({ status: 'insufficient_funds' });
                    sendAlert(req.from, `❌ فشل التحويل: رصيدك غير كافٍ.`, 'error');
                }
            }
        }
    } catch (e) { console.error("Transfer Error:", e.message); }
}

/**
 * [3] محرك الـ VIP
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
                    sendAlert(req.userId, `👑 مبروك! تم تفعيل اشتراك VIP لمدة ${req.days} يوم.`, 'success');
                } else {
                    await vipRef.child(id).update({ status: 'failed_balance' });
                }
            }
        }
    } catch (e) { console.error("VIP Error:", e.message); }
}

/**
 * [4] فحص انتهاء الصلاحية للـ VIP
 */
async function checkExpiredVIPs() {
    const now = Date.now();
    const usersSnap = await db.ref('users').orderByChild('vipStatus').equalTo('active').once('value');
    if (usersSnap.exists()) {
        for (const [uid, user] of Object.entries(usersSnap.val())) {
            if (user.vipExpiry && now > user.vipExpiry) {
                await db.ref(`users/${uid}`).update({ vipStatus: 'expired' });
                sendAlert(uid, `⚠️ انتهى اشتراك VIP الخاص بك. جدد الآن للاحتفاظ بالمزايا.`, 'info');
            }
        }
    }
}

/**
 * المجدولات الزمنية (Intervals)
 */
setInterval(processEscrow, 5000);    // فحص الوسيط كل 5 ثواني
setInterval(processTransfers, 6000); // فحص التحويلات كل 6 ثواني
setInterval(processVIP, 10000);      // فحص طلبات VIP كل 10 ثواني
setInterval(checkExpiredVIPs, 3600000); // فحص انتهاء الـ VIP كل ساعة

// تشغيل سيرفر بسيط للبقاء حياً (لمنصات مثل Render)
app.get('/', (res, req) => { req.send("SDM Secure Bot Active..."); });
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 SDM BOT IS RUNNING ON PORT ${PORT}`));
