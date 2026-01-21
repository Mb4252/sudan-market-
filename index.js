const admin = require('firebase-admin');
const express = require('express');
const app = express();

// --- 1. إعداد Firebase ---
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.error("❌ خطأ: FIREBASE_SERVICE_ACCOUNT غير مضبوط.");
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
    console.log("🚀 تم تشغيل بوت الإدارة الذكي (SDM Super Bot)...");
} catch (error) {
    console.error("❌ خطأ في التهيئة:", error.message);
    process.exit(1);
}

const db = admin.database();

// دالة التنبيهات
function sendAlert(uid, msg, type = 'success') {
    if (!uid) return;
    db.ref(`alerts/${uid}`).push({
        msg: msg, type: type, date: admin.database.ServerValue.TIMESTAMP
    });
}

/**
 * [1] محرك الوسيط (Escrow) - (حجز وتحرير الأموال)
 */
async function processEscrow() {
    try {
        const escRef = db.ref('requests/escrow_deals');
        
        // أ. حجز المال
        const pendingLock = await escRef.orderByChild('status').equalTo('pending_delivery').once('value');
        if (pendingLock.exists()) {
            for (const [id, deal] of Object.entries(pendingLock.val())) {
                const amount = parseFloat(deal.amount);
                const result = await db.ref(`users/${deal.buyerId}`).transaction(u => {
                    if (!u) return u;
                    if (parseFloat(u.sdmBalance || 0) < amount) return undefined;
                    u.sdmBalance = parseFloat((u.sdmBalance - amount).toFixed(2));
                    return u;
                });
                if (result.committed) {
                    await escRef.child(id).update({ status: 'secured' });
                    await db.ref(`${deal.path}/${deal.postId}`).update({ pending: true, buyerId: deal.buyerId });
                    sendAlert(deal.buyerId, `🔒 تم حجز ${amount} SDM للوسيط.`, 'info');
                    console.log(`✅ تم حجز مبلغ الصفقة: ${id}`);
                }
            }
        }

        // ب. تحرير المال للبائع
        const pendingRelease = await escRef.orderByChild('status').equalTo('confirmed_by_buyer').once('value');
        if (pendingRelease.exists()) {
            for (const [id, deal] of Object.entries(pendingRelease.val())) {
                const amount = parseFloat(deal.amount);
                await db.ref(`users/${deal.sellerId}/sdmBalance`).transaction(b => parseFloat(((b || 0) + amount).toFixed(2)));
                await escRef.child(id).update({ status: 'completed', completedAt: admin.database.ServerValue.TIMESTAMP });
                
                // تحديث المنشور إلى "مباع" (ليقوم محرك الحذف بمسحه لاحقاً)
                await db.ref(`${deal.path}/${deal.postId}`).update({ sold: true, pending: false });
                
                sendAlert(deal.sellerId, `💰 استلمت ${amount} SDM مقابل بيع: ${deal.itemTitle}`, 'success');
                console.log(`✅ اكتملت الصفقة وتم الدفع للبائع: ${id}`);
            }
        }
    } catch (err) { console.error("Escrow Error:", err.message); }
}

/**
 * [2] محرك التحويلات المالية
 */
async function processTransfers() {
    try {
        const snap = await db.ref('requests/transfers').orderByChild('status').equalTo('pending').once('value');
        if (snap.exists()) {
            for (const [id, req] of Object.entries(snap.val())) {
                const amount = parseFloat(req.amount);
                const targetSnap = await db.ref('users').orderByChild('numericId').equalTo(req.toId).once('value');
                
                if (targetSnap.exists()) {
                    const targetUid = Object.keys(targetSnap.val())[0];
                    const tx = await db.ref(`users/${req.from}`).transaction(u => {
                        if (!u || (u.sdmBalance || 0) < amount) return undefined;
                        u.sdmBalance = parseFloat((u.sdmBalance - amount).toFixed(2));
                        return u;
                    });
                    if (tx.committed) {
                        await db.ref(`users/${targetUid}/sdmBalance`).transaction(b => parseFloat(((b || 0) + amount).toFixed(2)));
                        await db.ref(`requests/transfers/${id}`).update({ status: 'completed' });
                        sendAlert(req.from, `✅ تم تحويل ${amount} إلى ${req.toId}`, 'success');
                        sendAlert(targetUid, `💰 وصلك تحويل بقيمة ${amount}`, 'success');
                    }
                }
            }
        }
    } catch (e) { console.error("Transfer Error:", e.message); }
}

