const admin = require('firebase-admin');
const express = require('express');
const app = express();

// --- إعداد Firebase ---
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
    });
    console.log("🚀 SDM Market Bot: ONLINE & READY");
} catch (error) {
    console.error("❌ Firebase Init Error:", error.message);
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

// ================= [ 1. نظام تحويل الرصيد الفوري ] =================
db.ref('requests/transfers').orderByChild('status').equalTo('pending').on('child_added', async (snapshot) => {
    const t = snapshot.val();
    const reqId = snapshot.key;
    const amount = parseFloat(t.amount);

    try {
        const userQuery = await db.ref('users').orderByChild('numericId').equalTo(String(t.toId)).once('value');
        if (userQuery.exists()) {
            const targetUid = Object.keys(userQuery.val())[0];
            const senderRef = db.ref(`users/${t.from}/sdmBalance`);

            const tx = await senderRef.transaction(bal => {
                if (bal >= amount) return parseFloat((bal - amount).toFixed(2));
                return undefined;
            });

            if (tx.committed) {
                await db.ref(`users/${targetUid}/sdmBalance`).transaction(b => parseFloat(((b || 0) + amount).toFixed(2)));
                await db.ref(`requests/transfers/${reqId}`).update({ status: 'completed' });
                
                sendAlert(targetUid, `💰 استلمت ${amount} SDM من ${t.fromName}`, 'success');
                sendAlert(t.from, `✅ تم تحويل ${amount} SDM بنجاح`, 'success');
                console.log(`✅ Transfer Done: ${amount} to ${t.toId}`);
            } else {
                await db.ref(`requests/transfers/${reqId}`).update({ status: 'failed_no_balance' });
                sendAlert(t.from, `❌ فشل التحويل: رصيدك غير كافٍ`, 'error');
            }
        } else {
            await db.ref(`requests/transfers/${reqId}`).update({ status: 'failed_not_found' });
            sendAlert(t.from, `❌ الرقم التعريف ${t.toId} غير صحيح`, 'error');
        }
    } catch (e) { console.error("Transfer Error:", e); }
});

// ================= [ 2. نظام الوسيط الآمن ] =================

// المرحلة 1: حجز المال (Locking)
db.ref('requests/escrow_deals').orderByChild('status').equalTo('pending_delivery').on('child_added', async (snapshot) => {
    const d = snapshot.val();
    const dealId = snapshot.key;
    const amount = parseFloat(d.amount);

    try {
        const buyerRef = db.ref(`users/${d.buyerId}/sdmBalance`);
        const lockTx = await buyerRef.transaction(bal => {
            if (bal >= amount) return parseFloat((bal - amount).toFixed(2));
            return undefined;
        });

        if (lockTx.committed) {
            await db.ref(`requests/escrow_deals/${dealId}`).update({ status: 'secured' });
            await db.ref(`${d.path}/${d.postId}`).update({ pending: true });
            
            sendAlert(d.buyerId, `🔒 تم حجز ${amount} SDM. أكد الاستلام بعد وصول السلعة.`, 'success');
            sendAlert(d.sellerId, `🔔 مشترٍ حجز ${d.itemTitle}. سلم السلعة الآن!`, 'info');
            console.log(`🔒 Escrow Secured: ${d.itemTitle}`);
        } else {
            await db.ref(`requests/escrow_deals/${dealId}`).update({ status: 'failed_no_balance' });
            sendAlert(d.buyerId, `❌ رصيدك لا يكفي لإتمام صفقة الوسيط`, 'error');
        }
    } catch (e) { console.error("Escrow Stage 1 Error:", e); }
});

// المرحلة 2: تحرير المال (Release)
db.ref('requests/escrow_deals').orderByChild('status').equalTo('confirmed_by_buyer').on('child_added', async (snapshot) => {
    const d = snapshot.val();
    const dealId = snapshot.key;
    const amount = parseFloat(d.amount);

    try {
        await db.ref(`users/${d.sellerId}/sdmBalance`).transaction(b => parseFloat(((b || 0) + amount).toFixed(2)));
        await db.ref(`requests/escrow_deals/${dealId}`).update({ status: 'completed', completedAt: Date.now() });
        await db.ref(`${d.path}/${d.postId}`).update({ sold: true, pending: false, soldDate: Date.now() });

        sendAlert(d.sellerId, `💰 استلمت ${amount} SDM مقابل بيع ${d.itemTitle}`, 'success');
        sendAlert(d.buyerId, `✅ تمت الصفقة بنجاح. شكراً لاستخدام الوسيط الآمن.`, 'success');
        console.log(`💰 Escrow Released: ${d.itemTitle}`);
    } catch (e) { console.error("Escrow Stage 2 Error:", e); }
});

// ================= [ 3. نظام تفعيل الـ VIP الفوري ] =================
db.ref('requests/vip_subscriptions').orderByChild('status').equalTo('pending').on('child_added', async (snapshot) => {
    const v = snapshot.val();
    const reqId = snapshot.key;
    const cost = parseFloat(v.cost);

    try {
        const userRef = db.ref(`users/${v.userId}`);
        const vipTx = await userRef.transaction(u => {
            if (u && (u.sdmBalance || 0) >= cost) {
                const now = Date.now();
                u.sdmBalance = parseFloat((u.sdmBalance - cost).toFixed(2));
                u.vipStatus = 'active';
                u.vipExpiry = ((u.vipExpiry > now) ? u.vipExpiry : now) + (v.days * 86400000);
                return u;
            }
            return undefined;
        });

        if (vipTx.committed) {
            await db.ref(`requests/vip_subscriptions/${reqId}`).update({ status: 'completed' });
            sendAlert(v.userId, `👑 مبروك! تم تفعيل اشتراك VIP لمدة ${v.days} يوم`, 'success');
            console.log(`👑 VIP Activated for: ${v.userName}`);
        } else {
            await db.ref(`requests/vip_subscriptions/${reqId}`).update({ status: 'failed_no_balance' });
            sendAlert(v.userId, `❌ رصيدك لا يكفي لشراء اشتراك VIP`, 'error');
        }
    } catch (e) { console.error("VIP Error:", e); }
});

// ================= [ 4. تنظيف المنشورات المباعة (كل ساعة) ] =================
setInterval(async () => {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const paths = ['posts', 'vip_posts'];

    for (const path of paths) {
        const snap = await db.ref(path).orderByChild('sold').equalTo(true).once('value');
        if (snap.exists()) {
            for (const [id, post] of Object.entries(snap.val())) {
                if (post.soldDate && (now - post.soldDate) > oneDay) {
                    await db.ref(`${path}/${id}`).remove();
                    console.log(`🗑️ Cleaned: ${id}`);
                }
            }
        }
    }
}, 3600000);

// واجهة السيرفر لـ Render
app.get('/', (req, res) => res.send('SDM Security Bot: ACTIVE 🚀'));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
