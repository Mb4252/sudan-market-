const admin = require('firebase-admin');
const express = require('express');
const app = express();

// --- 1. إعداد الاتصال بـ Firebase ---
// تأكد من وضع ملف الـ JSON الخاص بـ Service Account في متغيرات البيئة
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
    });
    console.log("✅ بوت SDM يعمل بنجاح | نظام الوسيط المطور مفعل");
} catch (error) {
    console.error("❌ خطأ في تشغيل البوت:", error.message);
    process.exit(1);
}

const db = admin.database();

// دالة إرسال التنبيهات للمستخدمين
function sendAlert(uid, msg, type = 'success') {
    db.ref(`alerts/${uid}`).push({
        msg,
        type,
        date: admin.database.ServerValue.TIMESTAMP
    });
}

// --- 2. المحرك المالي والوسيط (Escrow) ---
async function processFinance() {
    const escRef = db.ref('requests/escrow_deals');
    const eSnap = await escRef.once('value');
    
    if (eSnap.exists()) {
        const deals = eSnap.val();
        for (const [id, d] of Object.entries(deals)) {
            
            // [أ] المرحلة الأولى: حجز المبلغ (من pending_delivery إلى secured)
            if (d.status === 'pending_delivery') {
                const amount = parseFloat(d.amount);
                const buyerRef = db.ref(`users/${d.buyerId}/sdmBalance`);
                
                const tx = await buyerRef.transaction(bal => {
                    if (bal === null) return 0;
                    if (parseFloat(bal) < amount) return; // إلغاء العملية إذا الرصيد غير كافٍ
                    return parseFloat((parseFloat(bal) - amount).toFixed(2));
                });

                if (tx.committed) {
                    await escRef.child(id).update({ status: 'secured' });
                    sendAlert(d.buyerId, `✅ تم حجز ${amount} SDM لطلب شراء: ${d.itemTitle}`, 'success');
                    sendAlert(d.sellerId, `🔔 مبلغ سلعتك (${d.itemTitle}) محجوز لدى الوسيط. يمكنك تسليم السلعة الآن.`, 'info');
                } else {
                    await escRef.child(id).update({ status: 'failed' });
                    // إرجاع حالة المنتج في السوق ليتمكن شخص آخر من شرائه
                    await db.ref(`posts/${d.postId}`).update({ pending: false });
                    await db.ref(`vip_posts/${d.postId}`).update({ pending: false });
                    sendAlert(d.buyerId, `❌ رصيدك لا يكفي لشراء ${d.itemTitle}`, 'error');
                }
            }

            // [ب] المرحلة الثانية: تحويل المال للبائع وتحديث حالة المنشور (من confirmed_by_buyer إلى completed)
            if (d.status === 'confirmed_by_buyer') {
                const amount = parseFloat(d.amount);
                
                // 1. إضافة المال لرصيد البائع
                await db.ref(`users/${d.sellerId}/sdmBalance`).transaction(c => parseFloat((parseFloat(c || 0) + amount).toFixed(2)));
                
                // 2. تحديث حالة الصفقة إلى "مكتملة"
                await escRef.child(id).update({ status: 'completed' });

                // 3. التعديل الجوهري: تحديث المنشور الأصلي ليصبح "مباع" نهائياً
                // نقوم بالتحديث في كلا المسارين (عادي و VIP) لضمان الوصول للمنشور
                const postUpdates = {
                    pending: false,
                    sold: true,
                    soldDate: admin.database.ServerValue.TIMESTAMP
                };
                await db.ref(`posts/${d.postId}`).update(postUpdates).catch(()=>{});
                await db.ref(`vip_posts/${d.postId}`).update(postUpdates).catch(()=>{});

                sendAlert(d.sellerId, `💰 مبروك! تم إيداع ${amount} SDM في رصيدك بعد تأكيد استلام: ${d.itemTitle}`, 'success');
                sendAlert(d.buyerId, `📦 تم إتمام عملية شراء ${d.itemTitle} بنجاح.`, 'success');
            }
        }
    }

    // [ج] معالجة تحويل الرصيد المباشر بين المستخدمين
    const tRef = db.ref('requests/transfers');
    const tSnap = await tRef.orderByChild('status').equalTo('pending').limitToFirst(10).once('value');
    if (tSnap.exists()) {
        for (const [id, t] of Object.entries(tSnap.val())) {
            const amount = parseFloat(t.amount);
            const uSnap = await db.ref('users').orderByChild('numericId').equalTo(String(t.toId)).once('value');
            
            if (uSnap.exists()) {
                const recUid = Object.keys(uSnap.val())[0];
                const tx = await db.ref(`users/${t.from}/sdmBalance`).transaction(curr => {
                    if (curr === null) return 0;
                    if (parseFloat(curr) < amount) return;
                    return parseFloat((parseFloat(curr) - amount).toFixed(2));
                });

                if (tx.committed) {
                    await db.ref(`users/${recUid}/sdmBalance`).transaction(c => parseFloat((parseFloat(c || 0) + amount).toFixed(2)));
                    await tRef.child(id).update({ status: 'completed' });
                    sendAlert(recUid, `💰 استلمت تحويل بقيمة ${amount} SDM من ${t.fromName}`, 'success');
                    sendAlert(t.from, `✅ تم تحويل ${amount} SDM بنجاح إلى الرقم ${t.toId}`, 'success');
                }
            } else {
                await tRef.child(id).update({ status: 'failed', reason: 'رقم التعريف غير موجود' });
                sendAlert(t.from, `❌ فشل التحويل: رقم التعريف ${t.toId} غير صحيح`, 'error');
            }
        }
    }

    // [د] تفعيل اشتراكات VIP
    const vipReqRef = db.ref('requests/vip_subscriptions');
    const vSnap = await vipReqRef.orderByChild('status').equalTo('pending').once('value');
    if (vSnap.exists()) {
        for (const [id, t] of Object.entries(vSnap.val())) {
            const cost = parseFloat(t.cost);
            const userRef = db.ref(`users/${t.userId}`);
            
            const tx = await userRef.transaction(u => {
                if (u && parseFloat(u.sdmBalance || 0) >= cost) {
                    const now = Date.now();
                    const currentExpiry = (u.vipExpiry && u.vipExpiry > now) ? u.vipExpiry : now;
                    u.sdmBalance = parseFloat((parseFloat(u.sdmBalance) - cost).toFixed(2));
                    u.vipStatus = 'active';
                    u.vipExpiry = currentExpiry + (parseInt(t.days) * 86400000);
                    return u;
                }
            });

            if (tx.committed) {
                await vipReqRef.child(id).update({ status: 'completed' });
                sendAlert(t.userId, `👑 تهانينا! تم تفعيل اشتراك VIP لمدة ${t.days} يوم`, 'success');
            }
        }
    }
}

