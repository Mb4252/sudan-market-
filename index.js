const admin = require('firebase-admin');
const express = require('express');
const app = express();

// --- 1. إعداد Firebase ---
try {
    // تأكد من إضافة FIREBASE_SERVICE_ACCOUNT في Environment Variables على Render
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
    });
    console.log("🚀 SDM Market Bot Started | Fixed & Optimized");
} catch (error) {
    console.error("❌ Initialization Error:", error.message);
    process.exit(1);
}

const db = admin.database();

// دالة إرسال تنبيه للمستخدم
function sendAlert(uid, msg, type = 'success') {
    db.ref(`alerts/${uid}`).push({
        msg,
        type,
        date: admin.database.ServerValue.TIMESTAMP
    });
}

// --- 2. محرك العمليات المالية (المُصلح) ---
async function processFinance() {
    try {
        // [أ] معالجة تحويل الرصيد المباشر (عبر Numeric ID)
        const transRef = db.ref('requests/transfers');
        const transSnap = await transRef.orderByChild('status').equalTo('pending').once('value');

        if (transSnap.exists()) {
            const transfers = transSnap.val();
            for (const id in transfers) {
                const t = transfers[id];
                const amount = parseFloat(t.amount);

                console.log(`Checking transfer: From ${t.fromName} to ID ${t.toId} Amount ${amount}`);

                // البحث عن المستلم بواسطة الرقم التعريفي (numericId)
                const userQuery = await db.ref('users').orderByChild('numericId').equalTo(String(t.toId)).once('value');
                
                if (userQuery.exists()) {
                    const userData = userQuery.val();
                    const targetUid = Object.keys(userData)[0]; // الحصول على UID المستلم
                    
                    // محاولة خصم الرصيد من المرسل
                    const senderRef = db.ref(`users/${t.from}/sdmBalance`);
                    const senderTx = await senderRef.transaction(currentBal => {
                        if (currentBal === null) return 0;
                        if (parseFloat(currentBal) >= amount) {
                            return parseFloat((parseFloat(currentBal) - amount).toFixed(2));
                        }
                        return undefined; // سيعيد committed = false إذا كان الرصيد غير كافٍ
                    });

                    if (senderTx.committed) {
                        // إضافة الرصيد للمستلم
                        await db.ref(`users/${targetUid}/sdmBalance`).transaction(b => {
                            return parseFloat(((parseFloat(b) || 0) + amount).toFixed(2));
                        });

                        // تحديث حالة الطلب إلى مكتمل
                        await transRef.child(id).update({ status: 'completed' });

                        // إرسال تنبيهات للطرفين
                        sendAlert(targetUid, `💰 استلمت تحويل بمبلغ ${amount} SDM من ${t.fromName}`, 'success');
                        sendAlert(t.from, `✅ تم تحويل ${amount} SDM إلى المستلم صاحب الرقم ${t.toId} بنجاح`, 'success');
                        console.log(`✅ Transfer Successful from ${t.from} to ${targetUid}`);
                    } else {
                        // الرصيد غير كافٍ
                        await transRef.child(id).update({ status: 'failed_insufficient_funds' });
                        sendAlert(t.from, `❌ فشل التحويل: رصيدك الحالي لا يكفي لإرسال ${amount} SDM`, 'error');
                        console.log(`❌ Transfer Failed: Insufficient funds for ${t.from}`);
                    }
                } else {
                    // الرقم التعريفي غير موجود
                    await transRef.child(id).update({ status: 'failed_invalid_id' });
                    sendAlert(t.from, `❌ فشل التحويل: الرقم التعريفي (${t.toId}) غير مسجل في النظام`, 'error');
                    console.log(`❌ Transfer Failed: Invalid Numeric ID ${t.toId}`);
                }
            }
        }

        // [ب] معالجة الصفقات (Escrow)
        const escRef = db.ref('requests/escrow_deals');
        const pendingEscrow = await escRef.orderByChild('status').equalTo('pending_delivery').once('value');
        if (pendingEscrow.exists()) {
            for (const [id, d] of Object.entries(pendingEscrow.val())) {
                const amount = parseFloat(d.amount);
                const buyerRef = db.ref(`users/${d.buyerId}/sdmBalance`);

                const buyerTx = await buyerRef.transaction(bal => {
                    if (bal >= amount) return parseFloat((bal - amount).toFixed(2));
                    return undefined;
                });

                if (buyerTx.committed) {
                    await escRef.child(id).update({ status: 'secured' });
                    sendAlert(d.buyerId, `✅ تم حجز ${amount} SDM لصفقة: ${d.itemTitle}`, 'success');
                    sendAlert(d.sellerId, `🔔 قام مشترٍ بحجز سلعتك (${d.itemTitle}). يرجى التسليم الآن.`, 'info');
                } else {
                    await escRef.child(id).update({ status: 'failed_insufficient_funds' });
                    sendAlert(d.buyerId, `❌ رصيدك لا يكفي لإتمام هذه الصفقة`, 'error');
                }
            }
        }

    } catch (err) {
        console.error("Finance Engine Error:", err.message);
    }
}

// --- 3. معالجة VIP والتقييمات ---
async function processOthers() {
    try {
        const vipSnap = await db.ref('requests/vip_subscriptions').orderByChild('status').equalTo('pending').once('value');
        if (vipSnap.exists()) {
            for (const [id, v] of Object.entries(vipSnap.val())) {
                const cost = parseFloat(v.cost);
                const userRef = db.ref(`users/${v.userId}`);
                const tx = await userRef.transaction(u => {
                    if (u && (u.sdmBalance || 0) >= cost) {
                        const now = Date.now();
                        u.sdmBalance = parseFloat((u.sdmBalance - cost).toFixed(2));
                        u.vipStatus = 'active';
                        u.vipExpiry = ((u.vipExpiry > now) ? u.vipExpiry : now) + (v.days * 86400000);
                        return u;
                    }
                });
                if (tx.committed) {
                    await db.ref(`requests/vip_subscriptions/${id}`).update({ status: 'completed' });
                    sendAlert(v.userId, `👑 تم تفعيل اشتراك VIP بنجاح!`, 'success');
                }
            }
        }
    } catch (err) {
        console.error("Others Engine Error:", err.message);
    }
}

// --- 4. المجدول (Running Loops) ---
setInterval(processFinance, 7000); // كل 7 ثوانٍ للعمليات المالية
setInterval(processOthers, 15000); // كل 15 ثانية للمهام الأخرى

// --- 5. واجهة السيرفر و Health Check ---
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('SDM Market Bot is Online 🚀'));
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
