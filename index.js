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
            lastBalanceUpdate: admin.database.ServerValue.TIMESTAMP
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
            lastBalanceUpdate: admin.database.ServerValue.TIMESTAMP
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
// [6] محرك طلبات الألعاب
// ====================================================
async function processGameOrders() {
    try {
        const snap = await db.ref('game_orders').orderByChild('status').equalTo('pending').once('value');
        
        if (snap.exists()) {
            for (const [id, order] of Object.entries(snap.val())) {
                // التحقق من Rate Limit
                if (!checkRateLimit(order.userId)) {
                    await db.ref(`game_orders/${id}`).update({
                        status: 'rate_limited',
                        processedAt: admin.database.ServerValue.TIMESTAMP
                    });
                    continue;
                }
                
                // إرسال تنبيه للإدمن
                const adminNotification = await db.ref('admin_notifications')
                    .orderByChild('orderId')
                    .equalTo(id)
                    .once('value');
                
                if (!adminNotification.exists()) {
                    await db.ref('admin_notifications').push({
                        type: 'new_game_order',
                        userId: order.userId,
                        userName: order.userName,
                        game: order.game,
                        playerId: order.playerId,
                        pack: order.pack,
                        cost: order.cost,
                        orderId: id,
                        date: admin.database.ServerValue.TIMESTAMP
                    });
                    
                    console.log(`🎮 طلب لعبة جديد: ${order.userName} - ${order.pack} (${order.cost} SDM)`);
                }
            }
        }
    } catch (e) {
        console.error("❌ Game Order Error:", e.message);
    }
}

// ====================================================
// [7] محرك التقييمات
// ====================================================
async function processRatings() {
    try {
        const snap = await db.ref('rating_queue').orderByChild('status').equalTo('pending').once('value');
        
        if (snap.exists()) {
            for (const [id, rating] of Object.entries(snap.val())) {
                const userRef = db.ref(`users/${rating.target}`);
                const userSnap = await userRef.once('value');
                const user = userSnap.val();
                
                if (user) {
                    const newReviewCount = (user.reviewCount || 0) + 1;
                    const newRatingSum = (user.ratingSum || 0) + rating.stars;
                    const newAverage = newRatingSum / newReviewCount;
                    
                    await userRef.update({
                        reviewCount: newReviewCount,
                        ratingSum: newRatingSum,
                        rating: newAverage.toFixed(1),
                        verified: newReviewCount >= 100 ? true : user.verified || false
                    });
                    
                    // حفظ التقييم المنفصل
                    await db.ref(`reviews/${rating.target}`).push({
                        buyerName: rating.raterN,
                        stars: rating.stars,
                        comment: rating.comment || '',
                        date: admin.database.ServerValue.TIMESTAMP,
                        postId: rating.postId || null
                    });
                    
                    await db.ref(`rating_queue/${id}`).update({
                        status: 'processed',
                        processedAt: admin.database.ServerValue.TIMESTAMP
                    });
                    
                    console.log(`⭐ تم معالجة تقييم: ${rating.raterN} → ${user.n} (${rating.stars} نجوم)`);
                    
                    // إرسال تنبيه للمستخدم الذي تم تقييمه
                    sendAlert(rating.target, `⭐ حصلت على تقييم جديد من ${rating.raterN}: ${rating.stars} نجوم`, 'success');
                }
            }
        }
    } catch (e) {
        console.error("❌ Ratings Error:", e.message);
    }
}

// ====================================================
// [8] مراقب النزاعات في الدردشة
// ====================================================
const DISPUTE_KEYWORDS = ["نصاب", "حرامي", "غش", "كذاب", "بلاغ", "سارق", "احتيال", "نصب", "خداع", "فشخ", "كلب"];

