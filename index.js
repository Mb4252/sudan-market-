const admin = require('firebase-admin');
const express = require('express');
const app = express();

// إعداد الاتصال بقاعدة البيانات
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
});

const db = admin.database();

// ====================================================
// نظام Rate Limiting في البوت
// ====================================================
const requestLimits = new Map();

function checkRateLimit(uid) {
    const now = Date.now();
    const userLimit = requestLimits.get(uid);
    
    if (!userLimit) {
        requestLimits.set(uid, { count: 1, timestamp: now });
        return true;
    }
    
    if (now - userLimit.timestamp > 60000) {
        userLimit.count = 1;
        userLimit.timestamp = now;
        return true;
    }
    
    if (userLimit.count >= 20) {
        return false;
    }
    
    userLimit.count++;
    return true;
}

// تنظيف ذاكرة Rate Limit كل ساعة
setInterval(() => {
    const now = Date.now();
    for (const [uid, limit] of requestLimits.entries()) {
        if (now - limit.timestamp > 3600000) {
            requestLimits.delete(uid);
        }
    }
}, 3600000);

// ====================================================
// دوال البوت لمعالجة الرصيد (Admin SDK فقط)
// ====================================================

// 1. دالة زيادة الرصيد
async function addBalance(uid, amount) {
    try {
        const userRef = db.ref(`users/${uid}`);
        const snapshot = await userRef.once('value');
        const user = snapshot.val();
        
        if (!user) {
            console.error(`❌ المستخدم ${uid} غير موجود`);
            return false;
        }
        
        const currentBalance = user.sdmBalance || 0;
        const newBalance = currentBalance + amount;
        
        await userRef.update({ 
            sdmBalance: newBalance,
            lastBalanceUpdate: Date.now()
        });
        
        console.log(`✅ تم إضافة ${amount} SDM للمستخدم ${uid}. الرصيد الجديد: ${newBalance}`);
        return true;
    } catch (error) {
        console.error(`❌ فشل إضافة الرصيد:`, error);
        return false;
    }
}

// 2. دالة خصم الرصيد
async function deductBalance(uid, amount) {
    try {
        const userRef = db.ref(`users/${uid}`);
        const snapshot = await userRef.once('value');
        const user = snapshot.val();
        
        if (!user) {
            console.error(`❌ المستخدم ${uid} غير موجود`);
            return false;
        }
        
        const currentBalance = user.sdmBalance || 0;
        
        if (currentBalance < amount) {
            console.error(`❌ الرصيد غير كافٍ: ${currentBalance} < ${amount}`);
            return false;
        }
        
        const newBalance = currentBalance - amount;
        
        await userRef.update({ 
            sdmBalance: newBalance,
            lastBalanceUpdate: Date.now()
        });
        
        console.log(`✅ تم خصم ${amount} SDM من المستخدم ${uid}. الرصيد الجديد: ${newBalance}`);
        return true;
    } catch (error) {
        console.error(`❌ فشل خصم الرصيد:`, error);
        return false;
    }
}

// 3. دالة التحويل بين المستخدمين
async function transferBalance(fromUid, toUid, amount) {
    try {
        const fromRef = db.ref(`users/${fromUid}`);
        const fromSnap = await fromRef.once('value');
        const fromUser = fromSnap.val();
        
        if (!fromUser) {
            console.error(`❌ المرسل ${fromUid} غير موجود`);
            return false;
        }
        
        if ((fromUser.sdmBalance || 0) < amount) {
            console.error(`❌ رصيد المرسل غير كافٍ: ${fromUser.sdmBalance} < ${amount}`);
            return false;
        }
        
        const toRef = db.ref(`users/${toUid}`);
        const toSnap = await toRef.once('value');
        const toUser = toSnap.val();
        
        if (!toUser) {
            console.error(`❌ المستقبل ${toUid} غير موجود`);
            return false;
        }
        
        await fromRef.update({ 
            sdmBalance: (fromUser.sdmBalance || 0) - amount
        });
        
        await toRef.update({ 
            sdmBalance: (toUser.sdmBalance || 0) + amount
        });
        
        console.log(`✅ تم التحويل: ${amount} SDM من ${fromUid} إلى ${toUid}`);
        return true;
    } catch (error) {
        console.error(`❌ فشل التحويل:`, error);
        return false;
    }
}

