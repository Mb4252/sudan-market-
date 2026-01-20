const admin = require('firebase-admin');
const express = require('express');
const app = express();

// --- 1. إعداد Firebase ---
try {
    // تأكد من وضع ملف الخدمة في Environment Variables على Render باسم FIREBASE_SERVICE_ACCOUNT
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
    });
    console.log("🚀 SDM Market Bot Started | Waiting for transactions...");
} catch (error) {
    console.error("❌ Initialization Error:", error.message);
    process.exit(1);
}

const db = admin.database();

// دالة إرسال تنبيه للمستخدم داخل التطبيق
function sendAlert(uid, msg, type = 'success') {
    db.ref(`alerts/${uid}`).push({
        msg,
        type,
        date: admin.database.ServerValue.TIMESTAMP
    });
}

// --- 2. محرك العمليات المالية (التحويل والضمان) ---
async function processFinance() {
    try {
        // [أ] معالجة تحويل الرصيد المباشر (عبر Numeric ID)
        const transRef = db.ref('requests/transfers');
        const transSnap = await transRef.orderByChild('status').equalTo('pending').once('value');

        if (transSnap.exists()) {
            for (const [id, t] of Object.entries(transSnap.val())) {
                try {
                    const amount = parseFloat(t.amount);
                    console.log(`🔍 فحص طلب تحويل: من ${t.fromName} إلى ID: ${t.toId}`);

                    // البحث عن المستلم بواسطة الرقم التعريفي (numericId)
                    const userQuery = await db.ref('users').orderByChild('numericId').equalTo(String(t.toId)).once('value');
                    
                    if (userQuery.exists()) {
                        const targetUid = Object.keys(userQuery.val())[0];
                        
                        // تنفيذ العملية كـ Transaction لضمان الأمان
                        const senderRef = db.ref(`users/${t.from}/sdmBalance`);
                        const senderTx = await senderRef.transaction(bal => {
                            if (bal >= amount) return parseFloat((bal - amount).toFixed(2));
                            return; // إلغاء إذا كان الرصيد غير كافٍ
                        });

                        if (senderTx.committed) {
                            // إضافة المبلغ للمستلم
                            await db.ref(`users/${targetUid}/sdmBalance`).transaction(b => parseFloat(((b || 0) + amount).toFixed(2)));
                            
                            // تحديث حالة الطلب
                            await transRef.child(id).update({ status: 'completed' });
                            
                            // إرسال التنبيهات
                            sendAlert(targetUid, `💰 استلمت ${amount} SDM من ${t.fromName}`, 'success');
                            sendAlert(t.from, `✅ تم تحويل ${amount} SDM للرقم ${t.toId} بنجاح`, 'success');
                            console.log(`✅ تم التحويل بنجاح إلى: ${targetUid}`);
                        } else {
                            await transRef.child(id).update({ status: 'failed_insufficient_funds' });
                            sendAlert(t.from, `❌ فشل التحويل: رصيدك غير كافٍ`, 'error');
                            console.log("❌ فشل التحويل: رصيد غير كافٍ");
                        }
                    } else {
                        await transRef.child(id).update({ status: 'failed_invalid_id' });
                        sendAlert(t.from, `❌ الرقم التعريفي ${t.toId} غير موجود في النظام`, 'error');
                        console.log("❌ الرقم التعريفي غير موجود");
                    }
                } catch (e) { console.error("Error in Transfer Loop:", e); }
            }
        }

        // [ب] معالجة نظام الضمان (Escrow) - إذا كان مفعلاً في تطبيقك
        const escRef = db.ref('requests/escrow_deals');
        const pendingEscrow = await escRef.orderByChild('status').equalTo('pending_delivery').once('value');
        if (pendingEscrow.exists()) {
            for (const [id, d] of Object.entries(pendingEscrow.val())) {
                const amount = parseFloat(d.amount);
                const buyerRef = db.ref(`users/${d.buyerId}/sdmBalance`);
                
                const tx = await buyerRef.transaction(bal => {
                    if (bal >= amount) return parseFloat((bal - amount).toFixed(2));
                    return;
                });

                if (tx.committed) {
                    await escRef.child(id).update({ status: 'secured' });
                    sendAlert(d.buyerId, `✅ تم حجز ${amount} SDM لضمان حق البائع: ${d.itemTitle}`, 'success');
                    sendAlert(d.sellerId, `🔔 قام المشتري بحجز المبلغ لسلعتك (${d.itemTitle}). يمكنك التسليم الآن.`, 'info');
                }
            }
        }

    } catch (err) {
        console.error("Finance Engine Error:", err.message);
    }
}

// --- 3. محرك الاشتراكات والتقييمات ---
async function processOthers() {
    try {
        // [أ] تفعيل VIP
        const vipRef = db.ref('requests/vip_subscriptions');
        const vipSnap = await vipRef.orderByChild('status').equalTo('pending').once('value');
        
        if (vipSnap.exists()) {
            for (const [id, v] of Object.entries(vipSnap.val())) {
                const cost = parseFloat(v.cost);
                const userRef = db.ref(`users/${v.userId}`);
                
                const tx = await userRef.transaction(u => {
                    if (u && (u.sdmBalance || 0) >= cost) {
                        const now = Date.now();
                        u.sdmBalance = parseFloat((u.sdmBalance - cost).toFixed(2));
                        u.vipStatus = 'active';
                        // تمديد الاشتراك إذا كان موجوداً أو البدء من الآن
                        u.vipExpiry = ((u.vipExpiry > now) ? u.vipExpiry : now) + (v.days * 86400000);
                        return u;
                    }
                });

                if (tx.committed) {
                    await vipRef.child(id).update({ status: 'completed' });
                    sendAlert(v.userId, `👑 مبروك! تم تفعيل اشتراك VIP لمدة ${v.days} يوم`, 'success');
                } else {
                    await vipRef.child(id).update({ status: 'failed_no_balance' });
                    sendAlert(v.userId, `❌ فشل تفعيل VIP: رصيدك غير كافٍ`, 'error');
                }
            }
        }

        // [ب] تحديث تقييمات النجوم
        const rateRef = db.ref('rating_queue');
        const rateSnap = await rateRef.orderByChild('status').equalTo('pending').once('value');
        if (rateSnap.exists()) {
            for (const [id, r] of Object.entries(rateSnap.val())) {
                await db.ref(`users/${r.target}`).transaction(u => {
                    if (u) {
                        const currentRating = parseFloat(u.rating || 5);
                        const count = parseInt(u.ratingCount || 1);
                        u.rating = ((currentRating * count) + parseFloat(r.stars)) / (count + 1);
                        u.ratingCount = count + 1;
                        return u;
                    }
                });
                await rateRef.child(id).update({ status: 'completed' });
            }
        }
    } catch (err) { console.error("Others Engine Error:", err.message); }
}

// --- 4. تشغيل المجدول (Loops) ---
// تشغيل العمليات المالية كل 6 ثوانٍ
setInterval(processFinance, 6000);
// تشغيل الاشتراكات كل 20 ثانية
setInterval(processOthers, 20000);

// --- 5. تشغيل السيرفر للبقاء حياً (Express) ---
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => {
    res.send(`SDM Bot is active. Server time: ${new Date().toISOString()}`);
});
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
