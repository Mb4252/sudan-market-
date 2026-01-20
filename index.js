const admin = require('firebase-admin');
const express = require('express');
const app = express();

// --- 1. إعداد Firebase ---
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
    });
    console.log("🚀 SDM Market Bot Started | Monitoring...");
} catch (error) {
    console.error("❌ Initialization Error:", error.message);
    process.exit(1);
}

const db = admin.database();

function sendAlert(uid, msg, type = 'success') {
    db.ref(`alerts/${uid}`).push({
        msg,
        type,
        date: admin.database.ServerValue.TIMESTAMP
    });
}

// --- 2. محرك العمليات المالية ---
async function processFinance() {
    try {
        const transRef = db.ref('requests/transfers');
        const transSnap = await transRef.orderByChild('status').equalTo('pending').once('value');

        if (transSnap.exists()) {
            const transfers = transSnap.val();
            for (const [id, t] of Object.entries(transfers)) {
                const amount = parseFloat(t.amount);
                
                // البحث عن المستلم
                const userQuery = await db.ref('users').orderByChild('numericId').equalTo(String(t.toId)).once('value');
                
                if (userQuery.exists()) {
                    const targetUid = Object.keys(userQuery.val())[0];
                    const recipientData = Object.values(userQuery.val())[0];
                    const senderRef = db.ref(`users/${t.from}/sdmBalance`);

                    // تنفيذ التحويل بأمان
                    const result = await senderRef.transaction(currentBal => {
                        const bal = Number(currentBal) || 0;
                        if (bal >= amount) {
                            return parseFloat((bal - amount).toFixed(2));
                        }
                        return; // إلغاء إذا لم يكف الرصيد
                    });

                    if (result.committed) {
                        // إضافة للمستلم
                        await db.ref(`users/${targetUid}/sdmBalance`).transaction(b => parseFloat(((Number(b) || 0) + amount).toFixed(2)));
                        
                        await transRef.child(id).update({ status: 'completed', processedAt: admin.database.ServerValue.TIMESTAMP });
                        
                        sendAlert(targetUid, `💰 استلمت ${amount} SDM من ${t.fromName}`, 'success');
                        sendAlert(t.from, `✅ تم تحويل ${amount} SDM إلى ${recipientData.n} بنجاح`, 'success');
                    } else {
                        // الرصيد غير كافٍ فعلياً في القاعدة
                        await transRef.child(id).update({ status: 'failed_insufficient_funds' });
                        sendAlert(t.from, `❌ فشل التحويل: رصيدك الحالي غير كافٍ`, 'error');
                    }
                } else {
                    await transRef.child(id).update({ status: 'failed_invalid_id' });
                    sendAlert(t.from, `❌ الرقم التعريفي (${t.toId}) غير صحيح`, 'error');
                }
            }
        }
    } catch (err) {
        console.error("Finance Error:", err.message);
    }
}

// --- 3. محرك الـ VIP ---
async function processVIP() {
    try {
        const vipRef = db.ref('requests/vip_subscriptions');
        const snap = await vipRef.orderByChild('status').equalTo('pending').once('value');
        
        if (snap.exists()) {
            for (const [id, v] of Object.entries(snap.val())) {
                const cost = parseFloat(v.cost);
                const userRef = db.ref(`users/${v.userId}`);
                
                const tx = await userRef.transaction(u => {
                    if (u && (Number(u.sdmBalance) || 0) >= cost) {
                        const now = Date.now();
                        u.sdmBalance = parseFloat(((Number(u.sdmBalance) || 0) - cost).toFixed(2));
                        u.vipStatus = 'active';
                        u.vipExpiry = (Math.max(u.vipExpiry || 0, now)) + (v.days * 86400000);
                        return u;
                    }
                });

                if (tx.committed) {
                    await vipRef.child(id).update({ status: 'completed' });
                    sendAlert(v.userId, `👑 تم تفعيل اشتراك VIP بنجاح`, 'success');
                } else {
                    await vipRef.child(id).update({ status: 'failed_no_balance' });
                    sendAlert(v.userId, `❌ فشل اشتراك VIP: رصيدك غير كافٍ`, 'error');
                }
            }
        }
    } catch (e) { console.error("VIP Error:", e.message); }
}

setInterval(processFinance, 5000);
setInterval(processVIP, 10000);

const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send("Bot Active"));
app.listen(PORT, () => console.log(`Server on ${PORT}`));