// ====================================================
// دالة إرسال التنبيهات
// ====================================================
function sendAlert(uid, msg, type = 'success') {
    db.ref(`alerts/${uid}`).push({
        msg: msg,
        type: type,
        date: admin.database.ServerValue.TIMESTAMP
    });
}

// ====================================================
// [1] محرك الوسيط الآمن (Escrow System)
// ====================================================
async function processEscrow() {
    try {
        const escRef = db.ref('requests/escrow_deals');
        const pendingLock = await escRef.orderByChild('status').equalTo('pending_delivery').once('value');
        
        if (pendingLock.exists()) {
            for (const [id, deal] of Object.entries(pendingLock.val())) {
                
                // التحقق من Rate Limit
                if (!checkRateLimit(deal.buyerId)) {
                    await escRef.child(id).update({ 
                        status: 'rate_limited',
                        updatedAt: admin.database.ServerValue.TIMESTAMP 
                    });
                    sendAlert(deal.buyerId, `⏳ تم إيقاف الطلب مؤقتاً بسبب كثرة المحاولات`, 'warning');
                    continue;
                }
                
                // منع الشراء من النفس
                if (deal.buyerId === deal.sellerId) {
                    await escRef.child(id).update({ 
                        status: 'failed_self_purchase',
                        updatedAt: admin.database.ServerValue.TIMESTAMP 
                    });
                    sendAlert(deal.buyerId, `❌ لا يمكنك الشراء من نفسك`, 'error');
                    continue;
                }

                const amount = parseFloat(deal.amount);
                
                // استخدام دالة البوت الآمنة لخصم الرصيد
                const deductionSuccess = await deductBalance(deal.buyerId, amount);
                
                if (deductionSuccess) {
                    await escRef.child(id).update({ 
                        status: 'secured', 
                        updatedAt: admin.database.ServerValue.TIMESTAMP 
                    });
                    
                    await db.ref(`${deal.path}/${deal.postId}`).update({ 
                        pending: true, 
                        buyerId: deal.buyerId,
                        lockedPrice: amount
                    });
                    
                    sendAlert(deal.buyerId, `🔒 تم حجز ${amount} SDM للسلعة "${deal.itemTitle}"`);
                    sendAlert(deal.sellerId, `💰 تم دفع ${amount} SDM للسلعة "${deal.itemTitle}". يمكنك تسليمها للمشتري.`);
                    
                    // تسجيل المعاملة
                    await db.ref('transactions').push({
                        type: 'escrow_lock',
                        from: deal.buyerId,
                        to: 'ESCROW_SYSTEM',
                        amount: amount,
                        postId: deal.postId,
                        date: admin.database.ServerValue.TIMESTAMP
                    });
                } else {
                    await escRef.child(id).update({ status: 'failed_insufficient_funds' });
                    sendAlert(deal.buyerId, `❌ رصيدك غير كافٍ لإتمام عملية الشراء`, 'error');
                }
            }
        }
        
        // معالجة الطلبات المؤكدة من المشتري
        const confirmedDeals = await escRef.orderByChild('status').equalTo('confirmed_by_buyer').once('value');
        if (confirmedDeals.exists()) {
            for (const [id, deal] of Object.entries(confirmedDeals.val())) {
                const amount = parseFloat(deal.amount);
                
                // تحويل المال للبائع
                const transferSuccess = await addBalance(deal.sellerId, amount);
                
                if (transferSuccess) {
                    await escRef.child(id).update({ 
                        status: 'completed',
                        completedAt: admin.database.ServerValue.TIMESTAMP 
                    });
                    
                    await db.ref(`${deal.path}/${deal.postId}`).update({ 
                        sold: true,
                        pending: false,
                        soldAt: admin.database.ServerValue.TIMESTAMP 
                    });
                    
                    sendAlert(deal.sellerId, `✅ تم استلام ${amount} SDM مقابل بيع "${deal.itemTitle}"`);
                    
                    // تسجيل المعاملة النهائية
                    await db.ref('transactions').push({
                        type: 'escrow_release',
                        from: 'ESCROW_SYSTEM',
                        to: deal.sellerId,
                        amount: amount,
                        postId: deal.postId,
                        date: admin.database.ServerValue.TIMESTAMP
                    });
                }
            }
        }
        
        // معالجة الطلبات الملغاة
        const cancelledDeals = await escRef.orderByChild('status').equalTo('cancelled_by_buyer').once('value');
        if (cancelledDeals.exists()) {
            for (const [id, deal] of Object.entries(cancelledDeals.val())) {
                const amount = parseFloat(deal.amount);
                
                // إرجاع المال للمشتري
                const refundSuccess = await addBalance(deal.buyerId, amount);
                
                if (refundSuccess) {
                    await escRef.child(id).update({ 
                        status: 'refunded',
                        refundedAt: admin.database.ServerValue.TIMESTAMP 
                    });
                    
                    await db.ref(`${deal.path}/${deal.postId}`).update({ 
                        pending: false,
                        buyerId: null
                    });
                    
                    sendAlert(deal.buyerId, `↩️ تم إرجاع ${amount} SDM إلى رصيدك`);
                    
                    // تسجيل استرجاع الأموال
                    await db.ref('transactions').push({
                        type: 'escrow_refund',
                        from: 'ESCROW_SYSTEM',
                        to: deal.buyerId,
                        amount: amount,
                        postId: deal.postId,
                        date: admin.database.ServerValue.TIMESTAMP
                    });
                }
            }
        }
        
    } catch (e) { 
        console.error("❌ Escrow Error:", e.message); 
    }
}

