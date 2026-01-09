const express = require('express');
const admin = require("firebase-admin");
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// 1. الاتصال الآمن بقاعدة البيانات (Secure Connection)
// ============================================================
let serviceAccount;
try {
    // نقرأ المفاتيح من متغيرات البيئة في Render للحماية
    const envKey = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (envKey) {
        serviceAccount = JSON.parse(envKey);
        console.log("✅ Credentials loaded successfully from Environment.");
    } else {
        console.error("❌ CRITICAL: FIREBASE_SERVICE_ACCOUNT is missing.");
    }
} catch (error) { 
    console.error("❌ Error parsing credentials:", error); 
}

if (serviceAccount) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
    });
}

// التأكد من تهيئة التطبيق
const db = admin.apps.length ? admin.database() : null;

// ============================================================
// 2. ذاكرة الحماية (Anti-Replay Memory)
// ============================================================
// هذه الذاكرة تمنع الهكر من استخدام نفس المعاملة مرتين
// الصيغة: Map<UserID, TransactionID>
const processedTransactions = new Map();

// ============================================================
// 3. تشغيل السيرفر (Express Server)
// ============================================================
app.get('/', (req, res) => { 
    res.send('🛡️ SDM Security Guardian is RUNNING (v3.0 Secure).'); 
});

app.listen(PORT, () => { 
    console.log(`🚀 Server running on port ${PORT}`); 
});

// ============================================================
// 4. نبض القلب (Heartbeat System)
// ============================================================
// يرسل إشارة للقاعدة كل دقيقة ليخبر التطبيق أنه حي
if (db) {
    console.log("💓 Heartbeat system started...");
    setInterval(() => {
        db.ref('system/status').update({ 
            last_online: admin.database.ServerValue.TIMESTAMP 
        }).catch(err => console.error('Heartbeat Error:', err));
    }, 60000); // تحديث كل 60 ثانية
}

