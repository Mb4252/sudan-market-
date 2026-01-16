const admin = require("firebase-admin");
const express = require("express");

const app = express();
app.get("/", (req, res) => res.send("SDM Multi-Bot is Running 🚀"));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));

const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
});

const db = admin.database();
console.log("🤖 SDM Comprehensive Bot Started...");

// 1. معالج التحويلات (كما سبق)
db.ref('transfer_queue').orderByChild('status').equalTo('pending').on('child_added', async (snap) => {
    const id = snap.key;
    const data = snap.val();
    const senderRef = db.ref(`users/${data.from}/sdmBalance`);
    const receiverRef = db.ref(`users/${data.to}/sdmBalance`);

    try {
        const result = await senderRef.transaction((current) => {
            if (current >= data.amount) return current - data.amount;
            return; 
        });

        if (result.committed) {
            await receiverRef.transaction((current) => (current || 0) + data.amount);
            await db.ref(`transfer_queue/${id}`).update({ status: 'completed', doneAt: admin.database.ServerValue.TIMESTAMP });
            await db.ref(`alerts/${data.to}`).set({ msg: `✅ استلمت ${data.amount} SDM من ${data.senderName}`, time: Date.now(), type: 'success' });
        } else {
            await db.ref(`transfer_queue/${id}`).update({ status: 'failed', reason: 'Insufficient funds' });
        }
    } catch (e) { console.error("Transfer Error:", e); }
});

// 2. معالج التقييمات (حساب متوسط النجوم تلقائياً)
// هذا الجزء يراقب أي تقييم جديد ويقوم بتحديث "نجوم" البائع فوراً
db.ref('ratings').on('child_changed', (snap) => updateUserRating(snap.key));
db.ref('ratings').on('child_added', (snap) => updateUserRating(snap.key));

async function updateUserRating(targetUid) {
    console.log(`⭐ إعادة حساب تقييم المستخدم: ${targetUid}`);
    const ratingsSnap = await db.ref(`ratings/${targetUid}`).once('value');
    if (!ratingsSnap.exists()) return;

    const allRatings = ratingsSnap.val();
    const keys = Object.keys(allRatings);
    const sum = keys.reduce((acc, key) => acc + allRatings[key].stars, 0);
    const average = sum / keys.length;

    // تحديث رقم التقييم في ملف المستخدم
    await db.ref(`users/${targetUid}`).update({
        rating: parseFloat(average.toFixed(1)),
        ratingCount: keys.length
    });
}

// 3. معالج البلاغات (تنبيه الإدارة وحماية النظام)
db.ref('reports').on('child_added', async (snap) => {
    const report = snap.val();
    const reportId = snap.key;
    
    console.log(`🚩 بلاغ جديد ضد: ${report.reported}`);

    // تحديث عداد البلاغات للمستخدم المشكو فيه
    const reportedUserRef = db.ref(`users/${report.reported}/reportCount`);
    await reportedUserRef.transaction((current) => (current || 0) + 1);

    // إذا وصل المستخدم لـ 5 بلاغات، يتم تمييزه للإدارة
    reportedUserRef.once('value', async (countSnap) => {
        if (countSnap.val() >= 5) {
            await db.ref(`alerts/admin_notices`).push({
                msg: `⚠️ تحذير: المستخدم ${report.reported} تلقى أكثر من 5 بلاغات!`,
                time: Date.now()
            });
        }
    });

    // إرسال إشعار لك كأدمن (في عقدة خاصة ببريدك)
    await db.ref(`alerts/mb425262@gmail.com`).set({
        msg: `🚩 بلاغ جديد من ${report.reporter} ضد ${report.reported}: ${report.reason}`,
        time: Date.now(),
        type: 'warning'
    });
});