// ====================================================
// [2] محرك التحويلات البنكية المحدث
// ====================================================
async function processBankTransfers() {
    try {
        const snap = await db.ref('bank_transfer_requests').orderByChild('status').equalTo('pending').once('value');
        
        if (snap.exists()) {
            for (const [id, req] of Object.entries(snap.val())) {
                
                // التحقق من Rate Limit
                if (!checkRateLimit(req.userId)) {
                    await db.ref(`bank_transfer_requests/${id}`).update({
                        status: 'rate_limited',
                        reason: 'تجاوز الحد المسموح للطلبات',
                        processedAt: admin.database.ServerValue.TIMESTAMP
                    });
                    continue;
                }
                
                const userSnap = await db.ref(`users/${req.userId}`).once('value');
                const user = userSnap.val();
                
                // التحقق من الرصيد
                if (!user || (user.sdmBalance || 0) < req.amountSDM) {
                    await db.ref(`bank_transfer_requests/${id}`).update({
                        status: 'auto_rejected',
                        reason: 'رصيد غير كافٍ',
                        processedAt: admin.database.ServerValue.TIMESTAMP
                    });
                    
                    sendAlert(req.userId, `❌ تم رفض طلب التحويل: رصيدك غير كافٍ`, 'error');
                    continue;
                }
                
                // التحقق من حدود التحويل
                if (req.amountSDM < 1 || req.amountSDM > 10000) {
                    await db.ref(`bank_transfer_requests/${id}`).update({
                        status: 'auto_rejected',
                        reason: 'المبلغ خارج النطاق المسموح (1-10000 SDM)',
                        processedAt: admin.database.ServerValue.TIMESTAMP
                    });
                    continue;
                }
                
                // إرسال تنبيه للإدمن
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
                    
                    console.log(`📋 طلب تحويل جديد: ${req.userName} - ${req.amountSDM} SDM`);
                }
            }
        }
    } catch (e) {
        console.error("❌ Bank Transfer Error:", e.message);
    }
}

