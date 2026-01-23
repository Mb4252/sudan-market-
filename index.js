const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// مفتاح ImgBB (تأكد أنه فعال)
const IMGBB_API_KEY = 'aa874951c530708a0300fc5401ed7046';

// --- [1] إعداد الاتصال بـ Firebase ---
let serviceAccount;
try {
    const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT;
    const keyString = rawKey.trim().startsWith('{') ? rawKey : Buffer.from(rawKey, 'base64').toString('utf-8');
    serviceAccount = JSON.parse(keyString);
} catch (error) {
    console.error("❌ خطأ في مفتاح Firebase!");
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
});

const db = admin.database();
app.use(cors());
app.use(express.json());

// ======================================================
// [2] محرك إنشاء الهوية الفريدة (Numeric ID)
// ======================================================
db.ref('users').on('child_added', async (snap) => {
    const user = snap.val();
    const uid = snap.key;

    if (!user.numericId) {
        let isUnique = false;
        let newId = "";
        let attempts = 0;
        
        // محاولات إنشاء رقم فريد
        while (!isUnique && attempts < 10) {
            newId = Math.floor(100000 + Math.random() * 900000).toString();
            const existing = await db.ref('users').orderByChild('numericId').equalTo(newId).once('value');
            if (!existing.exists()) isUnique = true;
            attempts++;
        }
        
        if (isUnique) {
            await db.ref(`users/${uid}`).update({
                numericId: newId,
                sdmBalance: user.sdmBalance || 0,
                rating: user.rating || 5.0
            });
            console.log(`✅ تم إنشاء ID: ${newId} للمستخدم: ${uid}`);
            sendAlert(uid, `🎉 تم تفعيل حسابك بنجاح. رقمك التعريفي هو: ${newId}`);
        } else {
            console.error(`❌ فشل إنشاء ID فريد لـ ${uid}`);
        }
    }
});

// ======================================================
// [3] محرك تحويل الأموال الفوري (P2P)
// ======================================================
db.ref('requests/transfers').on('child_added', async (snap) => {
    const req = snap.val();
    if (req.status !== 'pending') return;

    console.log(`🔄 معالجة تحويل جديد: ${req.amount} SDM من ${req.from} إلى ${req.toId}`);

    try {
        const amount = parseFloat(req.amount);
        if (isNaN(amount) || amount <= 0) {
            await snap.ref.update({ status: 'failed_invalid_amount' });
            return sendAlert(req.from, `❌ كمية غير صالحة: ${req.amount}`);
        }

        const targetSnap = await db.ref('users').orderByChild('numericId').equalTo(req.toId.toString()).once('value');
        
        if (!targetSnap.exists()) {
            await snap.ref.update({ status: 'failed_not_found' });
            return sendAlert(req.from, `❌ الرقم ${req.toId} غير موجود`);
        }

        const targetUid = Object.keys(targetSnap.val())[0];
        if (targetUid === req.from) {
            await snap.ref.update({ status: 'failed_self_transfer' });
            return sendAlert(req.from, `❌ لا يمكن التحويل لنفسك`);
        }

        // التحقق من رصيد المرسل
        const senderSnap = await db.ref(`users/${req.from}`).once('value');
        const sender = senderSnap.val();
        
        if (!sender || parseFloat(sender.sdmBalance || 0) < amount) {
            await snap.ref.update({ status: 'failed_insufficient_balance' });
            return sendAlert(req.from, `❌ رصيدك غير كافٍ. المطلوب: ${amount} SDM`);
        }

        // بدء التحويل
        const tx = await db.ref(`users/${req.from}`).transaction(u => {
            if (!u) return undefined;
            u.sdmBalance = Number((parseFloat(u.sdmBalance || 0) - amount).toFixed(2));
            return u;
        });

        if (tx.committed) {
            await db.ref(`users/${targetUid}/sdmBalance`).transaction(b => {
                return Number(((parseFloat(b) || 0) + amount).toFixed(2));
            });
            
            await snap.ref.update({ 
                status: 'completed', 
                actualReceiver: targetUid,
                processedAt: Date.now() 
            });
            
            await db.ref('transactions').push({
                from: req.from,
                fromName: req.fromName,
                to: targetUid,
                amount: amount,
                type: 'p2p_transfer',
                date: Date.now()
            });
            
            // إرسال إشعارات
            const targetUser = (await db.ref(`users/${targetUid}`).once('value')).val();
            sendAlert(targetUid, `💰 استلمت ${amount} SDM من ${req.fromName} (رقم التعريف: ${req.toId})`);
            sendAlert(req.from, `✅ تم تحويل ${amount} SDM بنجاح إلى ${req.toId}`);
            
            console.log(`✅ تم تحويل ${amount} SDM من ${req.from} إلى ${targetUid}`);
        } else {
            await snap.ref.update({ status: 'failed_transaction' });
            sendAlert(req.from, `❌ فشل التحويل. حاول مرة أخرى`);
        }
    } catch (e) { 
        console.error("Transfer Error:", e.message);
        await snap.ref.update({ status: 'failed_error', error: e.message });
        sendAlert(req.from, `❌ خطأ في التحويل: ${e.message}`);
    }
});