// --- 3. التنظيف التلقائي للمنشورات المباعة (بعد 24 ساعة) ---
async function cleanupSoldPosts() {
    const now = Date.now();
    const expiryTime = 24 * 60 * 60 * 1000; // 24 ساعة
    const categories = ['posts', 'vip_posts'];

    for (const cat of categories) {
        const snap = await db.ref(cat).once('value');
        if (snap.exists()) {
            snap.forEach(child => {
                const post = child.val();
                if (post.sold === true && post.soldDate && (now - post.soldDate > expiryTime)) {
                    child.ref.remove();
                    console.log(`🧹 تم حذف المنشور المباع القديم: ${child.key}`);
                }
            });
        }
    }
}

// --- 4. تحديث التقييمات من الطابور ---
async function updateRatings() {
    const rSnap = await db.ref('rating_queue').orderByChild('status').equalTo('pending').once('value');
    if (rSnap.exists()) {
        for (const [id, t] of Object.entries(rSnap.val())) {
            await db.ref(`users/${t.target}`).transaction(u => {
                if (u) {
                    const currentRating = parseFloat(u.rating || 5);
                    const count = parseInt(u.ratingCount || 1);
                    u.rating = ((currentRating * count) + parseFloat(t.stars)) / (count + 1);
                    u.ratingCount = count + 1;
                    return u;
                }
            });
            await db.ref(`rating_queue/${id}`).update({ status: 'completed' });
        }
    }
}

// --- 5. تشغيل المهام الدورية ---
setInterval(processFinance, 5000);      // كل 5 ثوانٍ للعمليات المالية
setInterval(updateRatings, 15000);      // كل 15 ثانية للتقييمات
setInterval(cleanupSoldPosts, 3600000); // كل ساعة لتنظيف المتجر

// --- 6. واجهة السيرفر (Keep Alive) ---
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('🚀 SDM Market Bot Is Active and Monitoring...'));
app.listen(PORT, () => console.log(`السيرفر يعمل على المنفذ ${PORT}`));