// ====================================================
// [3] محرك التحويل المباشر بين المستخدمين
// ====================================================
async function processTransfers() {
    try {
        const snap = await db.ref('requests/transfers').orderByChild('status').equalTo('pending').once('value');
        
        if (snap.exists()) {
            for (const [id, req] of Object.entries(snap.val())) {
                
                // التحقق من Rate Limit
                if (!checkRateLimit(req.from)) {
                    await db.ref(`requests/transfers/${id}`).update({ 
                        status: 'rate_limited' 
                    });
                    continue;
                }
                
                const amount = parseFloat(req.amount);
                const targetSnap = await db.ref('users').orderByChild('numericId').equalTo(req.toId).once('value');
                
                if (!targetSnap.exists()) {
                    await db.ref(`requests/transfers/${id}`).update({ 
                        status: 'failed_not_found' 
                    });
                    sendAlert(req.from, `❌ لم نجد مستخدماً يحمل الرقم ${req.toId}`, 'error');
                    continue;
                }

                const targetUid = Object.keys(targetSnap.val())[0];
                const targetUser = targetSnap.val()[targetUid];
                
                // منع التحويل للنفس
                if (req.from === targetUid) {
                    await db.ref(`requests/transfers/${id}`).update({ 
                        status: 'failed_self_transfer' 
                    });
                    sendAlert(req.from, `❌ لا يمكنك التحويل لنفسك`, 'error');
                    continue;
                }
                
                // استخدام دالة البوت الآمنة للتحويل
                const transferSuccess = await transferBalance(req.from, targetUid, amount);
                
                if (transferSuccess) {
                    await db.ref(`requests/transfers/${id}`).update({ 
                        status: 'completed',
                        toUid: targetUid,
                        completedAt: admin.database.ServerValue.TIMESTAMP
                    });
                    
                    // تسجيل المعاملة
                    await db.ref('transactions').push({
                        type: 'user_transfer',
                        from: req.from,
                        to: targetUid,
                        amount: amount,
                        fromName: req.fromName,
                        toName: targetUser.n,
                        date: admin.database.ServerValue.TIMESTAMP
                    });
                    
                    sendAlert(req.from, `✅ تم تحويل ${amount} SDM إلى ${targetUser.n}`);
                    sendAlert(targetUid, `💰 وصلك تحويل ${amount} SDM من ${req.fromName}`);
                    
                } else {
                    await db.ref(`requests/transfers/${id}`).update({ 
                        status: 'failed_insufficient_funds' 
                    });
                    sendAlert(req.from, `❌ فشل التحويل: رصيدك غير كافٍ`, 'error');
                }
            }
        }
    } catch (e) { 
        console.error("❌ Transfer Error:", e.message); 
    }
}

