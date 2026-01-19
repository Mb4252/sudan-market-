const admin = require('firebase-admin');
const http = require('http');

/**
 * 1. إعداد الاتصال بقاعدة البيانات Firebase
 */
try {
    const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountRaw) {
        console.error("❌ خطأ: لم يتم العثور على متغير البيئة FIREBASE_SERVICE_ACCOUNT");
        process.exit(1);
    }

    const serviceAccount = JSON.parse(serviceAccountRaw);
    if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
    });

    console.log("✅ البوت يعمل الآن - نظام التنظيف كل يومين مفعل.");
} catch (error) {
    console.error("❌ فشل تشغيل Firebase:", error.message);
    process.exit(1);
}

const db = admin.database();
let isProcessing = false;

/**
 * 2. وظيفة تنظيف المنشورات (كل يومين)
 * تمسح المنشورات العادية و VIP التي مر عليها 48 ساعة
 */
async function cleanupOldPosts() {
    console.log("[CLEANUP] جاري التحقق من المنشورات القديمة...");
    const now = Date.now();
    const twoDaysAgo = now - (2 * 24 * 60 * 60 * 1000); // طرح 48 ساعة بالملي ثانية

    try {
        // تنظيف المنشورات العادية
        const postsRef = db.ref('posts');
        const oldPostsSnap = await postsRef.orderByChild('date').endAt(twoDaysAgo).once('value');
        
        if (oldPostsSnap.exists()) {
            const count = oldPostsSnap.numChildren();
            await postsRef.update(Object.keys(oldPostsSnap.val()).reduce((acc, key) => {
                acc[key] = null; 
                return acc;
            }, {}));
            console.log(`[CLEANUP] تم حذف ${count} منشور عادي (مر عليها يومان).`);
        }

        // تنظيف منشورات VIP
        const vipPostsRef = db.ref('vip_posts');
        const oldVipPostsSnap = await vipPostsRef.orderByChild('date').endAt(twoDaysAgo).once('value');
        
        if (oldVipPostsSnap.exists()) {
            const countVip = oldVipPostsSnap.numChildren();
            await vipPostsRef.update(Object.keys(oldVipPostsSnap.val()).reduce((acc, key) => {
                acc[key] = null;
                return acc;
            }, {}));
            console.log(`[CLEANUP] تم حذف ${countVip} منشور VIP (مر عليها يومان).`);
        }
    } catch (e) {
        console.error("Cleanup Error:", e.message);
    }
}

/**
 * 3. معالج اشتراكات VIP
 */
async function processVipSubscriptions() {
    const vipRef = db.ref('requests/vip_subscriptions');
    const snap = await vipRef.orderByChild('status').equalTo('pending').limitToFirst(5).once('value');
    
    if (!snap.exists()) return;

    const tasks = snap.val();
    for (const id in tasks) {
        const { userId, days, cost, userName } = tasks[id];
        try {
            const userRef = db.ref(`users/${userId}`);
            const userSnap = await userRef.once('value');
            const userData = userSnap.val();

            if (userData && Number(userData.sdmBalance) >= Number(cost)) {
                const now = Date.now();
                const expiryDate = now + (days * 24 * 60 * 60 * 1000);
                
                const updates = {};
                updates[`users/${userId}/sdmBalance`] = Number(userData.sdmBalance) - Number(cost);
                updates[`users/${userId}/vipStatus`] = 'active';
                updates[`users/${userId}/vipExpiry`] = expiryDate;
                updates[`requests/vip_subscriptions/${id}/status`] = 'completed';

                const alertKey = db.ref(`alerts/${userId}`).push().key;
                updates[`alerts/${userId}/${alertKey}`] = {
                    msg: `✨ تم تفعيل اشتراك VIP لمدة ${days} يوم.`,
                    type: 'success', date: now
                };

                await db.ref().update(updates);
            } else {
                await vipRef.child(id).update({ status: 'failed', reason: 'رصيد غير كافٍ' });
            }
        } catch (e) { console.error("VIP Error:", e.message); }
    }
}

/**
 * 4. معالج التحويلات المالية (بصيغة آمنة)
 */
async function processSecureTransfers() {
    const transfersRef = db.ref('requests/transfers');
    const snap = await transfersRef.orderByChild('status').equalTo('pending').limitToFirst(10).once('value');
    
    if (!snap.exists()) return;

    const tasks = snap.val();
    for (const id in tasks) {
        const { from, toId, amount } = tasks[id];
        try {
            const userQuery = await db.ref('users').orderByChild('numericId').equalTo(toId).once('value');
            if (!userQuery.exists()) {
                await transfersRef.child(id).update({ status: 'failed', reason: 'المستلم غير موجود' });
                continue;
            }

            const receiverUid = Object.keys(userQuery.val())[0];
            const receiverData = userQuery.val()[receiverUid];
            const senderRef = db.ref(`users/${from}/sdmBalance`);
            
            // استخدام Transaction لمنع ثغرة التكرار
            await senderRef.transaction((currentBalance) => {
                if (currentBalance >= amount) {
                    return currentBalance - amount;
                }
                return; // إلغاء إذا لم يكفِ الرصيد
            }).then(async (result) => {
                if (result.committed) {
                    const now = Date.now();
                    const updates = {};
                    updates[`users/${receiverUid}/sdmBalance`] = (Number(receiverData.sdmBalance) || 0) + Number(amount);
                    updates[`requests/transfers/${id}/status`] = 'completed';
                    updates[`transactions/${id}`] = { from, to: receiverUid, amount, type: 'transfer', date: now };
                    
                    await db.ref().update(updates);
                    db.ref(`alerts/${receiverUid}`).push({ msg: `💰 استلمت ${amount} SDM.`, type: 'success', date: now });
                }
            });
        } catch (err) { console.error("Transfer Error:", err.message); }
    }
}

/**
 * 5. تشغيل المحركات والمؤقتات
 */
setInterval(async () => {
    if (isProcessing) return;
    isProcessing = true;
    try {
        await processVipSubscriptions();
        await processSecureTransfers();
    } catch (err) { console.error("Engine Error:", err.message); }
    isProcessing = false;
}, 5000); 

// تشغيل تنظيف المنشورات كل ساعة (ليفحص التوقيت)
setInterval(cleanupOldPosts, 3600000); 

// تشغيل التنظيف فوراً عند بدء تشغيل البوت
cleanupOldPosts();

const server = http.createServer((req, res) => {
    res.end('Sudan Market Bot with 2-Day Auto-Cleanup is Running ✅');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT);