// ======================================================
// [4] محرك الوسيط الآمن والحذف التلقائي للمنشورات
// ======================================================
db.ref('requests/escrow_deals').on('child_added', async (snap) => {
    const deal = snap.val();
    if (deal.status !== 'pending_delivery') return;

    console.log(`🛡️ بدء وسيط آمن لمنشور: ${deal.postId}`);

    try {
        const amount = parseFloat(deal.amount);
        
        // التحقق من رصيد المشتري
        const buyerSnap = await db.ref(`users/${deal.buyerId}`).once('value');
        const buyer = buyerSnap.val();
        
        if (!buyer || parseFloat(buyer.sdmBalance || 0) < amount) {
            await snap.ref.update({ status: 'failed_insufficient_balance' });
            await db.ref(`${deal.path}/${deal.postId}`).update({ 
                pending: false,
                error: 'رصيد المشتري غير كاف'
            });
            return sendAlert(deal.buyerId, `❌ رصيدك غير كافٍ للمعاملة الوسيطة`);
        }

        // تجميد المبلغ
        const tx = await db.ref(`users/${deal.buyerId}`).transaction(u => {
            if (!u) return undefined;
            u.sdmBalance = Number((parseFloat(u.sdmBalance || 0) - amount).toFixed(2));
            return u;
        });

        if (tx.committed) {
            await snap.ref.update({ 
                status: 'secured',
                securedAt: Date.now()
            });
            
            await db.ref(`${deal.path}/${deal.postId}`).update({ 
                pending: true, 
                buyerId: deal.buyerId,
                securedAt: Date.now()
            });
            
            sendAlert(deal.buyerId, `🔒 تم حجز ${amount} SDM لدى الوسيط. يمكنك الاتفاق مع البائع.`);
            sendAlert(deal.sellerId, `🔔 دفع المشتري الثمن. يمكنك تسليم المنتج.`);
            
            console.log(`✅ تم حجز ${amount} SDM لوسيط: ${deal.postId}`);
        }
    } catch (e) {
        console.error("Escrow Hold Error:", e.message);
        await snap.ref.update({ status: 'failed', error: e.message });
    }
});