// ====================================================
// [4] محرك الـ VIP المحدث
// ====================================================
async function processVIP() {
    try {
        // معالجة طلبات الشراء الجديدة
        const snap = await db.ref('requests/vip_subscriptions').orderByChild('status').equalTo('pending').once('value');
        
        if (snap.exists()) {
            for (const [id, req] of Object.entries(snap.val())) {
                const cost = parseFloat(req.cost);
                
                // استخدام دالة البوت الآمنة لخصم الرصيد
                const deductionSuccess = await deductBalance(req.userId, cost);
                
                if (deductionSuccess) {
                    const userRef = db.ref(`users/${req.userId}`);
                    const userSnap = await userRef.once('value');
                    const user = userSnap.val();
                    
                    const currentExpiry = user.vipExpiry || 0;
                    const newExpiry = Math.max(currentExpiry, Date.now()) + (req.days * 86400000);
                    
                    await userRef.update({ 
                        vipStatus: 'active',
                        vipExpiry: newExpiry,
                        vipPurchasedAt: admin.database.ServerValue.TIMESTAMP
                    });
                    
                    await db.ref(`requests/vip_subscriptions/${id}`).update({ 
                        status: 'completed',
                        processedAt: admin.database.ServerValue.TIMESTAMP 
                    });
                    
                    // تسجيل المعاملة
                    await db.ref('transactions').push({
                        type: 'vip_purchase',
                        from: req.userId,
                        to: 'SYSTEM',
                        amount: cost,
                        days: req.days,
                        date: admin.database.ServerValue.TIMESTAMP
                    });
                    
                    sendAlert(req.userId, `👑 مبروك! تم تفعيل VIP لمدة ${req.days} يوم. تنتهي في ${new Date(newExpiry).toLocaleDateString('ar-EG')}`);
                    
                } else {
                    await db.ref(`requests/vip_subscriptions/${id}`).update({ 
                        status: 'failed_insufficient_funds' 
                    });
                    sendAlert(req.userId, `❌ فشل شراء VIP: رصيدك غير كافٍ`, 'error');
                }
            }
        }

        // فحص انتهاء صلاحية الـ VIP
        const now = Date.now();
        const activeVips = await db.ref('users').orderByChild('vipStatus').equalTo('active').once('value');
        
        if (activeVips.exists()) {
            activeVips.forEach(async (child) => {
                const user = child.val();
                if (user.vipExpiry && now > user.vipExpiry) {
                    await child.ref.update({ 
                        vipStatus: 'expired',
                        vipExpiredAt: admin.database.ServerValue.TIMESTAMP
                    });
                    
                    sendAlert(child.key, "⚠️ انتهى اشتراك VIP الخاص بك. يمكنك التجديد من لوحة VIP.", "info");
                }
            });
        }
    } catch (e) { 
        console.error("❌ VIP Error:", e); 
    }
}

// ====================================================
// [5] نظام المعاملات المالية (Coin Requests)
// ====================================================
async function processCoinRequests() {
    try {
        const snap = await db.ref('coin_requests').orderByChild('status').equalTo('pending').once('value');
        
        if (snap.exists()) {
            for (const [id, req] of Object.entries(snap.val())) {
                
                // إرسال تنبيه للإدمن
                const adminNotification = await db.ref('admin_notifications')
                    .orderByChild('requestId')
                    .equalTo(id)
                    .once('value');
                
                if (!adminNotification.exists()) {
                    await db.ref('admin_notifications').push({
                        type: 'coin_request',
                        userId: req.uP,
                        userName: req.uN,
                        userNumericId: req.uNumericId,
                        amount: req.qty,
                        image: req.img,
                        requestId: id,
                        status: 'pending',
                        date: admin.database.ServerValue.TIMESTAMP
                    });
                    
                    console.log(`💰 طلب شحن جديد: ${req.uN} - ${req.qty} SDM`);
                }
            }
        }
    } catch (e) {
        console.error("❌ Coin Request Error:", e.message);
    }
}

// ====================================================
// [6] مراقب النزاعات في الدردشة
// ====================================================
const DISPUTE_KEYWORDS = ["نصاب", "حرامي", "غش", "كذاب", "بلاغ", "سارق", "احتيال"];
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
                    senderId: msg.senderId,
                    senderName: msg.senderName,
                    severity: 'high',
                    date: admin.database.ServerValue.TIMESTAMP
                });
                
                console.log(`⚠️ كشف نزاع في الدردشة: ${msg.senderName} - "${msg.text}"`);
            }
        });
    });
}

// ====================================================
// [7] نظام تنظيف المتجر
// ====================================================
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
                        console.log(`🧹 تم حذف منشور مباع: ${post.title}`);
                    }
                });
            }
        }
    } catch (e) { 
        console.error("❌ Cleanup Error:", e.message); 
    }
}

