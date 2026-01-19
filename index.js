const admin = require('firebase-admin');
const express = require('express');
const app = express();

// --- 1. إعداد الاتصال بقاعدة البيانات ---
try {
    // تأكد من إضافة FIREBASE_SERVICE_ACCOUNT كمتغير بيئة (Environment Variable) في سيرفر Render
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
    });
    console.log("✅ SDM Ultimate Bot: النظام الشامل يعمل بكفاءة قصوى");
} catch (error) {
    console.error("❌ خطأ في تهيئة البوت:", error.message);
    process.exit(1);
}

const db = admin.database();

// دالة مساعدة لإرسال تنبيهات فورية للمستخدمين
function sendAlert(uid, msg, type = 'success') {
    db.ref(`alerts/${uid}`).push({
        msg,
        type,
        date: admin.database.ServerValue.TIMESTAMP
    });
}

// --- 2. محرك العمليات المالية (الوسيط والتحويلات والـ VIP) ---
async function processFinance() {
    // أ- نظام الوسيط الآمن (Escrow)
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
                    sendAlert(d.sellerId, `🔔 تم حجز مبلغ سلعتك (${d.itemTitle}) لدى الوسيط. يمكنك التسليم الآن.`, 'info');
                } else {
                    await escRef.child(id).update({ status: 'failed', reason: 'insufficient_balance' });
                    sendAlert(d.buyerId, `❌ فشل الحجز لـ ${d.itemTitle}: رصيدك الحالي لا يكفي.`, 'error');
                }
            }
            // المرحلة 2: تحويل المال للبائع بعد تأكيد المشتري
            if (d.status === 'confirmed_by_buyer') {
                const amount = parseFloat(d.amount);
                await db.ref(`users/${d.sellerId}/sdmBalance`).transaction(c => parseFloat((parseFloat(c || 0) + amount).toFixed(2)));
                await escRef.child(id).update({ status: 'completed' });
                sendAlert(d.sellerId, `💰 تم إيداع ${amount} SDM من بيع: ${d.itemTitle}`, 'success');
                sendAlert(d.buyerId, `🏁 تمت عملية الشراء بنجاح.`, 'success');
            }
        }
    }

    // ب- تحويلات الرصيد العادية (P2P)
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
                    sendAlert(recUid, `💰 وصلك تحويل ${amount} SDM من ${t.fromName}`, 'success');
                    sendAlert(t.from, `✅ تم تحويل ${amount} SDM بنجاح.`, 'success');
                }
            } else {
                await tRef.child(id).update({ status: 'failed', reason: 'wrong_id' });
                sendAlert(t.from, `❌ الرقم التعريف ${t.toId} غير موجود.`, 'error');
            }
        }
    }

    // ج- تفعيل اشتراكات VIP
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
                sendAlert(t.userId, `👑 مبروك! تم تفعيل اشتراك VIP.`, 'success');
            }
        }
    }
}

// --- 3. محرك التقييمات والبلاغات ---
async function processSocial() {
    // التقييمات تلقائياً
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

    // البلاغات (تسجيل)
    const repSnap = await db.ref('user_reports').orderByChild('status').equalTo('pending').once('value');
    if (repSnap.exists()) {
        for (const [id, r] of Object.entries(repSnap.val())) {
            console.log(`🚩 بلاغ ضد ${r.offender}: ${r.reason}`);
            await db.ref(`user_reports/${id}`).update({ status: 'received' });
        }
    }
}

// --- 4. محرك التنظيف التلقائي (Cleanup) ---
async function cleanupSystem() {
    // حذف المنشورات التي مر عليها أكثر من 48 ساعة (للحفاظ على السرعة)
    const cutoff = Date.now() - (48 * 60 * 60 * 1000);
    const targetPaths = ['posts', 'vip_posts'];
    
    for (const path of targetPaths) {
        const snap = await db.ref(path).orderByChild('date').endAt(cutoff).once('value');
        if (snap.exists()) {
            const updates = {};
            Object.keys(snap.val()).forEach(key => updates[key] = null);
            await db.ref(path).update(updates);
            console.log(`🧹 تنظيف: تم حذف ${Object.keys(updates).length} منشور قديم من ${path}`);
        }
    }
}

// --- 5. التشغيل الدوري ---
setInterval(processFinance, 5000);   // مالي: كل 5 ثواني
setInterval(processSocial, 10000);   // اجتماعي: كل 10 ثواني
setInterval(cleanupSystem, 3600000); // تنظيف: كل ساعة

const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('🚀 SDM Ultimate Bot is Active'));
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
