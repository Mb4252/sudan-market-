const admin = require('firebase-admin');
const http = require('http');

// --- 1. إعداد الاتصال بقاعدة البيانات ---
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
    });
    console.log("✅ محرك SDM الذكي يعمل الآن.. مراقبة العمليات مفعلة");
} catch (e) {
    console.error("❌ خطأ فادح في الاتصال: تأكد من ملف الـ JSON وصحة الرابط", e.message);
    process.exit(1);
}

const db = admin.database();
let isProcessing = false;

// --- 2. محرك تحويل الأموال (Transfer Engine) ---
async function processTransfers() {
    const ref = db.ref('requests/transfers');
    const snap = await ref.orderByChild('status').equalTo('pending').limitToFirst(5).once('value');
    if (!snap.exists()) return;

    const tasks = snap.val();
    for (const id in tasks) {
        const { from, toId, amount, fromName } = tasks[id];
        const numAmount = Number(amount);
        const cleanToId = String(toId).trim();

        try {
            // البحث عن المستلم بواسطة الرقم التعريفي
            const userSnap = await db.ref('users').orderByChild('numericId').equalTo(cleanToId).once('value');
            if (!userSnap.exists()) {
                await ref.child(id).update({ status: 'failed', reason: 'رقم المستلم غير صحيح' });
                sendAlert(from, `❌ فشل التحويل: الرقم ${cleanToId} غير موجود`, 'error');
                continue;
            }

            const receiverUid = Object.keys(userSnap.val())[0];
            if (from === receiverUid) {
                await ref.child(id).update({ status: 'failed', reason: 'لا يمكن التحويل لنفسك' });
                continue;
            }

            // تنفيذ العملية المالية بنظام الـ Transaction (أمان 100%)
            const senderBalRef = db.ref(`users/${from}/sdmBalance`);
            const tx = await senderBalRef.transaction(current => {
                if ((current || 0) >= numAmount) return current - numAmount;
                return; // إلغاء إذا لم يكفِ الرصيد
            });

            if (tx.committed) {
                await db.ref(`users/${receiverUid}/sdmBalance`).transaction(c => (c || 0) + numAmount);
                await ref.child(id).update({ status: 'completed', completedAt: admin.database.ServerValue.TIMESTAMP });
                
                // توثيق في سجل المعاملات العالمي
                db.ref('transactions').push({ from, to: receiverUid, amount: numAmount, date: Date.now(), type: 'transfer' });

                sendAlert(receiverUid, `💰 استلمت ${numAmount} SDM من ${fromName}`, 'success');
                sendAlert(from, `✅ تم تحويل ${numAmount} SDM بنجاح للرقم ${cleanToId}`, 'success');
                console.log(`[OK] Transfer Done: ${numAmount} from ${from} to ${receiverUid}`);
            } else {
                await ref.child(id).update({ status: 'failed', reason: 'رصيد غير كافٍ' });
                sendAlert(from, `❌ رصيدك الحالي لا يكفي لإتمام التحويل`, 'error');
            }
        } catch (err) { console.error("Transfer Error:", err.message); }
    }
}

// --- 3. محرك اشتراكات VIP (VIP Engine) ---
async function processVipSubscriptions() {
    const ref = db.ref('requests/vip_subscriptions');
    const snap = await ref.orderByChild('status').equalTo('pending').once('value');
    if (!snap.exists()) return;

    const tasks = snap.val();
    for (const id in tasks) {
        const { userId, days, cost } = tasks[id];
        try {
            const userRef = db.ref(`users/${userId}`);
            const tx = await userRef.transaction(user => {
                if (user && (user.sdmBalance || 0) >= cost) {
                    const now = Date.now();
                    const currentExpiry = (user.vipExpiry && user.vipExpiry > now) ? user.vipExpiry : now;
                    user.sdmBalance -= cost;
                    user.vipStatus = 'active';
                    user.vipExpiry = currentExpiry + (days * 24 * 60 * 60 * 1000);
                    return user;
                }
                return;
            });

            if (tx.committed) {
                await ref.child(id).update({ status: 'completed' });
                sendAlert(userId, `✨ مبروك! تم تفعيل اشتراك VIP لمدة ${days} يوم بنجاح`, 'success');
            } else {
                await ref.child(id).update({ status: 'failed', reason: 'رصيد غير كافٍ' });
                sendAlert(userId, `❌ فشل تفعيل VIP: رصيدك غير كافٍ`, 'error');
            }
        } catch (e) { console.error("VIP Error:", e.message); }
    }
}

// --- 4. محرك الوسيط الآمن (Escrow Engine) ---
async function processEscrowDeals() {
    const ref = db.ref('requests/escrow_deals');
    const snap = await ref.orderByChild('status').equalTo('confirmed_by_buyer').once('value');
    if (!snap.exists()) return;

    const deals = snap.val();
    for (const id in deals) {
        const { sellerId, amount, itemTitle, buyerId } = deals[id];
        try {
            // تحويل المال "المجمد" إلى رصيد البائع
            await db.ref(`users/${sellerId}/sdmBalance`).transaction(c => (c || 0) + Number(amount));
            await ref.child(id).update({ status: 'completed', completedAt: Date.now() });

            sendAlert(sellerId, `✅ استلمت ${amount} SDM ثمن: ${itemTitle}. تم التأكيد من المشتري`, 'success');
            sendAlert(buyerId, `📦 تم إغلاق صفقة (${itemTitle}) بنجاح. شكراً لثقتك`, 'info');
        } catch (e) { console.error("Escrow Error:", e.message); }
    }
}

// --- 5. وظيفة إرسال التنبيهات الفورية ---
function sendAlert(uid, msg, type) {
    db.ref(`alerts/${uid}`).push({
        msg: msg,
        type: type,
        date: admin.database.ServerValue.TIMESTAMP
    });
}

// --- 6. حلقة التشغيل الدائمة (كل 3 ثوانٍ) ---
setInterval(async () => {
    if (isProcessing) return;
    isProcessing = true;
    try {
        await processTransfers();
        await processVipSubscriptions();
        await processEscrowDeals();
    } catch (err) { console.error("Loop Error:", err.message); }
    isProcessing = false;
}, 3000);

// --- 7. خادم الويب (لإبقاء البوت مستيقظاً) ---
http.createServer((req, res) => {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('SDM Master Bot is Online ✅');
}).listen(process.env.PORT || 3000);
