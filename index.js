const admin = require('firebase-admin');
const express = require('express');
const app = express();

// --- 1. إعداد Firebase ---
// ملاحظة: تأكد من وضع ملف مفتاح الخدمة في متغيرات البيئة (Environment Variables)
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
    });
    console.log("🚀 SDM Market Bot Started | Middleman & Finance Systems Active");
} catch (error) {
    console.error("❌ Initialization Error:", error.message);
    process.exit(1);
}

const db = admin.database();

// دالة مساعدة لإرسال التنبيهات الفورية داخل التطبيق
function sendAlert(uid, msg, type = 'success') {
    db.ref(`alerts/${uid}`).push({
        msg: msg,
        type: type,
        date: admin.database.ServerValue.TIMESTAMP
    });
}

// --- 2. محرك العمليات المالية والتحويلات ---
async function processFinance() {
    try {
        // [أ] معالجة تحويل الرصيد المباشر (عبر ID المكون من 6 أرقام)
        const transRef = db.ref('requests/transfers');
        const transSnap = await transRef.orderByChild('status').equalTo('pending').once('value');
        
        if (transSnap.exists()) {
            for (const [id, t] of Object.entries(transSnap.val())) {
                const amount = parseFloat(t.amount);
                // البحث عن UID المستلم باستخدام الرقم التعريفي
                const userQuery = await db.ref('users').orderByChild('numericId').equalTo(String(t.toId)).once('value');
                
                if (userQuery.exists()) {
                    const targetUid = Object.keys(userQuery.val())[0];
                    const senderRef = db.ref(`users/${t.from}/sdmBalance`);
                    
                    // خصم الرصيد من المرسل مع معالجة حالة الـ Null
                    const senderTx = await senderRef.transaction(currentBal => {
                        if (currentBal === null) return currentBal; // انتظر جلب البيانات
                        if (currentBal < amount) return undefined; // إلغاء إذا الرصيد غير كافٍ
                        return parseFloat((currentBal - amount).toFixed(2));
                    });

                    if (senderTx.committed) {
                        // إضافة الرصيد للمستلم
                        await db.ref(`users/${targetUid}/sdmBalance`).transaction(b => {
                            if (b === null) return amount;
                            return parseFloat(((b || 0) + amount).toFixed(2));
                        });
                        
                        await transRef.child(id).update({ status: 'completed' });
                        sendAlert(targetUid, `💰 استلمت ${amount} SDM من ${t.fromName}`, 'success');
                        sendAlert(t.from, `✅ تم تحويل ${amount} SDM بنجاح إلى الرقم ${t.toId}`, 'success');
                        console.log(`✅ Transfer Done: ${amount} from ${t.from} to ${targetUid}`);
                    } else {
                        await transRef.child(id).update({ status: 'failed_insufficient_funds' });
                        sendAlert(t.from, `❌ فشل التحويل: رصيدك الحالي (${senderTx.snapshot.val() || 0}) غير كافٍ`, 'error');
                    }
                } else {
                    await transRef.child(id).update({ status: 'failed_invalid_id' });
                    sendAlert(t.from, `❌ فشل التحويل: الرقم ${t.toId} غير موجود في النظام`, 'error');
                }
            }
        }

        // [ب] نظام الوسيط: المرحلة 1 (حجز المال من المشتري)
        const escRef = db.ref('requests/escrow_deals');
        const pendingLock = await escRef.orderByChild('status').equalTo('pending_delivery').once('value');
        
        if (pendingLock.exists()) {
            for (const [id, d] of Object.entries(pendingLock.val())) {
                const amount = parseFloat(d.amount);
                const buyerRef = db.ref(`users/${d.buyerId}/sdmBalance`);

                const lockTx = await buyerRef.transaction(bal => {
                    if (bal === null) return bal;
                    if (bal < amount) return undefined;
                    return parseFloat((bal - amount).toFixed(2));
                });

                if (lockTx.committed) {
                    await escRef.child(id).update({ status: 'secured' });
                    // تحديث المنشور في السوق ليظهر "قيد الشراء"
                    await db.ref(`${d.path}/${d.postId}`).update({ pending: true });
                    
                    sendAlert(d.buyerId, `🔒 تم حجز ${amount} SDM. المال الآن في أمان الوسيط لحين استلامك السلعة.`, 'info');
                    sendAlert(d.sellerId, `🔔 خبر سار! قام مشترٍ بحجز سلعتك: ${d.itemTitle}. يرجى تسليمها له الآن.`, 'success');
                    console.log(`🔒 Escrow Secured: ${d.itemTitle} for ${amount}`);
                } else {
                    await escRef.child(id).update({ status: 'failed_insufficient_funds' });
                    // إعادة المنشور للحالة العادية إذا فشل الدفع
                    await db.ref(`${d.path}/${d.postId}`).update({ pending: false });
                    sendAlert(d.buyerId, `❌ لم يتم حجز السلعة لأن رصيدك غير كافٍ.`, 'error');
                }
            }
        }

        // [ج] نظام الوسيط: المرحلة 2 (تحرير المال للبائع عند التأكيد)
        const pendingRelease = await escRef.orderByChild('status').equalTo('confirmed_by_buyer').once('value');
        
        if (pendingRelease.exists()) {
            for (const [id, d] of Object.entries(pendingRelease.val())) {
                const amount = parseFloat(d.amount);
                const sellerRef = db.ref(`users/${d.sellerId}/sdmBalance`);

                // إضافة المبلغ للبائع
                await sellerRef.transaction(b => {
                    if (b === null) return amount;
                    return parseFloat(((b || 0) + amount).toFixed(2));
                });
                
                await escRef.child(id).update({ status: 'completed', completedAt: Date.now() });
                
                // وسم المنشور كمباع نهائياً
                await db.ref(`${d.path}/${d.postId}`).update({ 
                    sold: true, 
                    pending: false, 
                    soldDate: admin.database.ServerValue.TIMESTAMP 
                });

                sendAlert(d.sellerId, `💰 تم استلام ${amount} SDM في محفظتك مقابل بيع: ${d.itemTitle}`, 'success');
                sendAlert(d.buyerId, `📦 تم إغلاق الصفقة بنجاح. شكراً لثقتك بالوسيط الآمن.`, 'success');
                console.log(`✅ Escrow Completed: ${d.itemTitle}`);
            }
        }

    } catch (err) {
        console.error("Finance Engine Error:", err.message);
    }
}