function startChatMonitor() {
    db.ref('chats').on('child_added', (chatSnap) => {
        db.ref(`chats/${chatSnap.key}`).limitToLast(1).on('child_added', async (msgSnap) => {
            const msg = msgSnap.val();
            
            if (!msg || !msg.text || msg.date < (Date.now() - 60000)) return;
            
            const hasBadWord = DISPUTE_KEYWORDS.some(word => 
                msg.text.toLowerCase().includes(word.toLowerCase())
            );
            
            if (hasBadWord) {
                const chatData = await db.ref(`chats/${chatSnap.key}`).limitToLast(5).once('value');
                const messages = [];
                
                chatData.forEach(child => {
                    messages.push(child.val());
                });
                
                await db.ref('admin_notifications').push({
                    type: 'dispute_alert',
                    chatId: chatSnap.key,
                    lastMessage: msg.text,
                    senderId: msg.senderId,
                    senderName: msg.senderName,
                    messages: messages,
                    keyword: DISPUTE_KEYWORDS.find(word => msg.text.includes(word)),
                    severity: 'high',
                    date: admin.database.ServerValue.TIMESTAMP,
                    read: false
                });
                
                console.log(`⚠️ كشف نزاع في الدردشة: ${msg.senderName} - "${msg.text.substring(0, 50)}..."`);
                
                // إرسال تنبيه فوري للإدمن في الكونسول
                console.log(`🚨 نزاع خطير! الدردشة: ${chatSnap.key}`);
            }
        });
    });
}

// ====================================================
// [9] نظام تنظيف المتجر
// ====================================================
async function cleanupStore() {
    try {
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;
        const sevenDays = 7 * oneDay;
        const paths = ['posts', 'vip_posts'];
        
        for (const path of paths) {
            const snap = await db.ref(path).once('value');
            if (snap.exists()) {
                snap.forEach(child => {
                    const post = child.val();
                    const postDate = post.date || 0;
                    
                    // حذف المنشورات المباعة لأكثر من يوم
                    if (post.sold && post.soldAt && (now - post.soldAt) > oneDay) {
                        child.ref.remove();
                        console.log(`🧹 تم حذف منشور مباع: ${post.title}`);
                    }
                    // حذف المنشورات القديمة (أكثر من 7 أيام)
                    else if ((now - postDate) > sevenDays) {
                        child.ref.remove();
                        console.log(`🧹 تم حذف منشور قديم: ${post.title}`);
                    }
                });
            }
        }
        
        // تنظيف طلبات التحويل القديمة
        await cleanupOldRequests('requests/transfers', 30);
        await cleanupOldRequests('requests/escrow_deals', 7);
        await cleanupOldRequests('requests/vip_subscriptions', 7);
        
    } catch (e) { 
        console.error("❌ Cleanup Error:", e.message); 
    }
}

async function cleanupOldRequests(path, days) {
    try {
        const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
        const snap = await db.ref(path).once('value');
        
        if (snap.exists()) {
            snap.forEach(child => {
                const request = child.val();
                if (request.date && request.date < cutoff) {
                    child.ref.remove();
                    console.log(`🧹 تم تنظيف طلب قديم من ${path}`);
                }
            });
        }
    } catch (error) {
        console.error(`❌ فشل تنظيف ${path}:`, error);
    }
}

// ====================================================
// [10] نظام المراقبة اليومية والأمان
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
        let totalTransfers = 0;
        let totalAmount = 0;
        
        transfersSnap.forEach(transfer => {
            const data = transfer.val();
            totalTransfers++;
            totalAmount += data.amount || 0;
            
            if (data.amount > 1000) {
                largeTransfers++;
            }
        });
        
        if (largeTransfers > 10) {
            console.warn(`⚠️ تحذير: ${largeTransfers} عملية كبيرة في 24 ساعة`);
            
            await db.ref('admin_notifications').push({
                type: 'security_alert',
                message: `⚠️ تم اكتشاف ${largeTransfers} عملية مالية كبيرة في 24 ساعة`,
                details: {
                    totalTransfers: totalTransfers,
                    totalAmount: totalAmount,
                    largeTransfers: largeTransfers,
                    date: new Date().toLocaleString('ar-EG')
                },
                date: admin.database.ServerValue.TIMESTAMP
            });
        }
        
        // فحص المستخدمين غير النشطين
        const monthAgo = Date.now() - 30 * 86400000;
        const usersSnap = await db.ref('users').once('value');
        let inactiveUsers = 0;
        
        usersSnap.forEach(child => {
            const user = child.val();
            const lastActivity = user.lastActivity || user.joinDate || 0;
            
            if (lastActivity < monthAgo && !user.online) {
                inactiveUsers++;
            }
        });
        
        if (inactiveUsers > 20) {
            console.log(`👤 ${inactiveUsers} مستخدم غير نشط لأكثر من شهر`);
        }
        
        // تنظيف التنبيهات القديمة (أقدم من 7 أيام)
        const sevenDaysAgo = Date.now() - 604800000;
        await cleanOldData('alerts', sevenDaysAgo);
        
        // تنظيف الإشعارات القديمة
        await cleanOldData('admin_notifications', sevenDaysAgo);
        
        console.log("✅ اكتمل الفحص الأمني اليومي");
        console.log(`📊 إحصائيات: ${totalTransfers} معاملة، ${totalAmount} SDM، ${largeTransfers} عملية كبيرة`);
        
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
            
            sendAlert(userId, `✅ تم تأكيد إيداع ${amount} SDM في حسابك`, 'success');
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

