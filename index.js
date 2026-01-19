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

    console.log("✅ بوت السودان يعمل الآن - جميع المحركات مفعلة (تنظيف، تحويل، VIP، وسيط)");
} catch (error) {
    console.error("❌ فشل تشغيل Firebase:", error.message);
    process.exit(1);
}

const db = admin.database();
let isProcessing = false;

/**
 * 2. محرك تنظيف المنشورات (كل يومين)
 */
async function cleanupOldPosts() {
    console.log("[CLEANUP] جاري فحص وحذف المنشورات التي تجاوزت 48 ساعة...");
    const now = Date.now();
    const twoDaysAgo = now - (2 * 24 * 60 * 60 * 1000);

    try {
        const collections = ['posts', 'vip_posts'];
        for (const col of collections) {
            const ref = db.ref(col);
            const oldSnap = await ref.orderByChild('date').endAt(twoDaysAgo).once('value');
            
            if (oldSnap.exists()) {
                const count = oldSnap.numChildren();
                const updates = {};
                Object.keys(oldSnap.val()).forEach(key => updates[key] = null);
                await ref.update(updates);
                console.log(`[CLEANUP] تم حذف ${count} منشور من ${col}.`);
            }
        }
    } catch (e) {
        console.error("Cleanup Error:", e.message);
    }
}

/**
 * 3. محرك اشتراكات VIP
 */
async function processVipSubscriptions() {
    const vipRef = db.ref('requests/vip_subscriptions');
    const snap = await vipRef.orderByChild('status').equalTo('pending').limitToFirst(5).once('value');
    
    if (!snap.exists()) return;

    const tasks = snap.val();
    for (const id in tasks) {
        const { userId, days, cost } = tasks[id];
        try {
            const userRef = db.ref(`users/${userId}`);
            await userRef.transaction((current) => {
                if (current && (current.sdmBalance || 0) >= cost) {
                    const now = Date.now();
                    const currentExpiry = (current.vipExpiry && current.vipExpiry > now) ? current.vipExpiry : now;
                    current.sdmBalance -= cost;
                    current.vipStatus = 'active';
                    current.vipExpiry = currentExpiry + (days * 24 * 60 * 60 * 1000);
                    return current;
                }
                return; 
            }).then(async (result) => {
                if (result.committed) {
                    await vipRef.child(id).update({ status: 'completed' });
                    db.ref(`alerts/${userId}`).push({
                        msg: `✨ تم تفعيل VIP لمدة ${days} يوم بنجاح.`,
                        type: 'success', date: Date.now()
                    });
                } else {
                    await vipRef.child(id).update({ status: 'failed', reason: 'رصيد غير كافٍ' });
                }
            });
        } catch (e) { console.error("VIP Error:", e.message); }
    }
}

/**
 * 4. محرك التحويلات المباشرة بين المستخدمين
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
            const senderRef = db.ref(`users/${from}/sdmBalance`);
            
            await senderRef.transaction(current => {
                if (current >= amount) return current - amount;
                return;
            }).then(async (res) => {
                if (res.committed) {
                    const now = Date.now();
                    await db.ref(`users/${receiverUid}/sdmBalance`).transaction(c => (c || 0) + Number(amount));
                    await transfersRef.child(id).update({ status: 'completed' });
                    await db.ref(`transactions/${id}`).set({ from, to: receiverUid, amount, type: 'transfer', date: now });
                    db.ref(`alerts/${receiverUid}`).push({ msg: `💰 استلمت ${amount} SDM.`, type: 'success', date: now });
                } else {
                    await transfersRef.child(id).update({ status: 'failed', reason: 'رصيد غير كافٍ' });
                }
            });
        } catch (err) { console.error("Transfer Error:", err.message); }
    }
}

/**
 * 5. محرك الوسيط (البيع الآمن)
 * يقوم بتحويل المال المحجوز للبائع بعد تأكيد المشتري
 */
async function processEscrowDeals() {
    const escrowRef = db.ref('requests/escrow_deals');
    const snap = await escrowRef.orderByChild('status').equalTo('confirmed_by_buyer').once('value');
    
    if (!snap.exists()) return;

    const deals = snap.val();
    for (const id in deals) {
        const { sellerId, amount, itemTitle, buyerName, buyerId } = deals[id];
        try {
            // تحويل المبلغ للبائع
            await db.ref(`users/${sellerId}/sdmBalance`).transaction(c => (c || 0) + Number(amount));
            
            // إغلاق الصفقة
            await escrowRef.child(id).update({ status: 'completed', completedAt: Date.now() });

            // إشعار للبائع
            db.ref(`alerts/${sellerId}`).push({
                msg: `✅ استلمت ${amount} SDM مقابل: ${itemTitle}. تم التأكيد من المشتري.`,
                type: 'success', date: Date.now()
            });

            // سجل العملية
            db.ref(`transactions/escrow_${id}`).set({
                from: buyerId, to: sellerId, amount, type: 'escrow_payout', date: Date.now(), item: itemTitle
            });

            console.log(`[ESCROW] صفقة مكتملة: تم تحويل ${amount} للبائع ${sellerId}`);
        } catch (e) { console.error("Escrow Engine Error:", e.message); }
    }
}

/**
 * 6. تشغيل المحركات والمؤقتات
 */
setInterval(async () => {
    if (isProcessing) return;
    isProcessing = true;
    try {
        await processVipSubscriptions();
        await processSecureTransfers();
        await processEscrowDeals();
    } catch (err) { console.error("Engine Loop Error:", err.message); }
    isProcessing = false;
}, 5000); 

// تشغيل تنظيف المنشورات كل ساعة
setInterval(cleanupOldPosts, 3600000); 
cleanupOldPosts(); // تشغيل فوري عند البدء

// خادم الويب لإبقاء الخدمة تعمل في Render
const server = http.createServer((req, res) => {
    res.end('Sudan Market Smart Bot is Running ✅');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT);
