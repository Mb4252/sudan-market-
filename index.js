const admin = require('firebase-admin');
const express = require('express');
const app = express();

// --- 1. إعداد الاتصال بـ Firebase ---
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
    });
    console.log("✅ بوت SDM يعمل بنجاح | تم تفعيل نظام الفصل الإداري الفوري");
} catch (error) {
    console.error("❌ خطأ في تشغيل البوت:", error.message);
    process.exit(1);
}

const db = admin.database();

// دالة إرسال التنبيهات للمستخدمين
function sendAlert(uid, msg, type = 'success') {
    db.ref(`alerts/${uid}`).push({
        msg,
        type,
        date: admin.database.ServerValue.TIMESTAMP
    });
}

// --- 2. المحرك المالي والوسيط (Escrow) المطور ---
async function processFinance() {
    const escRef = db.ref('requests/escrow_deals');
    const eSnap = await escRef.once('value');
    
    if (eSnap.exists()) {
        const deals = eSnap.val();
        for (const [id, d] of Object.entries(deals)) {
            const amount = parseFloat(d.amount);

            // [أ] حجز المبلغ (من pending_delivery إلى secured)
            if (d.status === 'pending_delivery') {
                const buyerRef = db.ref(`users/${d.buyerId}/sdmBalance`);
                const tx = await buyerRef.transaction(bal => {
                    if (bal === null) return 0;
                    if (parseFloat(bal) < amount) return; 
                    return parseFloat((parseFloat(bal) - amount).toFixed(2));
                });

                if (tx.committed) {
                    await escRef.child(id).update({ status: 'secured' });
                    sendAlert(d.buyerId, `✅ تم حجز ${amount} SDM لطلب شراء: ${d.itemTitle}`, 'success');
                    sendAlert(d.sellerId, `🔔 مبلغ سلعتك (${d.itemTitle}) محجوز لدى الوسيط. يمكنك تسليم السلعة الآن.`, 'info');
                } else {
                    await escRef.child(id).update({ status: 'failed' });
                    await db.ref(`posts/${d.postId}`).update({ pending: false });
                    await db.ref(`vip_posts/${d.postId}`).update({ pending: false });
                    sendAlert(d.buyerId, `❌ رصيدك لا يكفي لشراء ${d.itemTitle}`, 'error');
                }
            }

            // [ب] تأكيد الاستلام العادي (بواسطة المشتري)
            if (d.status === 'confirmed_by_buyer') {
                await db.ref(`users/${d.sellerId}/sdmBalance`).transaction(c => parseFloat((parseFloat(c || 0) + amount).toFixed(2)));
                await escRef.child(id).update({ status: 'completed', resolvedBy: 'buyer' });
                
                const postUpdates = { pending: false, sold: true, soldDate: admin.database.ServerValue.TIMESTAMP };
                await db.ref(`posts/${d.postId}`).update(postUpdates).catch(()=>{});
                await db.ref(`vip_posts/${d.postId}`).update(postUpdates).catch(()=>{});

                sendAlert(d.sellerId, `💰 تم إيداع ${amount} SDM في رصيدك (تأكيد من المشتري)`, 'success');
                sendAlert(d.buyerId, `📦 تم إتمام الشراء بنجاح.`, 'success');
            }

            // [ج] *** التحديث الجديد: فصل الأدمن لصالح البائع ***
            if (d.status === 'admin_approve_seller') {
                await db.ref(`users/${d.sellerId}/sdmBalance`).transaction(c => parseFloat((parseFloat(c || 0) + amount).toFixed(2)));
                await escRef.child(id).update({ status: 'completed', resolvedBy: 'admin_gavel' });

                const postUpdates = { pending: false, sold: true, soldDate: admin.database.ServerValue.TIMESTAMP };
                await db.ref(`posts/${d.postId}`).update(postUpdates).catch(()=>{});
                
                sendAlert(d.sellerId, `⚖️ قرار إداري: تم تحويل ${amount} SDM لصالحك في النزاع على: ${d.itemTitle}`, 'success');
                sendAlert(d.buyerId, `⚖️ قرار إداري: تم إنهاء النزاع وتحويل المبلغ للبائع.`, 'info');
            }

            // [د] *** التحديث الجديد: فصل الأدمن لصالح المشتري (إرجاع المال) ***
            if (d.status === 'admin_refund_buyer') {
                await db.ref(`users/${d.buyerId}/sdmBalance`).transaction(c => parseFloat((parseFloat(c || 0) + amount).toFixed(2)));
                await escRef.child(id).update({ status: 'refunded', resolvedBy: 'admin_gavel' });

                // إرجاع المنتج للحالة "متاح" في السوق لأنه لم يُبع فعلياً
                await db.ref(`posts/${d.postId}`).update({ pending: false, sold: false }).catch(()=>{});
                
                sendAlert(d.buyerId, `⚖️ قرار إداري: تم استرداد ${amount} SDM إلى حسابك بعد الفصل في النزاع`, 'success');
                sendAlert(d.sellerId, `⚖️ قرار إداري: تم إرجاع المبلغ للمشتري وإلغاء عملية البيع.`, 'error');
            }
        }
    }

    // (بقية العمليات: التحويل المباشر، اشتراكات VIP، شحن الألعاب...)
    await processDirectTransfers();
    await processVipSubs();
}

// دالة معالجة التحويلات المباشرة (تم فصلها للتنظيم)
async function processDirectTransfers() {
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
                    sendAlert(recUid, `💰 استلمت تحويل بقيمة ${amount} SDM من ${t.fromName}`, 'success');
                    sendAlert(t.from, `✅ تم تحويل ${amount} SDM بنجاح للرقم ${t.toId}`, 'success');
                }
            } else {
                await tRef.child(id).update({ status: 'failed', reason: 'ID invalid' });
                sendAlert(t.from, `❌ الرقم ${t.toId} غير مسجل`, 'error');
            }
        }
    }
}

// دالة معالجة الـ VIP
async function processVipSubs() {
    const vipReqRef = db.ref('requests/vip_subscriptions');
    const vSnap = await vipReqRef.orderByChild('status').equalTo('pending').once('value');
    if (vSnap.exists()) {
        for (const [id, t] of Object.entries(vSnap.val())) {
            const cost = parseFloat(t.cost);
            await db.ref(`users/${t.userId}`).transaction(u => {
                if (u && parseFloat(u.sdmBalance || 0) >= cost) {
                    const now = Date.now();
                    const currentExpiry = (u.vipExpiry && u.vipExpiry > now) ? u.vipExpiry : now;
                    u.sdmBalance = parseFloat((parseFloat(u.sdmBalance) - cost).toFixed(2));
                    u.vipStatus = 'active';
                    u.vipExpiry = currentExpiry + (parseInt(t.days) * 86400000);
                    return u;
                }
            }).then(res => {
                if(res.committed) vipReqRef.child(id).update({ status: 'completed' });
            });
        }
    }
}

// --- 3. المهام الدورية ---
setInterval(processFinance, 5000); // معالجة كل شيء كل 5 ثوانٍ

// --- 4. واجهة السيرفر ---
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('SDM Secure Bot Active 🚀'));
app.listen(PORT, () => console.log(`Server on port ${PORT}`));
