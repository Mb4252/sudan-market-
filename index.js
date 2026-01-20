const admin = require('firebase-admin');
const express = require('express');
const app = express();

console.log("🚀 جاري بدء تشغيل البوت...");

// 1. جلب بيانات Firebase من متغيرات البيئة
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const DB_URL = "https://sudan-market-6b122-default-rtdb.firebaseio.com";

try {
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: DB_URL
        });
        console.log("✅ تم الاتصال بقاعدة بيانات فيربيز بنجاح.");
    }
} catch (error) {
    console.error("❌ خطأ في تهيئة فيربيز:", error.message);
}

const db = admin.database();

// دالة إرسال التنبيهات
function sendAlert(uid, msg, type = 'success') {
    db.ref(`alerts/${uid}`).push({
        msg: msg, type: type, date: admin.database.ServerValue.TIMESTAMP
    });
}

/**
 * المحرك الرئيسي للبوت
 */
async function startEngine() {
    console.log("--- 🔍 فحص المحرك الآن (" + new Date().toLocaleTimeString() + ") ---");
    
    try {
        const escRef = db.ref('requests/escrow_deals');

        // أ. معالجة الحجز (Securing)
        const lockSnap = await escRef.orderByChild('status').equalTo('pending_delivery').once('value');
        if (lockSnap.exists()) {
            console.log(`[وسيط] وجد ${lockSnap.numChildren()} طلبات حجز.`);
            const deals = lockSnap.val();
            for (const id in deals) {
                const d = deals[id];
                const amount = parseFloat(d.amount);
                const result = await db.ref(`users/${d.buyerId}`).transaction(u => {
                    if (!u) return u;
                    if ((u.sdmBalance || 0) < amount) return undefined;
                    u.sdmBalance = Number((u.sdmBalance - amount).toFixed(2));
                    return u;
                });
                if (result.committed) {
                    await escRef.child(id).update({ status: 'secured', updatedAt: admin.database.ServerValue.TIMESTAMP });
                    await db.ref(`${d.path}/${d.postId}`).update({ pending: true, buyerId: d.buyerId });
                    console.log(`✅ تم حجز المبلغ للصفقة: ${id}`);
                }
            }
        }

        // ب. معالجة التحرير (Release) - المشكلة التي تشتكي منها
        const releaseSnap = await escRef.orderByChild('status').equalTo('confirmed_by_buyer').once('value');
        if (releaseSnap.exists()) {
            console.log(`[وسيط] 🔥 وجد صفقات مؤكدة بانتظار التحرير!`);
            const deals = releaseSnap.val();
            for (const id in deals) {
                const d = deals[id];
                const amount = parseFloat(d.amount);

                console.log(`[تحرير] جاري دفع ${amount} للبائع ${d.sellerId}`);

                // 1. تحويل المال للبائع
                await db.ref(`users/${d.sellerId}/sdmBalance`).transaction(curr => Number(((curr || 0) + amount).toFixed(2)));

                // 2. تحديث المنشور
                if (d.path && d.postId) {
                    await db.ref(`${d.path}/${d.postId}`).update({ sold: true, pending: false });
                    console.log(`[بيع] تم تحديث المنشور ${d.postId} لتم البيع.`);
                }

                // 3. إغلاق الصفقة
                await escRef.child(id).update({ status: 'completed', completedAt: admin.database.ServerValue.TIMESTAMP });
                
                sendAlert(d.sellerId, `💰 استلمت ${amount} SDM مقابل بيع [${d.itemTitle}]`, 'success');
                sendAlert(d.buyerId, `✅ تم تحويل المال للبائع بنجاح.`, 'success');
                console.log(`✅ اكتملت الصفقة ${id}`);
            }
        }

        // ج. معالجة التحويلات والـ VIP
        // (يمكن إضافة أكوادهم هنا بنفس الطريقة)

    } catch (err) {
        console.error("❌ خطأ في المحرك:", err.message);
    }
}

// تشغيل المحرك فوراً عند بدء البوت
startEngine();

// ثم تشغيله كل 15 ثانية بشكل دوري
setInterval(startEngine, 15000);

app.get('/', (req, res) => res.send('Bot is Alive! 🚀'));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`✅ السيرفر يعمل على منفذ: ${PORT}`);
});