db.ref('requests/escrow_deals').on('child_changed', async (snap) => {
    const deal = snap.val();
    const dealId = snap.key;
    
    console.log(`🔄 تحديث حالة وسيط: ${dealId} -> ${deal.status}`);

    // الحالة: المشتري استلم المنتج -> حول المال للبائع واحذف المنشور
    if (deal.status === 'confirmed_by_buyer') {
        const amount = parseFloat(deal.amount);
        
        try {
            await db.ref(`users/${deal.sellerId}/sdmBalance`).transaction(b => {
                return Number(((parseFloat(b) || 0) + amount).toFixed(2));
            });
            
            await snap.ref.update({ 
                status: 'completed',
                completedAt: Date.now(),
                reviewStars: deal.reviewStars || 0
            });
            
            // 🚨 حذف المنشور من السوق نهائياً 🚨
            await db.ref(`${deal.path}/${deal.postId}`).remove();
            
            // تسجيل المعاملة
            await db.ref('transactions').push({
                from: deal.buyerId,
                to: deal.sellerId,
                amount: amount,
                type: 'escrow_completed',
                postId: deal.postId,
                date: Date.now()
            });
            
            sendAlert(deal.sellerId, `💰 مبروك! استلمت ${amount} SDM وتم حذف المنشور.`);
            
            if (deal.reviewStars) {
                // تحديث تقييم البائع
                await db.ref(`users/${deal.sellerId}`).transaction(user => {
                    if (user) {
                        user.reviewCount = (user.reviewCount || 0) + 1;
                        user.ratingSum = (user.ratingSum || 0) + parseInt(deal.reviewStars);
                        user.rating = user.ratingSum / user.reviewCount;
                        if (user.reviewCount >= 10) { // تخفيض العتبة للاختبار
                            user.verified = true;
                        }
                    }
                    return user;
                });
            }
            
            console.log(`✅ وسيط مكتمل: ${dealId} - تم تحويل ${amount} SDM وحذف المنشور`);
            
        } catch (e) {
            console.error("Escrow Complete Error:", e.message);
            await snap.ref.update({ error: e.message });
        }
    }

    // الحالة: إلغاء الصفقة
    if (deal.status === 'cancelled_by_buyer') {
        const amount = parseFloat(deal.amount);
        
        try {
            await db.ref(`users/${deal.buyerId}/sdmBalance`).transaction(b => {
                return Number(((parseFloat(b) || 0) + amount).toFixed(2));
            });
            
            await snap.ref.update({ 
                status: 'refunded',
                refundedAt: Date.now()
            });
            
            await db.ref(`${deal.path}/${deal.postId}`).update({ 
                pending: false, 
                buyerId: null 
            });
            
            sendAlert(deal.buyerId, `↩️ تم إلغاء الصفقة وإعادة ${amount} SDM إلى رصيدك.`);
            
            console.log(`✅ وسيط ملغي: ${dealId} - تم إرجاع ${amount} SDM`);
            
        } catch (e) {
            console.error("Escrow Cancel Error:", e.message);
        }
    }
});

// ======================================================
// [5] محرك VIP الكامل
// ======================================================
db.ref('requests/vip_subscriptions').on('child_added', async (snap) => {
    const req = snap.val();
    if (req.status !== 'pending') return;

    console.log(`👑 معالجة اشتراك VIP: ${req.userName} - ${req.days} يوم`);

    try {
        const cost = parseFloat(req.cost);
        const days = parseInt(req.days);
        
        // التحقق من الرصيد
        const userSnap = await db.ref(`users/${req.userId}`).once('value');
        const user = userSnap.val();
        
        if (!user || parseFloat(user.sdmBalance || 0) < cost) {
            await snap.ref.update({ status: 'failed_insufficient_balance' });
            return sendAlert(req.userId, `❌ رصيدك غير كافي لشراء VIP`);
        }

        // خصم التكلفة
        const tx = await db.ref(`users/${req.userId}`).transaction(u => {
            if (!u) return undefined;
            u.sdmBalance = Number((parseFloat(u.sdmBalance) - cost).toFixed(2));
            
            // حساب تاريخ الانتهاء
            const now = Date.now();
            const expiryDays = days * 86400000; // أيام إلى ملي ثانية
            
            // إذا كان لديه اشتراك نشط، أضف للأيام المتبقية
            if (u.vipStatus === 'active' && u.vipExpiry > now) {
                u.vipExpiry = u.vipExpiry + expiryDays;
            } else {
                u.vipStatus = 'active';
                u.vipExpiry = now + expiryDays;
            }
            
            return u;
        });

        if (tx.committed) {
            await snap.ref.update({ 
                status: 'completed',
                activatedAt: Date.now()
            });
            
            // تسجيل المعاملة
            await db.ref('transactions').push({
                from: req.userId,
                to: 'system',
                amount: cost,
                type: 'vip_purchase',
                days: days,
                date: Date.now()
            });
            
            sendAlert(req.userId, `👑 مبروك! تم تفعيل اشتراك VIP لمدة ${days} يوم.`);
            
            console.log(`✅ تم تفعيل VIP لـ ${req.userName} لمدة ${days} يوم`);
        }
    } catch (e) {
        console.error("VIP Error:", e.message);
        await snap.ref.update({ status: 'failed', error: e.message });
        sendAlert(req.userId, `❌ فشل تفعيل VIP: ${e.message}`);
    }
});

