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
    console.log("🚀 SDM Market Bot Started | Monitoring Transactions...");
} catch (error) {
    console.error("❌ Initialization Error (Check Service Account):", error.message);
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

// --- 2. محرك العمليات المالية (التحويل) ---
async function processFinance() {
    try {
        const transRef = db.ref('requests/transfers');
        // جلب الطلبات المعلقة فقط
        const transSnap = await transRef.orderByChild('status').equalTo('pending').once('value');

        if (transSnap.exists()) {
            const transfers = transSnap.val();
            for (const [id, t] of Object.entries(transfers)) {
                try {
                    const amount = parseFloat(t.amount);
                    if (isNaN(amount) || amount <= 0) {
                        await transRef.child(id).update({ status: 'error_invalid_amount' });
                        continue;
                    }

                    console.log(`🔍 فحص طلب: من ${t.fromName} إلى ID: ${t.toId} مبلغ: ${amount}`);

                    // البحث عن المستلم بواسطة الرقم التعريفي numericId
                    const userQuery = await db.ref('users').orderByChild('numericId').equalTo(String(t.toId)).once('value');
                    
                    if (userQuery.exists()) {
                        const targetUid = Object.keys(userQuery.val())[0];
                        const recipientData = Object.values(userQuery.val())[0];

                        // تنفيذ العملية كـ Transaction لضمان الأمان والدقة
                        const senderRef = db.ref(`users/${t.from}/sdmBalance`);
                        
                        const senderTx = await senderRef.transaction(currentBal => {
                            // تحويل القيمة لرقم (إذا كانت null نعتبرها 0)
                            const bal = (currentBal === null) ? 0 : Number(currentBal);
                            
                            if (bal >= amount) {
                                return parseFloat((bal - amount).toFixed(2));
                            }
                            return; // إلغاء إذا كان الرصيد أقل من المطلوب
                        });

                        if (senderTx.committed) {
                            // 1. إضافة المبلغ للمستلم
                            const recipientRef = db.ref(`users/${targetUid}/sdmBalance`);
                            await recipientRef.transaction(b => parseFloat(((Number(b) || 0) + amount).toFixed(2)));
                            
                            // 2. تحديث حالة الطلب إلى مكتمل
                            await transRef.child(id).update({ 
                                status: 'completed',
                                processedAt: admin.database.ServerValue.TIMESTAMP,
                                recipientUid: targetUid
                            });
                            
                            // 3. إرسال التنبيهات
                            sendAlert(targetUid, `💰 استلمت ${amount} SDM من ${t.fromName}`, 'success');
                            sendAlert(t.from, `✅ تم تحويل ${amount} SDM إلى ${recipientData.n} بنجاح`, 'success');
                            
                            console.log(`✅ تم التحويل بنجاح: ${t.fromName} -> ${recipientData.n}`);
                        } else {
                            // فشل بسبب الرصيد - نغير الحالة فوراً لمنع التكرار
                            await transRef.child(id).update({ status: 'failed_insufficient_funds' });
                            sendAlert(t.from, `❌ فشل التحويل: رصيدك الحالي غير كافٍ لإتمام العملية`, 'error');
                            console.log(`❌ فشل: رصيد غير كافٍ للمستخدم ${t.fromName}`);
                        }
                    } else {
                        // المستلم غير موجود
                        await transRef.child(id).update({ status: 'failed_invalid_id' });
                        sendAlert(t.from, `❌ الرقم التعريفي (${t.toId}) غير موجود بالنظام`, 'error');
                        console.log(`❌ فشل: الرقم ${t.toId} غير صحيح`);
                    }
                } catch (e) { 
                    console.error("Internal Loop Error:", e.message); 
                }
            }
        }
    } catch (err) {
        console.error("Finance Engine Global Error:", err.message);
    }
}

// --- 3. محرك الاشتراكات VIP والتقييمات ---
async function processOthers() {
    try {
        // تفعيل VIP
        const vipRef = db.ref('requests/vip_subscriptions');
        const vipSnap = await vipRef.orderByChild('status').equalTo('pending').once('value');
        
        if (vipSnap.exists()) {
            for (const [id, v] of Object.entries(vipSnap.val())) {
                const cost = parseFloat(v.cost);
                const userRef = db.ref(`users/${v.userId}`);
                
                const tx = await userRef.transaction(u => {
                    if (u && Number(u.sdmBalance || 0) >= cost) {
                        const now = Date.now();
                        u.sdmBalance = parseFloat((Number(u.sdmBalance) - cost).toFixed(2));
                        u.vipStatus = 'active';
                        u.vipExpiry = ((u.vipExpiry > now) ? u.vipExpiry : now) + (v.days * 86400000);
                        return u;
                    }
                });

                if (tx.committed) {
                    await vipRef.child(id).update({ status: 'completed' });
                    sendAlert(v.userId, `👑 مبروك! تم تفعيل اشتراك VIP بنجاح`, 'success');
                } else {
                    await vipRef.child(id).update({ status: 'failed_no_balance' });
                    sendAlert(v.userId, `❌ فشل اشتراك VIP: رصيدك غير كافٍ`, 'error');
                }
            }
        }
    } catch (err) { console.error("Others Engine Error:", err.message); }
}

// --- 4. تشغيل المجدول (Intervals) ---
// فحص التحويلات كل 5 ثوانٍ
setInterval(processFinance, 5000);
// فحص الاشتراكات كل 15 ثانية
setInterval(processOthers, 15000);

// --- 5. سيرفر Express للبقاء نشطاً ---
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => {
    res.send(`SDM Market Bot is running... Active: ${new Date().toLocaleString('ar-EG')}`);
});
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
