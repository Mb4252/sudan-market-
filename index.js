const admin = require('firebase-admin');
const express = require('express');
const app = express();

// --- 1. إعداد الاتصال بـ Firebase ---
// ملاحظة: تأكد من إضافة بيانات ملف الـ JSON في متغيرات البيئة (Environment Variables) باسم FIREBASE_SERVICE_ACCOUNT
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
    });
    console.log("✅ بوت SDM يعمل بنجاح | التنظيف والوسيط مفعل");
} catch (error) {
    console.error("❌ خطأ في تشغيل البوت: تأكد من ملف الخدمة JSON", error.message);
    process.exit(1);
}

const db = admin.database();

// دالة مساعدة لإرسال إشعارات فورية للمستخدم
function sendAlert(uid, msg, type = 'success') {
    db.ref(`alerts/${uid}`).push({
        msg,
        type,
        date: admin.database.ServerValue.TIMESTAMP
    });
}

// --- 2. محرك العمليات المالية (الوسيط، التحويل، الـ VIP) ---
async function processFinance() {
    // [أ] نظام الوسيط الآمن
    const escRef = db.ref('requests/escrow_deals');
    const eSnap = await escRef.orderByChild('status').once('value');
    
    if (eSnap.exists()) {
        for (const [id, d] of Object.entries(eSnap.val())) {
            // المرحلة 1: حجز المال من المشتري
            if (d.status === 'pending_delivery') {
                const amount = parseFloat(d.amount);
                const buyerRef = db.ref(`users/${d.buyerId}/sdmBalance`);
                
                const tx = await buyerRef.transaction(bal => {
                    if (bal === null) return 0;
                    if (parseFloat(bal) < amount) return; // رصيد غير كافي
                    return parseFloat((parseFloat(bal) - amount).toFixed(2));
                });

                if (tx.committed) {
                    await escRef.child(id).update({ status: 'secured' });
                    sendAlert(d.buyerId, `✅ تم حجز ${amount} SDM بنجاح لسلعة: ${d.itemTitle}`, 'success');
                    sendAlert(d.sellerId, `🔔 مبلغ سلعتك (${d.itemTitle}) محجوز لدى الوسيط. سلم السلعة الآن.`, 'info');
                } else {
                    await escRef.child(id).update({ status: 'failed' });
                    sendAlert(d.buyerId, `❌ رصيدك لا يكفي لإتمام عملية شراء ${d.itemTitle}`, 'error');
                }
            }
            // المرحلة 2: تحويل المال للبائع بعد تأكيد المشتري
            if (d.status === 'confirmed_by_buyer') {
                const amount = parseFloat(d.amount);
                await db.ref(`users/${d.sellerId}/sdmBalance`).transaction(c => parseFloat((parseFloat(c || 0) + amount).toFixed(2)));
                await escRef.child(id).update({ status: 'completed' });
                sendAlert(d.sellerId, `💰 تم إيداع مبلغ ${amount} SDM في رصيدك من بيع: ${d.itemTitle}`, 'success');
            }
        }
    }

    // [ب] تحويل الرصيد (بين الأعضاء)
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
                    sendAlert(recUid, `💰 استلمت تحويل ${amount} SDM من ${t.fromName}`, 'success');
                    sendAlert(t.from, `✅ تم التحويل بنجاح إلى ${t.toId}`, 'success');
                }
            } else {
                await tRef.child(id).update({ status: 'failed', reason: 'id_not_found' });
            }
        }
    }

    // [ج] تفعيل اشتراكات VIP
    const vipRef = db.ref('requests/vip_subscriptions');
    const vSnap = await vipRef.orderByChild('status').equalTo('pending').once('value');
    if (vSnap.exists()) {
        for (const [id, t] of Object.entries(vSnap.val())) {
            const cost = parseFloat(t.cost);
            const tx = await db.ref(`users/${t.userId}`).transaction(u => {
                if (u && parseFloat(u.sdmBalance || 0) >= cost) {
                    const start = (u.vipExpiry && u.vipExpiry > Date.now()) ? u.vipExpiry : Date.now();
                    u.sdmBalance = parseFloat((parseFloat(u.sdmBalance) - cost).toFixed(2));
                    u.vipStatus = 'active';
                    u.vipExpiry = start + (parseInt(t.days) * 86400000);
                    return u;
                }
            });
            if (tx.committed) {
                await vipRef.child(id).update({ status: 'completed' });
                sendAlert(t.userId, `👑 تم تفعيل باقة VIP لـ ${t.days} يوم بنجاح!`, 'success');
            }
        }
    }
}

// --- 3. محرك الحذف التلقائي للمنشورات المباعة (بعد 24 ساعة) ---
async function cleanupSoldPosts() {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000; // 24 ساعة
    const paths = ['posts', 'vip_posts'];

    for (const path of paths) {
        const snap = await db.ref(path).once('value');
        if (snap.exists()) {
            const updates = {};
            let deletedCount = 0;

            snap.forEach(child => {
                const post = child.val();
                // التحقق: هل المنشور "مباع" ومر عليه أكثر من 24 ساعة؟
                if (post.sold === true && (now - post.date) > oneDay) {
                    updates[child.key] = null; // حذف
                    deletedCount++;
                }
            });

            if (deletedCount > 0) {
                await db.ref(path).update(updates);
                console.log(`🧹 التنظيف: تم حذف ${deletedCount} إعلان مباع من ${path}`);
            }
        }
    }
}

// --- 4. تحديث تقييمات المستخدمين ---
async function updateRatings() {
    const rSnap = await db.ref('rating_queue').orderByChild('status').equalTo('pending').once('value');
    if (rSnap.exists()) {
        for (const [id, t] of Object.entries(rSnap.val())) {
            await db.ref(`users/${t.target}`).transaction(u => {
                if (u) {
                    const oldR = parseFloat(u.rating || 5), count = parseInt(u.ratingCount || 1);
                    u.rating = ((oldR * count) + parseFloat(t.stars)) / (count + 1);
                    u.ratingCount = count + 1;
                    return u;
                }
            });
            await db.ref(`rating_queue/${id}`).update({ status: 'completed' });
        }
    }
}

// --- 5. التشغيل الدوري ---
setInterval(processFinance, 5000);    // المالية: كل 5 ثواني
setInterval(updateRatings, 20000);    // التقييمات: كل 20 ثانية
setInterval(cleanupSoldPosts, 3600000); // تنظيف المباع: كل ساعة واحدة

// --- 6. واجهة السيرفر ---
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('🚀 SDM Market Bot is Running...'));
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