// ======================================================
// [6] محرك السحب البنكي (تجميد الرصيد)
// ======================================================
db.ref('bank_transfer_requests').on('child_added', async (snap) => {
    const req = snap.val();
    if (req.status !== 'pending') return;

    console.log(`🏦 معالجة طلب بنكي جديد: ${req.userName} - ${req.amountSDM} SDM`);

    try {
        const amount = parseFloat(req.amountSDM);
        if (isNaN(amount) || amount <= 0) {
            await snap.ref.update({ 
                status: 'rejected',
                rejectReason: 'المبلغ غير صالح',
                rejectedAt: Date.now()
            });
            return sendAlert(req.userId, `❌ طلبك البنكي مرفوض: المبلغ غير صالح`);
        }

        // التحقق من رصيد المستخدم
        const userSnap = await db.ref(`users/${req.userId}`).once('value');
        const user = userSnap.val();
        
        if (!user || parseFloat(user.sdmBalance || 0) < amount) {
            await snap.ref.update({ 
                status: 'rejected',
                rejectReason: 'رصيد غير كافٍ',
                rejectedAt: Date.now()
            });
            return sendAlert(req.userId, `❌ طلبك البنكي مرفوض: رصيدك غير كافٍ`);
        }

        // خصم المبلغ
        const tx = await db.ref(`users/${req.userId}`).transaction(u => {
            if (!u) return undefined;
            u.sdmBalance = Number((parseFloat(u.sdmBalance) - amount).toFixed(2));
            return u;
        });

        if (tx.committed) {
            await snap.ref.update({ 
                status: 'processing',
                processedAt: Date.now(),
                frozenAmount: amount
            });
            
            // تسجيل المعاملة
            await db.ref('transactions').push({
                userId: req.userId,
                userName: req.userName,
                amount: amount,
                amountSDG: req.amountSDG,
                type: 'bank_withdrawal',
                status: 'processing',
                bankType: req.transferType,
                accountNumber: req.accountNumber,
                date: Date.now()
            });
            
            sendAlert(req.userId, `🏦 تم استلام طلبك البنكي. ${amount} SDM مجمدة. جارٍ التحويل خلال 1-2 ساعة.`);
            
            // إرسال إشعار للمشرفين
            await notifyAdmins('bank_transfer_request', {
                requestId: snap.key,
                userName: req.userName,
                userNumericId: req.userNumericId,
                amountSDM: amount,
                amountSDG: req.amountSDG,
                bankType: req.transferType,
                accountNumber: req.accountNumber
            });
            
            console.log(`✅ تم تجميد ${amount} SDM لطلب بنكي: ${snap.key}`);
        } else {
            await snap.ref.update({ 
                status: 'rejected',
                rejectReason: 'فشل المعاملة',
                rejectedAt: Date.now()
            });
            sendAlert(req.userId, `❌ فشل معالجة طلبك البنكي`);
        }
    } catch (e) {
        console.error("Bank Request Error:", e.message);
        await snap.ref.update({ 
            status: 'rejected',
            rejectReason: 'خطأ في المعالجة: ' + e.message,
            rejectedAt: Date.now()
        });
        sendAlert(req.userId, `❌ خطأ في معالجة طلبك البنكي`);
    }
});

