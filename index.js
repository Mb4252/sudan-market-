const admin = require('firebase-admin');
const express = require('express');
const app = express();

// --- 1. إعداد الاتصال بـ Firebase ---
// تأكد من وضع بيانات ملف الـ JSON الخاص بك في متغير بيئة أو استبدال المسار هنا
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");

if (!serviceAccount.project_id) {
    console.error("❌ خطأ: لم يتم العثور على ملف FIREBASE_SERVICE_ACCOUNT");
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
});

const db = admin.database();
console.log("🚀 SDM Market Bot Started | Waiting for transactions...");

// --- 2. دالة إرسال التنبيهات ---
function sendAlert(uid, msg, type = 'success') {
    db.ref(`alerts/${uid}`).push({
        msg,
        type,
        date: admin.database.ServerValue.TIMESTAMP
    });
}

// --- 3. محرك التحويلات المباشرة (حل مشكلة الرقم التعريفي) ---
async function processTransfers() {
    const transRef = db.ref('requests/transfers');
    try {
        const snap = await transRef.orderByChild('status').equalTo('pending').once('value');
        if (!snap.exists()) return;

        for (const [id, t] of Object.entries(snap.val())) {
            const amount = parseFloat(t.amount);
            const targetNumericId = String(t.toId).trim(); // التأكد من أنه نص بدون مسافات

            console.log(`🔍 فحص طلب تحويل: من ${t.fromName} إلى ID: ${targetNumericId}`);

            // البحث عن المستلم (البحث بالنص وبالرقم لضمان النتيجة)
            let userQuery = await db.ref('users').orderByChild('numericId').equalTo(targetNumericId).once('value');
            if (!userQuery.exists()) {
                userQuery = await db.ref('users').orderByChild('numericId').equalTo(Number(targetNumericId)).once('value');
            }

            if (userQuery.exists()) {
                const targetUid = Object.keys(userQuery.val())[0];
                const targetData = Object.values(userSnap.val())[0];

                // تنفيذ المعاملة المالية الآمنة
                const senderBalRef = db.ref(`users/${t.from}/sdmBalance`);
                const receiverBalRef = db.ref(`users/${targetUid}/sdmBalance`);

                // خصم من المرسل أولاً
                const deductTx = await senderBalRef.transaction(current => {
                    if (current === null) return 0;
                    if (parseFloat(current) >= amount) {
                        return parseFloat((parseFloat(current) - amount).toFixed(2));
                    }
                    return; // رصيد غير كافٍ
                });

                if (deductTx.committed) {
                    // إضافة للمستلم
                    await receiverBalRef.transaction(c => parseFloat(((c || 0) + amount).toFixed(2)));

                    // تسجيل في سجل المعاملات العام
                    await db.ref('transactions').push({
                        from: t.from,
                        to: targetUid,
                        amount: amount,
                        date: admin.database.ServerValue.TIMESTAMP,
                        type: 'direct_transfer'
                    });

                    // تحديث حالة الطلب وإرسال تنبيهات
                    await transRef.child(id).update({ status: 'completed' });
                    sendAlert(targetUid, `💰 استلمت ${amount} SDM من ${t.fromName}`, 'success');
                    sendAlert(t.from, `✅ تم تحويل ${amount} SDM إلى ${targetData.n} بنجاح`, 'success');
                    
                    console.log(`✅ تحويل ناجح: ${amount} SDM إلى ${targetData.n}`);
                } else {
                    await transRef.child(id).update({ status: 'failed_insufficient_funds' });
                    sendAlert(t.from, `❌ فشل: رصيدك غير كافٍ للتحويل`, 'error');
                    console.log(`❌ فشل: رصيد غير كافٍ للمرسل ${t.fromName}`);
                }
            } else {
                await transRef.child(id).update({ status: 'failed_user_not_found' });
                sendAlert(t.from, `❌ فشل: لم يتم العثور على مستخدم بالرقم ${targetNumericId}`, 'error');
                console.log(`❌ فشل: الرقم التعريفي ${targetNumericId} غير موجود`);
            }
        }
    } catch (e) {
        console.error("❗ Error in Transfers:", e.message);
    }
}

// --- 4. محرك تفعيل اشتراكات VIP ---
async function processVIP() {
    const vipRef = db.ref('requests/vip_subscriptions');
    try {
        const snap = await vipRef.orderByChild('status').equalTo('pending').once('value');
        if (!snap.exists()) return;

        for (const [id, v] of Object.entries(snap.val())) {
            const cost = parseFloat(v.cost);
            const userRef = db.ref(`users/${v.userId}`);

            const tx = await userRef.transaction(userData => {
                if (userData && (userData.sdmBalance || 0) >= cost) {
                    const now = Date.now();
                    userData.sdmBalance = parseFloat((userData.sdmBalance - cost).toFixed(2));
                    userData.vipStatus = 'active';
                    userData.vipExpiry = ((userData.vipExpiry > now) ? userData.vipExpiry : now) + (v.days * 86400000);
                    return userData;
                }
            });

            if (tx.committed) {
                await vipRef.child(id).update({ status: 'completed' });
                sendAlert(v.userId, `👑 تم تفعيل اشتراك VIP لمدة ${v.days} يوم بنجاح!`, 'success');
                console.log(`👑 VIP Activated for user: ${v.userName}`);
            } else {
                await vipRef.child(id).update({ status: 'failed_insufficient_funds' });
                sendAlert(v.userId, `❌ فشل تفعيل VIP: رصيدك غير كافٍ`, 'error');
            }
        }
    } catch (e) {
        console.error("❗ Error in VIP Processing:", e.message);
    }
}

// --- 5. تشغيل المجدول (Intervals) ---
// يعمل البوت على فحص القاعدة كل 5 ثوانٍ للتحويلات وكل 15 ثانية للـ VIP
setInterval(processTransfers, 5000);
setInterval(processVIP, 15000);

// --- 6. خادم Express (لإبقاء البوت حياً على Render/Heroku) ---
app.get('/', (req, res) => res.send('SDM Market Bot is Online 🚀'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
