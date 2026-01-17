const express = require('express');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. تهيئة Firebase Admin
// تأكد من وجود ملف serviceAccountKey.json في نفس المجلد أو استخدام متغيرات البيئة
try {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT 
        ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) 
        : require("./serviceAccountKey.json");

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
    });
    console.log("✅ تم الاتصال بقاعدة بيانات Firebase بنجاح");
} catch (e) {
    console.error("❌ خطأ في تهيئة Firebase: تأكد من ملف المفتاح أو متغيرات البيئة");
}

const db = admin.database();
let isBusy = false; // حماية لمنع تداخل العمليات

// ===== [وظائف البوت الاحترافية] =====

// 1. معالجة تحويلات الرصيد (نظام الطلبات الآمن)
async function processTransfers() {
    const transfersRef = db.ref('requests/transfers');
    // جلب الطلبات المنتظرة فقط
    const snap = await transfersRef.orderByChild('status').equalTo('pending').limitToFirst(10).once('value');
    
    if (!snap.exists()) return;

    const tasks = snap.val();
    for (const id in tasks) {
        const { from, to, amount } = tasks[id];
        
        try {
            // استخدام Transaction لضمان الأمان المالي 100% ومنع التلاعب
            const senderBalRef = db.ref(`users/${from}/sdmBalance`);
            
            const result = await senderBalRef.transaction((currentBalance) => {
                // التأكد أن الرصيد رقم وليس Null
                const balance = (currentBalance === null) ? 0 : currentBalance;
                if (balance < amount) return; // إلغاء العملية إذا الرصيد لا يكفي
                return balance - amount;
            });

            if (result.committed) {
                // 1. إضافة الرصيد للمستلم
                await db.ref(`users/${to}/sdmBalance`).transaction((c) => (c || 0) + amount);

                // 2. تحديث حالة الطلب إلى مكتمل
                await transfersRef.child(id).update({ 
                    status: 'completed', 
                    processedAt: Date.now() 
                });

                // 3. تسجيل العملية في سجل التداولات العام
                await db.ref('transactions').push({ 
                    from, to, amount, 
                    type: 'transfer', 
                    date: Date.now() 
                });

                // 4. إرسال تنبيهات فورية للطرفين
                const alertMsg = (uid, msg, type) => db.ref(`alerts/${uid}`).push({ msg, type, date: Date.now() });
                await alertMsg(from, `✅ تم تحويل ${amount} SDM بنجاح.`, 'success');
                await alertMsg(to, `💰 استلمت تحويل بقيمة ${amount} SDM.`, 'success');
                
                console.log(`✅ اكتمل تحويل: ${amount} من ${from} إلى ${to}`);
            } else {
                // فشل الطلب بسبب نقص الرصيد
                await transfersRef.child(id).update({ 
                    status: 'failed', 
                    reason: 'رصيد غير كافٍ',
                    processedAt: Date.now() 
                });
            }
        } catch (err) {
            console.error(`❌ خطأ في معالجة التحويل ${id}:`, err.message);
        }
    }
}

// 2. معالجة التقييمات (إصلاح مشكلة الـ NaN)
async function processRatings() {
    const queueRef = db.ref('rating_queue');
    const snap = await queueRef.limitToFirst(20).once('value');
    if (!snap.exists()) return;

    const ratings = snap.val();
    for (const id in ratings) {
        const { target, stars } = ratings[id];
        try {
            await db.ref(`users/${target}`).transaction((userData) => {
                if (userData) {
                    const currentRating = Number(userData.rating) || 5;
                    const count = Number(userData.ratingCount) || 0;
                    
                    // حساب المتوسط الجديد
                    const newRating = ((currentRating * count) + stars) / (count + 1);
                    
                    // تقريب النتيجة لرقم واحد بعد الفاصلة والتأكد أنها "رقم" وليس "نص"
                    userData.rating = Math.round(newRate * 10) / 10; 
                    userData.ratingCount = count + 1;
                }
                return userData;
            });
            await queueRef.child(id).remove(); // حذف التقييم من الطابور بعد المعالجة
        } catch (err) {
            console.error("❌ خطأ في التقييم:", err.message);
        }
    }
}

// 3. تنظيف المنشورات القديمة (أداء محسن)
async function cleanupOldPosts() {
    console.log("🧹 جاري فحص المنشورات القديمة...");
    const cutoff = Date.now() - (2 * 24 * 60 * 60 * 1000); // 48 ساعة
    const paths = ['posts', 'vip_posts'];

    for (const path of paths) {
        // جلب المنشورات القديمة فقط بدلاً من جلب كل شيء (توفير بيانات)
        const oldPostsSnap = await db.ref(path).orderByChild('date').endAt(cutoff).once('value');
        
        if (oldPostsSnap.exists()) {
            const updates = {};
            oldPostsSnap.forEach(post => {
                updates[`${path}/${post.key}`] = null; // حذف المنشور
                updates[`comments/${path}/${post.key}`] = null; // حذف التعليقات المرتبطة به
            });
            await db.ref().update(updates);
            console.log(`🗑️ تم تنظيف المنشورات القديمة في ${path}`);
        }
    }
}

// 4. تنظيف اشتراكات VIP المنتهية
async function cleanupVIP() {
    const now = Date.now();
    const usersSnap = await db.ref('users').orderByChild('vipStatus').equalTo('active').once('value');
    
    if (usersSnap.exists()) {
        const updates = {};
        usersSnap.forEach(userSnap => {
            const user = userSnap.val();
            if (user.vipExpiry && user.vipExpiry < now) {
                updates[`users/${userSnap.key}/vipStatus`] = 'expired';
                db.ref(`alerts/${userSnap.key}`).push({ 
                    msg: `💔 انتهى اشتراك VIP الخاص بك.`, 
                    type: 'info', 
                    date: now 
                });
            }
        });
        if (Object.keys(updates).length > 0) await db.ref().update(updates);
    }
}

// ===== [المحرك الأساسي] =====

async function startEngine() {
    if (isBusy) return; // منع التداخل إذا كانت الدورة السابقة لم تنتهِ
    isBusy = true;
    
    try {
        await processTransfers();
        await processRatings();
    } catch (e) {
        console.error("⚠️ خطأ في المحرك السريع:", e.message);
    }
    
    isBusy = false;
}

// إعدادات السيرفر البسيطة
app.get('/', (req, res) => res.send('SDM Market Bot is Running... 🚀'));

app.listen(PORT, () => {
    console.log(`🤖 البوت يعمل على المنفذ: ${PORT}`);
    
    // دورة المهام السريعة (كل 5 ثوانٍ): التحويلات والتقييمات
    setInterval(startEngine, 5000);

    // دورة الصيانة (كل ساعة): المنشورات القديمة والـ VIP
    setInterval(async () => {
        try {
            await cleanupOldPosts();
            await cleanupVIP();
        } catch (e) {
            console.error("⚠️ خطأ في الصيانة:", e.message);
        }
    }, 3600000);

    // تنفيذ تنظيف فوري عند التشغيل لمرة واحدة
    cleanupOldPosts();
});