// ======================================================
// [7] محرك معالجة طلبات البنوك (التأكيد/الرفض)
// ======================================================
db.ref('bank_transfer_requests').on('child_changed', async (snap) => {
    const req = snap.val();
    const reqId = snap.key;
    
    console.log(`🔄 تحديث حالة طلب بنكي: ${reqId} -> ${req.status}`);

    try {
        // حالة: تم الرفض
        if (req.status === 'rejected') {
            const amount = parseFloat(req.amountSDM || req.frozenAmount || 0);
            
            if (amount > 0) {
                // إرجاع المبلغ للمستخدم
                await db.ref(`users/${req.userId}/sdmBalance`).transaction(b => {
                    return Number(((parseFloat(b) || 0) + amount).toFixed(2));
                });
                
                // تحديث المعاملة
                await db.ref('transactions').orderByChild('userId').equalTo(req.userId).once('value', async (txSnap) => {
                    const transactions = txSnap.val();
                    if (transactions) {
                        for (const [txId, tx] of Object.entries(transactions)) {
                            if (tx.type === 'bank_withdrawal' && tx.status === 'processing') {
                                await db.ref(`transactions/${txId}`).update({
                                    status: 'rejected',
                                    rejectReason: req.rejectReason,
                                    rejectedAt: Date.now()
                                });
                                break;
                            }
                        }
                    }
                });
                
                sendAlert(req.userId, `❌ طلبك البنكي مرفوض. تم إرجاع ${amount} SDM إلى رصيدك. ${req.rejectReason ? `السبب: ${req.rejectReason}` : ''}`);
                
                console.log(`✅ تم إرجاع ${amount} SDM للمستخدم ${req.userId} (رفض طلب بنكي)`);
            }
        }
        
        // حالة: تم التأكيد
        if (req.status === 'completed') {
            const amount = parseFloat(req.amountSDM || req.frozenAmount || 0);
            
            // تحديث المعاملة
            await db.ref('transactions').orderByChild('userId').equalTo(req.userId).once('value', async (txSnap) => {
                const transactions = txSnap.val();
                if (transactions) {
                    for (const [txId, tx] of Object.entries(transactions)) {
                        if (tx.type === 'bank_withdrawal' && tx.status === 'processing') {
                            await db.ref(`transactions/${txId}`).update({
                                status: 'completed',
                                operationNumber: req.operationNumber,
                                completedAt: Date.now(),
                                completedBy: req.completedBy
                            });
                            break;
                        }
                    }
                }
            });
            
            sendAlert(req.userId, `✅ تم تحويل ${amount} SDM (${req.amountSDG} جنيه) إلى حسابك البنكي. رقم العملية: ${req.operationNumber || 'غير محدد'}`);
            
            console.log(`✅ تم تأكيد تحويل ${amount} SDM للمستخدم ${req.userId}`);
        }
        
    } catch (e) {
        console.error("Bank Status Change Error:", e.message);
    }
});

// ======================================================
// [8] محرك طلبات الشحن (SDM)
// ======================================================
db.ref('coin_requests').on('child_added', async (snap) => {
    const req = snap.val();
    if (req.status !== 'pending') return;

    console.log(`🪙 معالجة طلب شحن: ${req.uName || req.uN} - ${req.qty} SDM`);

    try {
        const qty = parseFloat(req.qty);
        if (isNaN(qty) || qty <= 0) {
            await snap.ref.update({ status: 'rejected', rejectReason: 'كمية غير صالحة' });
            return;
        }

        // فقط قم بتسجيل الطلب - ينتظر موافقة المشرف
        await snap.ref.update({ receivedAt: Date.now() });
        
        // إشعار المشرفين
        await notifyAdmins('coin_deposit_request', {
            requestId: snap.key,
            userName: req.uName || req.uN,
            userNumericId: req.uNumericId,
            amount: qty,
            imageUrl: req.img
        });
        
        sendAlert(req.uP, `🪙 تم استلام طلب شحن ${qty} SDM. جاري المراجعة...`);
        
        console.log(`📝 طلب شحن مسجل: ${snap.key} - ${qty} SDM`);
        
    } catch (e) {
        console.error("Coin Request Error:", e.message);
        await snap.ref.update({ status: 'failed', error: e.message });
    }
});

