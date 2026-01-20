const admin = require('firebase-admin');
const express = require('express');
const app = express();

// --- 1. إعداد Firebase ---
// ملاحظة: تأكد من وضع محتويات ملف الـ JSON الخاص بـ Firebase في متغير بيئة باسم FIREBASE_SERVICE_ACCOUNT
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com" // رابط قاعدة بياناتك
    });
    console.log("🚀 SDM Secure Bot Started | المحرك يعمل بنجاح");
} catch (error) {
    console.error("❌ خطأ في إعداد Firebase:", error.message);
    process.exit(1);
}

const db = admin.database();

// دالة مساعدة لإرسال تنبيهات للمستخدمين في التطبيق
function sendAlert(uid, msg, type = 'success') {
    db.ref(`alerts/${uid}`).push({
        msg: msg,
        type: type,
        date: admin.database.ServerValue.TIMESTAMP
    });
}

/**
 * محرك نظام الوسيط (Escrow Engine)
 * يراقب طلبات الشراء ويغير حالات المنشورات
 */
async function processEscrow() {
    try {
        const escRef = db.ref('requests/escrow_deals');

        // [أ] المرحلة الأولى: حجز المبلغ وتحويل المنشور إلى "قيد الشراء"
        const pendingLock = await escRef.orderByChild('status').equalTo('pending_delivery').once('value');
        
        if (pendingLock.exists()) {
            for (const [id, deal] of Object.entries(pendingLock.val())) {
                const amount = parseFloat(deal.amount);
                const buyerRef = db.ref(`users/${deal.buyerId}/sdmBalance`);

                // عملية خصم الرصيد من المشتري (Transaction لضمان الأمان)
                const lockTx = await buyerRef.transaction(currentBal => {
                    if (currentBal === null) return currentBal;
                    if (currentBal < amount) return undefined; // إلغاء إذا الرصيد غير كافٍ
                    return parseFloat((currentBal - amount).toFixed(2));
                });

                if (lockTx.committed) {
                    // 1. تحديث حالة الصفقة إلى "محجوزة" (Secured)
                    await escRef.child(id).update({ status: 'secured' });

                    // 2. تحديث المنشور في السوق: قيد الشراء = true
                    await db.ref(`${deal.path}/${deal.postId}`).update({ 
                        pending: true,
                        buyerId: deal.buyerId 
                    });

                    // 3. إرسال تنبيهات
                    sendAlert(deal.buyerId, `🔒 تم حجز ${amount} SDM بنجاح. المنشور الآن "قيد الشراء" حتى تستلم.`, 'info');
                    sendAlert(deal.sellerId, `🔔 خبر سار! قام شخص بشراء "${deal.itemTitle}". المال محجوز الآن، يرجى تسليم السلعة.`, 'success');
                    
                    console.log(`🔒 تم حجز المبلغ للمنشور: ${deal.postId}`);
                } else {
                    // فشل بسبب نقص الرصيد
                    await escRef.child(id).update({ status: 'failed_insufficient_funds' });
                    sendAlert(deal.buyerId, `❌ فشل الشراء: رصيدك الحالي غير كافٍ لحجز السلعة.`, 'error');
                }
            }
        }

        // [ب] المرحلة الثانية: تأكيد الاستلام وتحويل المال للبائع وتحويل المنشور إلى "تم البيع"
        const pendingRelease = await escRef.orderByChild('status').equalTo('confirmed_by_buyer').once('value');
        
        if (pendingRelease.exists()) {
            for (const [id, deal] of Object.entries(pendingRelease.val())) {
                const amount = parseFloat(deal.amount);
                const sellerRef = db.ref(`users/${deal.sellerId}/sdmBalance`);

                // إضافة المبلغ لمحفظة البائع
                await sellerRef.transaction(bal => {
                    return parseFloat(((bal || 0) + amount).toFixed(2));
                });

                // 1. إغلاق الصفقة نهائياً
                await escRef.child(id).update({ 
                    status: 'completed', 
                    completedAt: admin.database.ServerValue.TIMESTAMP 
                });

                // 2. تحديث المنشور: تم البيع = true | قيد الشراء = false
                await db.ref(`${deal.path}/${deal.postId}`).update({ 
                    sold: true, 
                    pending: false,
                    soldDate: admin.database.ServerValue.TIMESTAMP 
                });

                // 3. تسجيل المعاملة في السجل العام
                await db.ref('transactions').push({
                    type: 'escrow_payout',
                    from: deal.buyerId,
                    to: deal.sellerId,
                    amount: amount,
                    item: deal.itemTitle,
                    date: admin.database.ServerValue.TIMESTAMP
                });

                // 4. إرسال تنبيهات النجاح
                sendAlert(deal.sellerId, `💰 مبروك! استلمت ${amount} SDM في رصيدك مقابل بيع: ${deal.itemTitle}`, 'success');
                sendAlert(deal.buyerId, `✅ تم تأكيد الاستلام بنجاح. المنشور الآن يظهر كـ "تم البيع". شكراً لاستخدامك الوسيط.`, 'success');
                
                console.log(`✅ تمت عملية البيع بنجاح للمنشور: ${deal.postId}`);
            }
        }

    } catch (err) {
        console.error("❌ خطأ في محرك الوسيط:", err.message);
    }
}

/**
 * معالجة اشتراكات VIP
 */
async function processVIP() {
    try {
        const vipSnap = await db.ref('requests/vip_subscriptions').orderByChild('status').equalTo('pending').once('value');
        if (vipSnap.exists()) {
            for (const [id, req] of Object.entries(vipSnap.val())) {
                const userRef = db.ref(`users/${req.userId}`);
                const cost = parseFloat(req.cost);

                const tx = await userRef.transaction(u => {
                    if (u === null) return u;
                    if ((u.sdmBalance || 0) >= cost) {
                        const now = Date.now();
                        u.sdmBalance = parseFloat((u.sdmBalance - cost).toFixed(2));
                        u.vipStatus = 'active';
                        u.vipExpiry = ((u.vipExpiry > now) ? u.vipExpiry : now) + (req.days * 86400000);
                        return u;
                    }
                    return undefined;
                });

                if (tx.committed) {
                    await db.ref(`requests/vip_subscriptions/${id}`).update({ status: 'completed' });
                    sendAlert(req.userId, `👑 تم تفعيل اشتراك VIP بنجاح لمدة ${req.days} يوم.`, 'success');
                } else {
                    await db.ref(`requests/vip_subscriptions/${id}`).update({ status: 'failed' });
                    sendAlert(req.userId, `❌ فشل تفعيل VIP: رصيدك غير كافٍ.`, 'error');
                }
            }
        }
    } catch (e) { console.error("VIP Error:", e.message); }
}

// --- المجدول الزمني (التشغيل التلقائي) ---
// تشغيل محرك الوسيط كل 5 ثوانٍ
setInterval(processEscrow, 5000);
// تشغيل محرك الـ VIP كل 10 ثوانٍ
setInterval(processVIP, 10000);

// سيرفر بسيط لإبقاء الخدمة حية (للمنصات مثل Render)
app.get('/', (req, res) => res.send('SDM Secure Bot is Online 🚀'));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