// --- 3. نظام تنظيف السوق (حذف المباع بعد 24 ساعة) ---
async function cleanupMarket() {
    try {
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;
        const paths = ['posts', 'vip_posts'];

        for (const path of paths) {
            const snap = await db.ref(path).orderByChild('sold').equalTo(true).once('value');
            if (snap.exists()) {
                for (const [id, post] of Object.entries(snap.val())) {
                    if (post.soldDate && (now - post.soldDate) > oneDay) {
                        await db.ref(`${path}/${id}`).remove();
                        await db.ref(`comments/${path}/${id}`).remove();
                        console.log(`🗑️ Cleanup: Removed expired post ${id}`);
                    }
                }
            }
        }
    } catch (err) {
        console.error("Cleanup Error:", err.message);
    }
}

// --- 4. معالجة اشتراكات VIP ---
async function processVIP() {
    try {
        const vipSnap = await db.ref('requests/vip_subscriptions').orderByChild('status').equalTo('pending').once('value');
        if (vipSnap.exists()) {
            for (const [id, v] of Object.entries(vipSnap.val())) {
                const cost = parseFloat(v.cost);
                const userRef = db.ref(`users/${v.userId}`);
                
                const tx = await userRef.transaction(u => {
                    if (u === null) return u;
                    if ((u.sdmBalance || 0) >= cost) {
                        const now = Date.now();
                        u.sdmBalance = parseFloat((u.sdmBalance - cost).toFixed(2));
                        u.vipStatus = 'active';
                        u.vipExpiry = ((u.vipExpiry > now) ? u.vipExpiry : now) + (v.days * 86400000);
                        return u;
                    }
                    return undefined;
                });

                if (tx.committed) {
                    await db.ref(`requests/vip_subscriptions/${id}`).update({ status: 'completed' });
                    sendAlert(v.userId, `👑 مبروك! تم تفعيل اشتراك VIP بنجاح.`, 'success');
                } else {
                    await db.ref(`requests/vip_subscriptions/${id}`).update({ status: 'failed_no_balance' });
                    sendAlert(v.userId, `❌ رصيدك غير كافٍ لتجديد اشتراك VIP.`, 'error');
                }
            }
        }
    } catch (err) {
        console.error("VIP Engine Error:", err.message);
    }
}

// --- 5. تشغيل المجدول (Intervals) ---
// يعمل محرك المالية كل 5 ثوانٍ لضمان سرعة فائقة
setInterval(processFinance, 5000);

// يعمل محرك الـ VIP كل 10 ثوانٍ
setInterval(processVIP, 10000);

// يعمل محرك التنظيف كل ساعة
setInterval(cleanupMarket, 3600000);

// --- 6. إعداد السيرفر ---
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('SDM Secure Bot is Online 🚀'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