// ======================================================
// [9] محرك الموافقة على طلبات الشحن
// ======================================================
db.ref('coin_requests').on('child_changed', async (snap) => {
    const req = snap.val();
    
    if (req.status === 'approved') {
        try {
            const qty = parseFloat(req.qty);
            
            // شحن الرصيد
            await db.ref(`users/${req.uP}/sdmBalance`).transaction(b => {
                return Number(((parseFloat(b) || 0) + qty).toFixed(2));
            });
            
            // تسجيل المعاملة
            await db.ref('transactions').push({
                type: 'deposit',
                to: req.uP,
                from: 'SYSTEM',
                amount: qty,
                approvedBy: req.approvedBy,
                date: Date.now()
            });
            
            sendAlert(req.uP, `✅ تم تأكيد إيداع ${qty} SDM في حسابك.`);
            
            console.log(`✅ تم شحن ${qty} SDM للمستخدم ${req.uP}`);
            
        } catch (e) {
            console.error("Coin Approval Error:", e.message);
        }
    }
});

// ======================================================
// [10] محرك المراقبة التلقائية للنزاعات
// ======================================================
db.ref('chats').on('child_added', async (chatSnap) => {
    const chatId = chatSnap.key;
    
    db.ref(`chats/${chatId}`).limitToLast(1).on('child_added', async (msgSnap) => {
        const message = msgSnap.val();
        
        // كلمات تحتاج مراقبة
        const riskyKeywords = [
            'تحويل مباشر', 'خارج النظام', 'واتساب فقط', 'بدون وسيط',
            'فلوس مباشرة', 'خاص', 'خاصة', 'خارج التطبيق'
        ];
        
        const foundKeyword = riskyKeywords.find(keyword => 
            message.text && message.text.includes(keyword)
        );
        
        if (foundKeyword) {
            console.log(`🚨 كشف نزاع في الدردشة ${chatId}: "${foundKeyword}"`);
            
            // إشعار المشرفين
            await notifyAdmins('chat_dispute', {
                chatId: chatId,
                messageId: msgSnap.key,
                senderId: message.senderId,
                senderName: message.senderName,
                keyword: foundKeyword,
                message: message.text,
                timestamp: message.date
            });
        }
    });
});

