const admin = require('firebase-admin');
const functions = require('firebase-functions');

admin.initializeApp();
const db = admin.database();

/**
 * 1. معالجة التحويلات المالية (من محفظة لمحفظة)
 * يتميز بالأمان العالي ومنع الإنفاق المزدوج
 */
exports.handleTransfers = functions.database.ref('/requests/transfers/{id}')
    .onCreate(async (snapshot) => {
        const { from, to, amount } = snapshot.val();
        
        try {
            // التأكد من وجود حساب المستلم أولاً
            const recipientSnap = await db.ref(`users/${to}`).once('value');
            if (!recipientSnap.exists()) {
                await sendNotification(from, "❌ فشل: حساب المستلم غير موجود");
                return snapshot.ref.remove();
            }

            // تنفيذ الخصم من المرسل (Transaction لضمان الدقة)
            const fromRef = db.ref(`users/${from}`);
            const result = await fromRef.transaction(user => {
                if (user && (user.sdmBalance || 0) >= amount) {
                    user.sdmBalance -= amount;
                    return user;
                }
                return; // إلغاء إذا كان الرصيد غير كافٍ
            });

            if (result.committed) {
                // إضافة الرصيد للمستلم
                await db.ref(`users/${to}/sdmBalance`).transaction(b => (b || 0) + amount);
                
                // تسجيل المعاملة في السجل التاريخي
                await db.ref('transactions').push({
                    from, to, amount, type: 'transfer', date: Date.now()
                });

                await sendNotification(from, `✅ تم تحويل ${amount} SDM بنجاح`);
                await sendNotification(to, `💰 استلمت تحويل بمبلغ ${amount} SDM`);
            } else {
                await sendNotification(from, "❌ فشل التحويل: رصيدك غير كافٍ");
            }
            // حذف الطلب من قائمة الانتظار بعد الانتهاء
            return snapshot.ref.remove();
        } catch (e) {
            console.error("Transfer Error:", e);
        }
    });

/**
 * 2. معالجة التقييمات (حساب المتوسط الحسابي)
 */
exports.processRatings = functions.database.ref('/rating_queue/{id}')
    .onCreate(async (snapshot) => {
        const { target, stars } = snapshot.val();
        try {
            const userRef = db.ref(`users/${target}`);
            await userRef.transaction(u => {
                if (u) {
                    let oldRating = u.rating || 5.0;
                    // معادلة تحديث التقييم المتوسط
                    u.rating = Number(((oldRating + stars) / 2).toFixed(1));
                    return u;
                }
            });
            await sendNotification(target, `⭐ حصلت على تقييم جديد: ${stars} نجوم`);
            return snapshot.ref.remove();
        } catch (e) { console.error(e); }
    });

/**
 * 3. معالجة البلاغات والحظر التلقائي
 */
exports.processReports = functions.database.ref('/user_reports/{id}')
    .onCreate(async (snapshot) => {
        const { offender } = snapshot.val();
        try {
            const userRef = db.ref(`users/${offender}`);
            await userRef.transaction(u => {
                if (u) {
                    u.reportCount = (u.reportCount || 0) + 1;
                    // إذا وصل لـ 5 بلاغات يتم حظره تلقائياً لمدة 24 ساعة
                    if (u.reportCount >= 5) {
                        u.bannedUntil = Date.now() + 86400000;
                    }
                    return u;
                }
            });
            return snapshot.ref.remove();
        } catch (e) { console.error(e); }
    });

// دالة مساعدة لإرسال الإشعارات للمستخدمين داخل التطبيق
async function sendNotification(uid, msg) {
    await db.ref(`alerts/${uid}`).push({
        msg: msg,
        date: Date.now(),
        type: msg.includes('✅') || msg.includes('💰') ? 'success' : 'info'
    });
}
