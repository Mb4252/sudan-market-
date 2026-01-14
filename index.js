const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.database();

// 1. معالجة التحويلات المالية (بأمان تام)
exports.handleTransfers = functions.database.ref('/requests/transfers/{id}')
    .onCreate(async (snapshot, context) => {
        const data = snapshot.val();
        const { from, to, amount } = data;

        if (from === to) return snapshot.ref.remove(); // منع التحويل للنفس

        const fromRef = db.ref(`users/${from}`);
        const toRef = db.ref(`users/${to}`);

        try {
            // تنفيذ العملية بنظام Transaction لضمان عدم ضياع القرش
            const result = await fromRef.transaction(currentData => {
                if (currentData && (currentData.sdmBalance || 0) >= amount) {
                    currentData.sdmBalance -= amount;
                    return currentData;
                }
                return; // إلغاء العملية إذا لم يكفِ الرصيد
            });

            if (result.committed) {
                // إضافة الرصيد للمستلم
                await toRef.child('sdmBalance').transaction(bal => (bal || 0) + amount);

                // تسجيل المعاملة في السجل التاريخي
                await db.ref('transactions').push({
                    from, to, amount,
                    type: 'transfer',
                    date: admin.database.ServerValue.TIMESTAMP
                });

                // إرسال إشعارات
                await sendNotification(from, `✅ تم تحويل ${amount} SDM بنجاح`);
                await sendNotification(to, `💰 استلمت تحويل بمبلغ ${amount} SDM`);
                
                // حذف الطلب بعد النجاح
                return snapshot.ref.remove();
            } else {
                await sendNotification(from, "❌ فشل التحويل: رصيدك غير كافٍ");
                return snapshot.ref.remove();
            }
        } catch (error) {
            console.error("Transfer Error:", error);
            // في حالة الخطأ القاتل، نترك الطلب للمراجعة اليدوية ولا نحذفه لضمان الحقوق
        }
    });

// 2. معالجة التقييمات تلقائياً
exports.processRatings = functions.database.ref('/rating_queue/{id}')
    .onCreate(async (snapshot) => {
        const { target, stars } = snapshot.val();
        const userRef = db.ref(`users/${target}`);

        await userRef.transaction(u => {
            if (u) {
                let currentRating = u.rating || 5.0;
                // معادلة بسيطة للمتوسط الحسابي
                u.rating = Number(((currentRating + stars) / 2).toFixed(1));
            }
            return u;
        });

        await sendNotification(target, `⭐ حصلت على تقييم جديد: ${stars} نجوم`);
        return snapshot.ref.remove();
    });

// 3. نظام الحماية التلقائي (البلاغات)
exports.processReports = functions.database.ref('/user_reports/{id}')
    .onCreate(async (snapshot) => {
        const { offender } = snapshot.val();
        const userRef = db.ref(`users/${offender}`);

        await userRef.transaction(u => {
            if (u) {
                u.reportCount = (u.reportCount || 0) + 1;
                // حظر تلقائي لمدة 24 ساعة إذا وصل لـ 5 بلاغات
                if (u.reportCount >= 5) {
                    u.bannedUntil = Date.now() + 86400000;
                }
            }
            return u;
        });
        return snapshot.ref.remove();
    });

// دالة مساعدة لإرسال الإشعارات داخل التطبيق
async function sendNotification(uid, msg) {
    const type = msg.includes('✅') || msg.includes('💰') ? 'success' : 'error';
    return db.ref(`alerts/${uid}`).push({
        msg,
        type,
        date: admin.database.ServerValue.TIMESTAMP
    });
}
