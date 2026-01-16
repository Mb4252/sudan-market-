const express = require('express');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * 1. تهيئة Firebase Admin
 * تأكد من إضافة المتغير البيئي FIREBASE_SERVICE_ACCOUNT في الاستضافة
 */
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
    });
} catch (e) {
    console.error("❌ خطأ: لم يتم العثور على ملف مفاتيح Firebase (Service Account)");
}

const db = admin.database();

// ===== [وظائف البوت الأساسية] =====

// 1. معالجة تحويلات الرصيد (Transfers)
async function processTransfers() {
    const transfersRef = db.ref('requests/transfers');
    const snap = await transfersRef.orderByChild('status').equalTo('pending').once('value');
    
    if (!snap.exists()) return;

    for (const [id, task] of Object.entries(snap.val())) {
        try {
            const { from, to, amount } = task;
            
            // جلب بيانات الحسابات
            const fromRef = db.ref(`users/${from}`);
            const toRef = db.ref(`users/${to}`);
            
            const [fromSnap, toSnap] = await Promise.all([fromRef.once('value'), toRef.once('value')]);

            if (!fromSnap.exists() || !toSnap.exists()) {
                await transfersRef.child(id).update({ status: 'failed', error: 'أحد المستخدمين غير موجود' });
                continue;
            }

            const fromBal = fromSnap.val().sdmBalance || 0;
            const toBal = toSnap.val().sdmBalance || 0;

            if (fromBal < amount) {
                await transfersRef.child(id).update({ status: 'failed', error: 'رصيد غير كافٍ' });
                continue;
            }

            // تنفيذ العملية (خصم وإضافة)
            await fromRef.update({ sdmBalance: fromBal - amount });
            await toRef.update({ sdmBalance: toBal + amount });

            // تسجيل في السجل العام
            await db.ref('transactions').push({
                from, to, amount,
                type: 'transfer',
                date: Date.now()
            });

            // تحديث حالة الطلب
            await transfersRef.child(id).update({ status: 'completed', processedAt: Date.now() });

            // إرسال تنبيهات (ستظهر للمستخدم في التطبيق)
            await db.ref(`alerts/${from}`).push({ msg: `✅ تم تحويل ${amount} SDM بنجاح`, type: 'info', date: Date.now() });
            await db.ref(`alerts/${to}`).push({ msg: `💰 استلمت تحويل بقيمة ${amount} SDM`, type: 'success', date: Date.now() });

            console.log(`✅ تم التحويل: ${amount} من ${from} إلى ${to}`);
        } catch (err) {
            console.error(`❌ خطأ في معالجة التحويل ${id}:`, err);
        }
    }
}

// 2. معالجة التقييمات وتحديث النجوم (Ratings)
async function processRatings() {
    const queueRef = db.ref('rating_queue');
    const snap = await queueRef.once('value');
    if (!snap.exists()) return;

    for (const [id, rating] of Object.entries(snap.val())) {
        try {
            const { target, stars } = rating;
            const userRef = db.ref(`users/${target}`);
            const userSnap = await userRef.once('value');

            if (userSnap.exists()) {
                const data = userSnap.val();
                const currentRating = data.rating || 5;
                const count = data.ratingCount || 0;
                
                // معادلة المعدل التراكمي
                const newRating = ((currentRating * count) + stars) / (count + 1);

                await userRef.update({
                    rating: parseFloat(newRating.toFixed(1)),
                    ratingCount: count + 1
                });
                
                await db.ref(`alerts/${target}`).push({ msg: `⭐ حصلت على تقييم جديد (${stars} نجوم)`, type: 'success', date: Date.now() });
            }
            await queueRef.child(id).remove(); // حذف من الطابور بعد المعالجة
        } catch (err) { console.error("Rating Error:", err); }
    }
}

// 3. معالجة البلاغات والحظر التلقائي (Reports)
async function processReports() {
    const reportsRef = db.ref('user_reports');
    const snap = await reportsRef.orderByChild('status').equalTo('pending').once('value');
    if (!snap.exists()) return;

    for (const [id, report] of Object.entries(snap.val())) {
        try {
            const { offender, reason } = report;
            const userRef = db.ref(`users/${offender}`);
            const userSnap = await userRef.once('value');

            if (userSnap.exists()) {
                const reportCount = (userSnap.val().reportCount || 0) + 1;
                let updateData = { reportCount: reportCount };

                // إذا وصل لـ 3 بلاغات يتم الحظر تلقائياً لمدة 7 أيام
                if (reportCount >= 3) {
                    updateData.bannedUntil = Date.now() + (7 * 24 * 60 * 60 * 1000);
                    updateData.banReason = "تعدد البلاغات (تلقائي)";
                    await db.ref(`alerts/${offender}`).push({ msg: `⛔ تم حظر حسابك لمدة 7 أيام بسبب البلاغات`, type: 'error', date: Date.now() });
                }

                await userRef.update(updateData);
                await reportsRef.child(id).update({ status: 'processed' });
                console.log(`🚩 معالجة بلاغ ضد: ${offender} (البلاغات الحالية: ${reportCount})`);
            }
        } catch (err) { console.error("Report Error:", err); }
    }
}

// 4. تنظيف اشتراكات VIP والمنشورات المنتهية
async function cleanupVIP() {
    const now = Date.now();
    
    // تنظيف المستخدمين
    const usersSnap = await db.ref('users').orderByChild('vipStatus').equalTo('active').once('value');
    if (usersSnap.exists()) {
        for (const [uid, user] of Object.entries(usersSnap.val())) {
            if (user.vipExpiry && user.vipExpiry < now) {
                await db.ref(`users/${uid}`).update({ vipStatus: 'expired' });
                await db.ref(`alerts/${uid}`).push({ msg: `💔 انتهى اشتراك VIP الخاص بك`, type: 'info', date: now });
            }
        }
    }

    // تنظيف منشورات VIP (إذا كانت مرتبطة بمدة)
    const vipPostsSnap = await db.ref('vip_posts').once('value');
    if (vipPostsSnap.exists()) {
        for (const [postId, post] of Object.entries(vipPostsSnap.val())) {
            if (post.date && post.date < (now - 30 * 24 * 60 * 60 * 1000)) { // حذف تلقائي بعد 30 يوم
                await db.ref(`vip_posts/${postId}`).remove();
            }
        }
    }
}

// 5. الصيانة الدورية (حذف التنبيهات القديمة)
async function maintenance() {
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    // سيقوم النظام تلقائياً بمسح التنبيهات من التطبيق بمجرد قراءتها، 
    // لكن هذه الدالة كإجراء احتياطي فقط.
    console.log("🔧 تنظيف وصيانة النظام...");
}

// ===== [محرك التشغيل الرئيسي] =====

async function startBot() {
    console.log("🤖 بوت SDM Market يعمل الآن...");
    
    // دورة معالجة كل 5 ثواني
    setInterval(async () => {
        await processTransfers();
        await processRatings();
        await processReports();
    }, 5000);

    // دورة صيانة كل ساعة
    setInterval(async () => {
        await cleanupVIP();
        await maintenance();
    }, 3600000);
}

// ===== [إعدادات السيرفر] =====

app.use(express.json());

app.get('/', (req, res) => {
    res.send('SDM Market Bot is Running 🚀');
});

// نقطة فحص الحالة (Health Check)
app.get('/status', async (req, res) => {
    res.json({
        online: true,
        time: new Date().toISOString(),
        tasks: ['Transfers', 'Ratings', 'Reports', 'VIP-Cleanup']
    });
});

app.listen(PORT, () => {
    startBot();
});