// ====================================================
// [8] نظام المراقبة اليومية والأمان
// ====================================================
async function dailySecurityCheck() {
    console.log("🔍 بدء الفحص الأمني اليومي...");
    
    try {
        // فحص التحويلات الكبيرة
        const oneDayAgo = Date.now() - 86400000;
        const transfersRef = db.ref('transactions');
        const transfersSnap = await transfersRef
            .orderByChild('date')
            .startAt(oneDayAgo)
            .once('value');
        
        let largeTransfers = 0;
        transfersSnap.forEach(transfer => {
            const data = transfer.val();
            if (data.amount > 1000) {
                largeTransfers++;
            }
        });
        
        if (largeTransfers > 10) {
            console.warn(`⚠️ تحذير: ${largeTransfers} عملية كبيرة في 24 ساعة`);
            
            await db.ref('admin_notifications').push({
                type: 'security_alert',
                message: `⚠️ تم اكتشاف ${largeTransfers} عملية مالية كبيرة في 24 ساعة`,
                date: admin.database.ServerValue.TIMESTAMP
            });
        }
        
        // تنظيف التنبيهات القديمة (أقدم من 7 أيام)
        const sevenDaysAgo = Date.now() - 604800000;
        await cleanOldData('alerts', sevenDaysAgo);
        
        console.log("✅ اكتمل الفحص الأمني اليومي");
    } catch (error) {
        console.error("❌ فشل الفحص الأمني:", error);
    }
}

async function cleanOldData(path, timestamp) {
    try {
        const ref = db.ref(path);
        const snap = await ref.once('value');
        
        const updates = {};
        snap.forEach(child => {
            child.forEach(item => {
                if (item.val().date < timestamp) {
                    updates[`${child.key}/${item.key}`] = null;
                }
            });
        });
        
        if (Object.keys(updates).length > 0) {
            await ref.update(updates);
            console.log(`🧹 تم تنظيف ${Object.keys(updates).length} سجل قديم من ${path}`);
        }
    } catch (error) {
        console.error(`❌ فشل تنظيف ${path}:`, error);
    }
}

// ====================================================
// دوال مساعدة للإدارة
// ====================================================

// دالة لتأكيد طلب الإيداع (للاستخدام من قبل الإدمن)
async function approveCoinRequest(reqId, userId, amount) {
    try {
        const success = await addBalance(userId, amount);
        
        if (success) {
            await db.ref(`coin_requests/${reqId}`).update({
                status: 'approved',
                approvedAt: admin.database.ServerValue.TIMESTAMP,
                approvedBy: 'admin_bot'
            });
            
            await db.ref('transactions').push({
                type: 'deposit_approved',
                to: userId,
                amount: amount,
                requestId: reqId,
                date: admin.database.ServerValue.TIMESTAMP
            });
            
            return true;
        }
        return false;
    } catch (error) {
        console.error("❌ فشل تأكيد الإيداع:", error);
        return false;
    }
}

// دالة لرفض طلب الإيداع
async function rejectCoinRequest(reqId, userId, reason) {
    try {
        await db.ref(`coin_requests/${reqId}`).update({
            status: 'rejected',
            rejectionReason: reason,
            rejectedAt: admin.database.ServerValue.TIMESTAMP
        });
        
        sendAlert(userId, `❌ تم رفض طلب الإيداع: ${reason}`, 'error');
        return true;
    } catch (error) {
        console.error("❌ فشل رفض الإيداع:", error);
        return false;
    }
}

// ====================================================
// المجدولات الزمنية
// ====================================================

// مجدولات المعالجة الأساسية
setInterval(processEscrow, 5000);          // معالجة الوسيط كل 5 ثواني
setInterval(processTransfers, 6000);       // معالجة التحويلات كل 6 ثواني
setInterval(processVIP, 15000);            // فحص الـ VIP كل 15 ثانية
setInterval(processBankTransfers, 7000);   // معالجة التحويلات البنكية كل 7 ثواني
setInterval(processCoinRequests, 8000);    // معالجة طلبات الشحن كل 8 ثواني