/**
 * [3] محرك تنظيف المنشورات المباعة (جديد)
 * يحذف المنشورات التي تم بيعها نهائياً لتوفير مساحة وتسهيل التصفح
 */
async function cleanupSoldPosts() {
    console.log("🧹 جاري تنظيف المنشورات المباعة...");
    const categories = ['cars', 'electronics', 'realestate', 'services', 'others']; // أضف تصنيفاتك هنا
    for (const cat of categories) {
        const snap = await db.ref(`posts/${cat}`).orderByChild('sold').equalTo(true).once('value');
        if (snap.exists()) {
            for (const [postId, post] of Object.entries(snap.val())) {
                // حذف المنشور
                await db.ref(`posts/${cat}/${postId}`).remove();
                console.log(`🗑️ تم حذف المنشور المباع: ${postId} من قسم ${cat}`);
            }
        }
    }
}

/**
 * [4] محرك فحص اشتراكات VIP المنتهية (جديد)
 */
async function checkExpiredVIP() {
    console.log("👑 فحص اشتراكات VIP...");
    const now = Date.now();
    const usersSnap = await db.ref('users').orderByChild('vipStatus').equalTo('active').once('value');
    
    if (usersSnap.exists()) {
        for (const [uid, user] of Object.entries(usersSnap.val())) {
            if (user.vipExpiry && now > user.vipExpiry) {
                await db.ref(`users/${uid}`).update({
                    vipStatus: 'none',
                    vipExpiry: null
                });
                sendAlert(uid, "⚠️ انتهى اشتراك VIP الخاص بك. قم بالتجديد للتمتع بالمزايا.", "warning");
                console.log(`🚫 تم إنهاء VIP للمستخدم: ${uid}`);
            }
        }
    }
}

/**
 * [5] محرك مراقبة البلاغات (جديد)
 * يحذف المنشور تلقائياً إذا زادت البلاغات عن 5
 */
async function monitorReports() {
    const reportsSnap = await db.ref('reports_summary').once('value'); 
    if (reportsSnap.exists()) {
        for (const [postId, data] of Object.entries(reportsSnap.val())) {
            if (data.count >= 5) { // إذا وصل لـ 5 بلاغات
                await db.ref(`${data.path}/${postId}`).remove(); // حذف المنشور
                await db.ref(`reports_summary/${postId}`).remove(); // حذف سجل البلاغ
                sendAlert(data.ownerId, "🚫 تم حذف منشورك بسبب كثرة بلاغات المستخدمين عنه.", "error");
                console.log(`🛑 تم حذف المنشور المخالف: ${postId}`);
            }
        }
    }
}

/**
 * المجدولات الزمنية (Timers)
 */
// مهام سريعة (كل دقيقة)
setInterval(() => {
    processEscrow();
    processTransfers();
}, 60000); 

// مهام الصيانة (كل ساعة)
setInterval(() => {
    cleanupSoldPosts();
    checkExpiredVIP();
    monitorReports();
}, 3600000); 

// تشغيل عند البدء فوراً
processEscrow();
processTransfers();
cleanupSoldPosts();
checkExpiredVIP();

/**
 * السيرفر
 */
app.get('/', (req, res) => res.send('Bot Status: Healthy & Active 🚀'));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