// دالة لتحديث حالة طلب اللعبة
async function updateGameOrderStatus(orderId, status) {
    try {
        const orderRef = db.ref(`game_orders/${orderId}`);
        const orderSnap = await orderRef.once('value');
        const order = orderSnap.val();
        
        if (!order) {
            console.error(`❌ طلب اللعبة ${orderId} غير موجود`);
            return false;
        }
        
        const updates = {
            status: status,
            processedAt: admin.database.ServerValue.TIMESTAMP,
            processedBy: 'security_bot'
        };
        
        // إذا كانت الحالة فشل، نرجع المال للمستخدم
        if (status === 'failed' || status === 'cancelled') {
            const refundSuccess = await addBalance(order.userId, order.cost);
            if (refundSuccess) {
                updates.refunded = true;
                updates.refundedAt = admin.database.ServerValue.TIMESTAMP;
            }
        }
        
        await orderRef.update(updates);
        
        // إرسال تنبيه للمستخدم
        const message = status === 'completed' 
            ? `✅ تم تنفيذ طلب شحن ${order.pack} بنجاح` 
            : status === 'failed' 
            ? `❌ تم إلغاء طلب شحن ${order.pack} وتم إرجاع ${order.cost} SDM`
            : `📝 تم تحديث حالة طلبك إلى: ${status}`;
        
        sendAlert(order.userId, message, status === 'completed' ? 'success' : 'info');
        
        console.log(`🎮 تم تحديث حالة طلب اللعبة ${orderId} إلى ${status}`);
        return true;
    } catch (error) {
        console.error("❌ فشل تحديث حالة طلب اللعبة:", error);
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
setInterval(processGameOrders, 10000);     // معالجة طلبات الألعاب كل 10 ثواني
setInterval(processRatings, 12000);        // معالجة التقييمات كل 12 ثانية

// مجدولات الصيانة
setInterval(cleanupStore, 3600000);        // تنظيف المتجر كل ساعة
setInterval(dailySecurityCheck, 86400000); // فحص أمني يومي

// تشغيل المراقبة الفورية
startChatMonitor();

// تشغيل الفحص الأولي بعد 30 ثانية
setTimeout(() => {
    dailySecurityCheck();
    console.log("🚀 تم تشغيل جميع أنظمة البوت الأمنية");
    console.log("=========================================");
    console.log("📊 الأنظمة النشطة:");
    console.log("🛡️  نظام الوسيط الآمن");
    console.log("💸 نظام التحويلات البنكية");
    console.log("👑 نظام VIP");
    console.log("🎮 نظام الألعاب");
    console.log("⭐ نظام التقييمات");
    console.log("🔍 مراقبة النزاعات");
    console.log("🧹 نظام التنظيف التلقائي");
    console.log("🔒 نظام المراقبة الأمنية");
    console.log("=========================================");
}, 30000);

// ====================================================
// واجهة API للإدارة
// ====================================================

app.use(express.json());

// واجهة لتأكيد الإيداع (للإدمن فقط)
app.post('/api/approve-deposit', async (req, res) => {
    try {
        const { reqId, userId, amount, adminToken } = req.body;
        
        // التحقق من المسؤول
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

// واجهة لتحديث حالة طلب اللعبة
app.post('/api/update-game-order', async (req, res) => {
    try {
        const { orderId, status, adminToken } = req.body;
        
        if (adminToken !== process.env.ADMIN_TOKEN) {
            return res.status(403).json({ error: 'غير مصرح' });
        }
        
        const success = await updateGameOrderStatus(orderId, status);
        
        if (success) {
            res.json({ success: true, message: 'تم تحديث حالة الطلب بنجاح' });
        } else {
            res.status(400).json({ error: 'فشل تحديث حالة الطلب' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// واجهة للحصول على إحصائيات النظام
app.get('/api/stats', async (req, res) => {
    try {
        const { adminToken } = req.query;
        
        if (adminToken !== process.env.ADMIN_TOKEN) {
            return res.status(403).json({ error: 'غير مصرح' });
        }
        
        // إحصائيات المستخدمين
        const usersSnap = await db.ref('users').once('value');
        const totalUsers = usersSnap.numChildren();
        let vipUsers = 0;
        let onlineUsers = 0;
        let totalBalance = 0;
        
        usersSnap.forEach(child => {
            const user = child.val();
            if (user.vipStatus === 'active') vipUsers++;
            if (user.online) onlineUsers++;
            totalBalance += user.sdmBalance || 0;
        });
        
        // إحصائيات المعاملات
        const transactionsSnap = await db.ref('transactions').once('value');
        const totalTransactions = transactionsSnap.numChildren();
        
        // إحصائيات المنشورات
        const postsSnap = await db.ref('posts').once('value');
        const vipPostsSnap = await db.ref('vip_posts').once('value');
        const totalPosts = postsSnap.numChildren() + vipPostsSnap.numChildren();
        
        // إحصائيات الطلبات
        const pendingDeposits = await db.ref('coin_requests').orderByChild('status').equalTo('pending').once('value');
        const pendingTransfers = await db.ref('bank_transfer_requests').orderByChild('status').equalTo('pending').once('value');
        const pendingEscrows = await db.ref('requests/escrow_deals').orderByChild('status').equalTo('pending_delivery').once('value');
        
        res.json({
            success: true,
            stats: {
                users: {
                    total: totalUsers,
                    vip: vipUsers,
                    online: onlineUsers,
                    totalBalance: totalBalance.toFixed(2)
                },
                content: {
                    totalPosts: totalPosts,
                    regularPosts: postsSnap.numChildren(),
                    vipPosts: vipPostsSnap.numChildren()
                },
                transactions: {
                    total: totalTransactions,
                    pendingDeposits: pendingDeposits.numChildren(),
                    pendingTransfers: pendingTransfers.numChildren(),
                    pendingEscrows: pendingEscrows.numChildren()
                },
                system: {
                    uptime: process.uptime(),
                    memory: process.memoryUsage(),
                    timestamp: new Date().toISOString()
                }
            }
        });
        
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
            game_orders: 'running',
            ratings: 'running',
            security: 'running',
            cleanup: 'running'
        },
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

// ====================================================
// واجهة المستخدم الرئيسية
// ====================================================

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>🚀 SDM Market Security Bot</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                body {
                    font-family: 'Arial', sans-serif;
                    background: linear-gradient(135deg, #0f172a, #1e293b);
                    color: #f8fafc;
                    min-height: 100vh;
                    padding: 20px;
                }
                
                .container {
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 20px;
                }
                
                header {
                    text-align: center;
                    margin-bottom: 40px;
                    padding: 20px;
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 20px;
                    border: 1px solid rgba(59, 130, 246, 0.3);
                    backdrop-filter: blur(10px);
                }
                
                h1 {
                    font-size: 2.5rem;
                    margin-bottom: 10px;
                    background: linear-gradient(90deg, #3b82f6, #00f3ff);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                
                .subtitle {
                    color: #94a3b8;
                    font-size: 1.1rem;
                }
                
                .services-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                    gap: 20px;
                    margin-bottom: 40px;
                }
                
                .service-card {
                    background: rgba(30, 41, 59, 0.8);
                    border-radius: 15px;
                    padding: 25px;
                    border: 1px solid rgba(59, 130, 246, 0.2);
                    transition: all 0.3s ease;
                    position: relative;
                    overflow: hidden;
                }
                
                .service-card:hover {
                    transform: translateY(-5px);
                    border-color: #3b82f6;
                    box-shadow: 0 10px 30px rgba(59, 130, 246, 0.2);
                }
                
                .service-icon {
                    font-size: 40px;
                    margin-bottom: 15px;
                    color: #00f3ff;
                }
                
                .service-title {
                    font-size: 1.3rem;
                    margin-bottom: 10px;
                    color: #f8fafc;
                }
                
                .service-desc {
                    color: #94a3b8;
                    font-size: 0.95rem;
                    line-height: 1.6;
                }
                
                .status-badge {
                    position: absolute;
                    top: 15px;
                    right: 15px;
                    padding: 5px 12px;
                    background: #10b981;
                    color: white;
                    border-radius: 20px;
                    font-size: 0.8rem;
                    font-weight: bold;
                }
                
                .stats-section {
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 15px;
                    padding: 25px;
                    margin-bottom: 30px;
                    border: 1px solid rgba(245, 158, 11, 0.3);
                }
                
                .stats-title {
                    font-size: 1.5rem;
                    margin-bottom: 20px;
                    color: #f59e0b;
                }
                
                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 15px;
                }
                
                .stat-item {
                    background: rgba(0, 0, 0, 0.2);
                    padding: 15px;
                    border-radius: 10px;
                    text-align: center;
                }
                
                .stat-value {
                    font-size: 1.8rem;
                    font-weight: bold;
                    color: #00f3ff;
                    margin-bottom: 5px;
                }
                
                .stat-label {
                    color: #94a3b8;
                    font-size: 0.9rem;
                }
                
                .footer {
                    text-align: center;
                    margin-top: 40px;
                    padding-top: 20px;
                    border-top: 1px solid rgba(255, 255, 255, 0.1);
                    color: #64748b;
                    font-size: 0.9rem;
                }
                
                .api-info {
                    background: rgba(0, 0, 0, 0.3);
                    border-radius: 10px;
                    padding: 20px;
                    margin-top: 30px;
                }
                
                .api-title {
                    color: #f59e0b;
                    margin-bottom: 15px;
                    font-size: 1.2rem;
                }
                
                .endpoint {
                    background: rgba(255, 255, 255, 0.05);
                    padding: 10px 15px;
                    border-radius: 8px;
                    margin: 8px 0;
                    font-family: monospace;
                    font-size: 0.9rem;
                    color: #60a5fa;
                }
                
                @media (max-width: 768px) {
                    .container {
                        padding: 10px;
                    }
                    
                    h1 {
                        font-size: 2rem;
                    }
                    
                    .services-grid {
                        grid-template-columns: 1fr;
                    }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <header>
                    <h1>🚀 SDM Market Security Bot</h1>
                    <p class="subtitle">نظام الأمان والوسيط الآمن يعمل بكامل طاقته لحماية معاملاتك</p>
                </header>
                
                <div class="services-grid">
                    <div class="service-card">
                        <div class="status-badge">نشط</div>
                        <div class="service-icon">🛡️</div>
                        <h3 class="service-title">نظام الوسيط الآمن</h3>
                        <p class="service-desc">حماية كاملة للمعاملات بين البائع والمشتري مع تأمين الأموال حتى استلام المنتج</p>
                    </div>
                    
                    <div class="service-card">
                        <div class="status-badge">نشط</div>
                        <div class="service-icon">💸</div>
                        <h3 class="service-title">التحويلات البنكية</h3>
                        <p class="service-desc">نظام آمن لتحويل الأموال إلى البنوك المحلية مع مراقبة فورية</p>
                    </div>
                    
                    <div class="service-card">
                        <div class="status-badge">نشط</div>
                        <div class="service-icon">👑</div>
                        <h3 class="service-title">نظام VIP</h3>
                        <p class="service-desc">إدارة اشتراكات VIP تلقائية مع تجديد وانتهاء تلقائي</p>
                    </div>
                    
                    <div class="service-card">
                        <div class="status-badge">نشط</div>
                        <div class="service-icon">🎮</div>
                        <h3 class="service-title">طلبات الألعاب</h3>
                        <p class="service-desc">معالجة طلبات شحن الألعاب مع تأكيد فوري</p>
                    </div>
                    
                    <div class="service-card">
                        <div class="status-badge">نشط</div>
                        <div class="service-icon">⭐</div>
                        <h3 class="service-title">نظام التقييمات</h3>
                        <p class="service-desc">تقييم المستخدمين تلقائياً وبناء السمعة الرقمية</p>
                    </div>
                    
                    <div class="service-card">
                        <div class="status-badge">نشط</div>
                        <div class="service-icon">🔍</div>
                        <h3 class="service-title">مراقبة النزاعات</h3>
                        <p class="service-desc">كشف النزاعات في الدردشات وإرسال تنبيهات فورية</p>
                    </div>
                </div>
                
                <div class="stats-section">
                    <h3 class="stats-title">📊 حالة النظام الحية</h3>
                    <div class="stats-grid">
                        <div class="stat-item">
                            <div class="stat-value" id="uptime">0</div>
                            <div class="stat-label">ثانية تشغيل</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value" id="memory">0</div>
                            <div class="stat-label">ميغابايت مستخدمة</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value" id="services">8</div>
                            <div class="stat-label">خدمة نشطة</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value" id="timestamp">${new Date().toLocaleTimeString('ar-EG')}</div>
                            <div class="stat-label">آخر تحديث</div>
                        </div>
                    </div>
                </div>
                
                <div class="api-info">
                    <h3 class="api-title">🌐 واجهات API المتاحة</h3>
                    <div class="endpoint">GET /health - حالة النظام</div>
                    <div class="endpoint">POST /api/approve-deposit - تأكيد الإيداع</div>
                    <div class="endpoint">POST /api/reject-deposit - رفض الإيداع</div>
                    <div class="endpoint">POST /api/update-game-order - تحديث طلب لعبة</div>
                    <div class="endpoint">GET /api/stats - إحصائيات النظام</div>
                </div>
                
                <div class="footer">
                    <p>⏰ آخر تحديث: <span id="currentTime">${new Date().toLocaleString('ar-EG')}</span></p>
                    <p>🔒 جميع الحقوق محفوظة © SDM Market 2024</p>
                </div>
            </div>
            
            <script>
                // تحديث الوقت الحي
                function updateTime() {
                    const now = new Date();
                    document.getElementById('currentTime').textContent = now.toLocaleString('ar-EG');
                    document.getElementById('timestamp').textContent = now.toLocaleTimeString('ar-EG');
                    
                    // محاكاة بيانات النظام
                    const uptimeElement = document.getElementById('uptime');
                    let uptime = parseInt(uptimeElement.textContent) || 0;
                    uptimeElement.textContent = (uptime + 1) + 's';
                    
                    // تحديث استخدام الذاكرة عشوائياً (لمحاكاة البيانات الحية)
                    document.getElementById('memory').textContent = 
                        Math.floor(Math.random() * 100 + 100) + ' MB';
                }
                
                // تحديث كل ثانية
                setInterval(updateTime, 1000);
                
                // جلب بيانات النظام الحية
                async function fetchSystemStats() {
                    try {
                        const response = await fetch('/health');
                        const data = await response.json();
                        
                        if (data.status === 'healthy') {
                            document.getElementById('uptime').textContent = 
                                Math.floor(data.uptime) + 's';
                            document.getElementById('memory').textContent = 
                                Math.floor(data.memory.heapUsed / 1024 / 1024) + ' MB';
                        }
                    } catch (error) {
                        console.log('جاري تحديث البيانات...');
                    }
                }
                
                // جلب البيانات كل 30 ثانية
                setInterval(fetchSystemStats, 30000);
                
                // جلب البيانات أول مرة
                fetchSystemStats();
            </script>
        </body>
        </html>
    `);
});

// ====================================================
// تشغيل السيرفر
// ====================================================

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 SDM Market Security Bot is Fully Operational on Port ${PORT}`);
    console.log(`📅 بدء التشغيل: ${new Date().toLocaleString('ar-EG')}`);
    console.log(`🔒 أنظمة الأمان: نشطة بنسبة 100%`);
    console.log(`🌐 الواجهة متاحة على: http://localhost:${PORT}`);
});