// مجدولات الصيانة
setInterval(cleanupStore, 3600000);        // تنظيف المتجر كل ساعة
setInterval(dailySecurityCheck, 86400000); // فحص أمني يومي

// تشغيل المراقبة الفورية
startChatMonitor();

// تشغيل الفحص الأولي بعد 30 ثانية
setTimeout(() => {
    dailySecurityCheck();
    console.log("🚀 تم تشغيل جميع أنظمة البوت الأمنية");
}, 30000);

// ====================================================
// واجهة API للإدارة
// ====================================================

app.use(express.json());

// واجهة لتأكيد الإيداع (للإدمن فقط)
app.post('/api/approve-deposit', async (req, res) => {
    try {
        const { reqId, userId, amount, adminToken } = req.body;
        
        // التحقق من المسؤول (هنا يمكنك إضافة نظام توثيق)
        if (adminToken !== process.env.ADMIN_TOKEN) {
            return res.status(403).json({ error: 'غير مصرح' });
        }
        
        const success = await approveCoinRequest(reqId, userId, amount);
        
        if (success) {
            res.json({ success: true, message: 'تم تأكيد الإيداع بنجاح' });
        } else {
            res.status(400).json({ error: 'فشل تأكيد الإيداع' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// واجهة لرفض الإيداع
app.post('/api/reject-deposit', async (req, res) => {
    try {
        const { reqId, userId, reason, adminToken } = req.body;
        
        if (adminToken !== process.env.ADMIN_TOKEN) {
            return res.status(403).json({ error: 'غير مصرح' });
        }
        
        const success = await rejectCoinRequest(reqId, userId, reason);
        
        if (success) {
            res.json({ success: true, message: 'تم رفض الإيداع بنجاح' });
        } else {
            res.status(400).json({ error: 'فشل رفض الإيداع' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// واجهة للصحة
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
            escrow: 'running',
            transfers: 'running',
            vip: 'running',
            bank_transfers: 'running',
            security: 'running'
        }
    });
});

// ====================================================
// تشغيل السيرفر
// ====================================================

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>🚀 SDM Market Security Bot</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    background: #0f172a;
                    color: white;
                    text-align: center;
                    padding: 50px;
                }
                .status {
                    background: #1e293b;
                    padding: 20px;
                    border-radius: 10px;
                    margin: 20px auto;
                    max-width: 600px;
                    border-left: 5px solid #10b981;
                }
                .service {
                    display: flex;
                    justify-content: space-between;
                    margin: 10px 0;
                    padding: 10px;
                    background: #334155;
                    border-radius: 5px;
                }
            </style>
        </head>
        <body>
            <h1>🚀 SDM Market Security Bot</h1>
            <p>نظام الأمان والوسيط الآمن يعمل بكامل طاقته</p>
            
            <div class="status">
                <h3>📊 حالة الخدمات:</h3>
                <div class="service">
                    <span>🛡️ نظام الوسيط الآمن</span>
                    <span style="color:#10b981">● يعمل</span>
                </div>
                <div class="service">
                    <span>💸 التحويلات البنكية</span>
                    <span style="color:#10b981">● يعمل</span>
                </div>
                <div class="service">
                    <span>👑 نظام VIP</span>
                    <span style="color:#10b981">● يعمل</span>
                </div>
                <div class="service">
                    <span>🔍 مراقبة النزاعات</span>
                    <span style="color:#10b981">● يعمل</span>
                </div>
            </div>
            
            <p>⏰ آخر تحديث: ${new Date().toLocaleString('ar-EG')}</p>
        </body>
        </html>
    `);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 SDM Market Security Bot is Fully Operational on Port ${PORT}`);
    console.log(`📅 بدء التشغيل: ${new Date().toLocaleString('ar-EG')}`);
    console.log(`🔒 أنظمة الأمان: نشطة بنسبة 100%`);
});