// ======================================================
// [11] نظام رفع الصور
// ======================================================
app.post('/api/upload', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "لم يتم اختيار صورة" });
        }
        
        console.log(`📤 رفع صورة: ${req.file.originalname} - ${req.file.size} bytes`);
        
        const form = new FormData();
        form.append('image', req.file.buffer.toString('base64'));
        
        const response = await axios.post(
            `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, 
            form,
            { headers: form.getHeaders() }
        );
        
        if (response.data && response.data.data && response.data.data.url) {
            console.log(`✅ تم رفع الصورة: ${response.data.data.url}`);
            res.status(200).json({ 
                url: response.data.data.url,
                deleteUrl: response.data.data.delete_url
            });
        } else {
            throw new Error('استجابة غير صالحة من ImgBB');
        }
        
    } catch (e) {
        console.error("Upload Error:", e.message);
        res.status(500).json({ error: "فشل الرفع: " + e.message });
    }
});

// ======================================================
// [12] دوال مساعدة
// ======================================================

// إرسال إشعار للمستخدم
function sendAlert(uid, message) {
    if (!uid || !message) return;
    
    db.ref(`alerts/${uid}`).push({ 
        msg: message, 
        date: admin.database.ServerValue.TIMESTAMP 
    }).catch(error => {
        console.error('Error sending alert:', error);
    });
}

// إشعار المشرفين
async function notifyAdmins(type, data) {
    try {
        const adminsSnap = await db.ref('users').orderByChild('role').equalTo('admin').once('value');
        const admins = adminsSnap.val();
        
        if (admins) {
            Object.keys(admins).forEach(adminId => {
                db.ref(`admin_notifications/${adminId}`).push({
                    type: type,
                    data: data,
                    date: Date.now(),
                    read: false
                });
            });
        }
    } catch (e) {
        console.error("Notify Admins Error:", e.message);
    }
}

// ======================================================
// [13] إعادة جدولة VIP المنتهية
// ======================================================
setInterval(async () => {
    try {
        const now = Date.now();
        const usersSnap = await db.ref('users').once('value');
        const users = usersSnap.val();
        
        if (users) {
            Object.entries(users).forEach(async ([uid, user]) => {
                if (user.vipStatus === 'active' && user.vipExpiry && user.vipExpiry < now) {
                    await db.ref(`users/${uid}`).update({
                        vipStatus: 'expired'
                    });
                    sendAlert(uid, `⚠️ اشتراك VIP الخاص بك انتهى. يمكنك تجديده من قسم VIP.`);
                    console.log(`ℹ️ VIP انتهى للمستخدم: ${uid}`);
                }
            });
        }
    } catch (e) {
        console.error("VIP Expiry Check Error:", e.message);
    }
}, 3600000); // كل ساعة

// ======================================================
// [14] نقطة الاختبار
// ======================================================
app.get('/api/health', (req, res) => {
    res.status(200).json({ 
        status: 'online',
        timestamp: Date.now(),
        service: 'SDM Market Bot',
        version: '3.0'
    });
});

app.get('/api/stats', async (req, res) => {
    try {
        const usersCount = (await db.ref('users').once('value')).numChildren();
        const transactionsCount = (await db.ref('transactions').once('value')).numChildren();
        const activeRequests = (await db.ref('bank_transfer_requests').orderByChild('status').equalTo('processing').once('value')).numChildren();
        
        res.status(200).json({
            users: usersCount,
            transactions: transactionsCount,
            activeBankRequests: activeRequests,
            uptime: process.uptime()
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ======================================================
// [15] تشغيل السيرفر
// ======================================================
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>🚀 SDM Secure Bot</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #0f172a; color: white; }
                .container { max-width: 800px; margin: 0 auto; }
                h1 { color: #3b82f6; }
                .status { background: #1e293b; padding: 20px; border-radius: 10px; margin: 20px 0; }
                .online { color: #10b981; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🚀 SDM Secure Bot v3.0</h1>
                <div class="status">
                    <p>✅ البوت يعمل بشكل طبيعي</p>
                    <p>🔄 جاري مراقبة المعاملات والطلبات</p>
                    <p class="online">● النظام متصل وقيد التشغيل</p>
                </div>
                <p>📊 <a href="/api/stats" style="color: #3b82f6;">عرض الإحصائيات</a></p>
                <p>🏥 <a href="/api/health" style="color: #3b82f6;">فحص حالة النظام</a></p>
            </div>
        </body>
        </html>
    `);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`🚀 SDM Secure Bot v3.0`);
    console.log(`📡 يعمل على المنفذ: ${PORT}`);
    console.log(`🕒 وقت البدء: ${new Date().toLocaleString()}`);
    console.log(`✅ جاهز لاستقبال الطلبات...`);
    console.log(`=========================================`);
});

// معالجة الأخطاء غير المتوقعة
process.on('uncaughtException', (error) => {
    console.error('❌ خطأ غير متوقع:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ وعد مرفوض:', reason);
});