// ============================================================
// 5. الحارس الذكي (The Watchdog Logic)
// ============================================================
if (db) {
    console.log("👁️ Security Watchdog is monitoring users...");

    // الاستماع لكل مستخدم جديد ينضم أو موجود بالفعل
    db.ref('users').on('child_added', (userSnap) => {
        const uid = userSnap.key;
        
        // تهيئة الرصيد المحلي المبدئي لتجنب الإنذارات الكاذبة عند التشغيل
        let localSDM = parseFloat(userSnap.val().sdmBalance || 0);

        // فتح قناة مراقبة خاصة لرصيد هذا المستخدم
        db.ref(`users/${uid}/sdmBalance`).on('value', async (snap) => {
            const currentSDM = parseFloat(snap.val());

            // 1. تجاهل القيم غير الصالحة
            if (isNaN(currentSDM)) return;

            // 2. إذا نقص الرصيد (شراء/تحويل)، فهذا طبيعي وآمن
            if (currentSDM <= localSDM) {
                localSDM = currentSDM;
                return;
            }

            // ⚠️ هنا حدثت زيادة! لنحقق فيها
            const diff = currentSDM - localSDM;
            // تجاهل الزيادات الصغيرة جداً (أقل من 0.0001) لتفادي أخطاء الجافاسكريبت
            if (diff < 0.0001) return;

            console.log(`🔍 Audit User ${uid}: +${diff.toFixed(4)} SDM`);

            let isLegit = false;
            let proofId = null; // سيحمل رقم المعاملة التي بررت الزيادة

            try {
                // الخطوة 1: هل المستخدم أدمن؟
                // (نقوم بجلب البيانات للتأكد، لا نعتمد على الذاكرة القديمة)
                const uData = await db.ref(`users/${uid}/role`).once('value');
                if (uData.val() === 'admin') {
                    isLegit = true;
                    console.log(`✅ User ${uid} is Admin. Skip check.`);
                }

                // الخطوة 2: البحث في سجل المعاملات (Transactions)
                if (!isLegit) {
                    const txns = await db.ref('transactions')
                                         .orderByChild('uP')
                                         .equalTo(uid)
                                         .limitToLast(10) 
                                         .once('value');
                    
                    txns.forEach(t => {
                        if (isLegit) return; // إذا وجدنا دليل، نتوقف
                        
                        const tx = t.val();
                        const txId = t.key;
                        
                        // الشروط الأمنية الصارمة:
                        // 1. النوع يجب أن يبرر الزيادة (بيع MRK أو استلام تحويل)
                        // 2. الوقت: المعاملة حدثت في آخر 15 ثانية فقط
                        // 3. القيمة: تطابق الزيادة مع هامش خطأ ضئيل (0.1)
                        const isValidType = (tx.type === 'sell' || tx.type === 'receive' || tx.type === 'buy_approved');
                        const isRecent = (Date.now() - (tx.date || Date.now())) < 15000;
                        const isMatchingAmount = Math.abs((tx.out || tx.amount || 0) - diff) < 0.1;

                        if (isValidType && isRecent && isMatchingAmount) {
                            // 4. الحماية من التكرار (Anti-Replay)
                            // نتأكد أن هذا الـ Transaction ID لم نستخدمه سابقاً
                            if (processedTransactions.get(uid) !== txId) {
                                isLegit = true;
                                proofId = txId;
                            } else {
                                console.warn(`⚠️ Warning: Replay Attack attempt detected for User ${uid} with Txn ${txId}`);
                            }
                        }
                    });
                }

                // الخطوة 3: البحث في طلبات الشراء المباشرة من المطور (Coin Requests)
                if (!isLegit) {
                    const reqs = await db.ref('coin_requests')
                                         .orderByChild('uP')
                                         .equalTo(uid)
                                         .limitToLast(5)
                                         .once('value');
                    
                    reqs.forEach(r => {
                        if (isLegit) return;
                        
                        const req = r.val();
                        const reqId = r.key;

                        // الشروط: الطلب "approved" + الوقت حديث + الكمية متطابقة
                        if (
                            req.status === 'approved' && 
                            (Date.now() - (req.date || Date.now())) < 20000 && 
                            Math.abs(req.qty - diff) < 0.1 
                        ) {
                             // الحماية من التكرار
                             if (processedTransactions.get(uid) !== reqId) {
                                isLegit = true;
                                proofId = reqId;
                            }
                        }
                    });
                }

                // === القرار النهائي ===
                if (!isLegit) {
                    // 🚨 غشاش (Cheater)
                    console.error(`🚨 CHEATER CAUGHT: ${uid} added ${diff} SDM without proof.`);
                    
                    // 1. إعادة الرصيد للقيمة القديمة فوراً
                    await snap.ref.set(localSDM);
                    
                    // 2. حظر المستخدم وتجميد الحساب
                    await db.ref(`users/${uid}`).update({ 
                        bannedUntil: Date.now() + (365 * 24 * 60 * 60 * 1000), // حظر لمدة سنة
                        role: 'banned_cheater',
                        verified: false // إجبار النظام على التوقف له
                    });

                    // 3. إرسال تنبيه للأدمن (اختياري)
                    await db.ref('admin_alerts').push({
                        msg: `🚨 CHEATER DETECTED: User ${uid} tried to add ${diff} SDM. Auto-Banned.`,
                        time: Date.now()
                    });

                } else {
                    // ✅ عملية سليمة (Verified)
                    console.log(`✅ Verified Increase for ${uid} (Proof ID: ${proofId || 'Admin'})`);
                    
                    // تحديث الرصيد المحلي الجديد
                    localSDM = currentSDM; 
                    
                    // تسجيل المعاملة كـ "مستخدمة" لمنع استخدامها مرة أخرى
                    if (proofId) processedTransactions.set(uid, proofId);
                    
                    // فك قفل الحماية (السماح للمستخدم بالعمل)
                    await db.ref(`users/${uid}`).update({ verified: true });
                }

            } catch (err) {
                console.error("❌ Audit Logic Error:", err);
                // في حالة حدوث خطأ برمجي، نعيد الرصيد للاحتياط
                snap.ref.set(localSDM);
            }
        });
    });
}
