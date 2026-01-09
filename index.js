const express = require('express');
const admin = require("firebase-admin");
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// 1. الاتصال الآمن (Secure Connection)
// ============================================================
let serviceAccount;
try {
    const envKey = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (envKey) {
        serviceAccount = JSON.parse(envKey);
        console.log("✅ Credentials loaded.");
    } else {
        console.error("❌ CRITICAL: FIREBASE_SERVICE_ACCOUNT is missing.");
    }
} catch (error) { console.error("❌ Error parsing credentials:", error); }

if (serviceAccount) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
    });
}

const db = admin.apps.length ? admin.database() : null;

// ============================================================
// 2. تشغيل السيرفر ونبض القلب
// ============================================================
app.get('/', (req, res) => { res.send('🛡️ SDM CORE ENGINE (SECURE BANK) IS RUNNING.'); });

app.listen(PORT, () => { 
    console.log(`🚀 Server running on port ${PORT}`); 
});

if (db) {
    console.log("💓 System Heartbeat started...");
    setInterval(() => {
        // تحديث حالة النظام كل دقيقة للسماح للموقع بالعمل
        db.ref('system/status').update({ 
            last_online: admin.database.ServerValue.TIMESTAMP 
        }).catch(err => console.error('Heartbeat Error:', err));
    }, 60000);
}

// ============================================================
// 3. المحرك المالي (Financial Engine) - أهم جزء
// ============================================================
if (db) {
    console.log("💰 Financial Engine is listening for requests...");

    // أ) معالجة طلبات التحويل (Transfers)
    db.ref('requests/transfers').on('child_added', async (snap) => {
        const req = snap.val();
        const reqId = snap.key;
        
        // التحقق من صحة البيانات
        if (!req.from || !req.to || !req.amount || req.amount <= 0) {
            return snap.ref.remove(); // حذف الطلبات الفاسدة
        }

        // تنفيذ عملية ذرية (Transaction) لضمان عدم سرقة الرصيد
        await db.ref(`users/${req.from}/sdmBalance`).transaction(currentBal => {
            // هل يملك الرصيد الكافي؟
            if ((currentBal || 0) < req.amount) {
                return; // إلغاء العملية (Abort)
            }
            return (currentBal || 0) - req.amount; // خصم المبلغ
        }, async (error, committed, snapshot) => {
            if (error) {
                console.error("Transfer Error:", error);
            } else if (!committed) {
                // فشل الخصم (رصيد غير كاف)
                db.ref(`alerts/${req.from}`).push({ msg: "❌ فشل التحويل: رصيد غير كاف", type: "error" });
                db.ref(`requests/transfers/${reqId}`).remove();
            } else {
                // نجح الخصم -> إضافة المبلغ للمستلم
                await db.ref(`users/${req.to}/sdmBalance`).transaction(b => (b || 0) + req.amount);
                
                // تسجيل في السجل الأبدي
                db.ref('transactions').push({
                    type: 'transfer', from: req.from, to: req.to, amount: req.amount, date: Date.now()
                });

                // إرسال إشعارات
                db.ref(`alerts/${req.to}`).push({ msg: `💰 استلمت ${req.amount} SDM`, type: "success" });
                db.ref(`alerts/${req.from}`).push({ msg: `✅ تم إرسال ${req.amount} SDM`, type: "success" });

                // حذف الطلب
                db.ref(`requests/transfers/${reqId}`).remove();
                console.log(`✅ Transfer Success: ${req.amount} from ${req.from} to ${req.to}`);
            }
        });
    });

    // ب) معالجة أوامر الشراء (Market BUY)
    db.ref('market/orders/buy').on('child_added', async (snap) => {
        const order = snap.val();
        const orderId = snap.key;
        
        // حساب التكلفة الكلية
        const totalCost = order.price * order.amount;

        // 1. محاولة حجز المبلغ من المشتري
        let fundsLocked = false;
        await db.ref(`users/${order.uP}/sdmBalance`).transaction(bal => {
            if ((bal || 0) < totalCost) return; // رصيد غير كاف
            return (bal || 0) - totalCost; // خصم المبلغ (تجميده)
        }, (err, committed) => {
            if (committed) fundsLocked = true;
        });

        if (!fundsLocked) {
            // حذف الطلب إذا لم يوجد رصيد
            console.log(`❌ Rejected Buy Order: No funds for ${order.uP}`);
            return db.ref(`market/orders/buy/${orderId}`).remove();
        }

        // 2. البحث عن بائع (Matching Engine)
        // نبحث عن أرخص بائع سعره يساوي أو أقل من سعر الشراء
        const matchSnap = await db.ref('market/orders/sell')
                                  .orderByChild('price')
                                  .endAt(order.price)
                                  .limitToFirst(1)
                                  .once('value');
        
        if (matchSnap.exists()) {
            // تم العثور على صفقة!
            const sellKey = Object.keys(matchSnap.val())[0];
            const sellOrder = matchSnap.val()[sellKey];
            
            // تحديد الكمية والسعر (السعر يتم حسب البائع لأنه الأرخص)
            const tradeAmount = Math.min(order.amount, sellOrder.amount);
            const executionPrice = sellOrder.price;
            const tradeValue = tradeAmount * executionPrice;

            console.log(`⚡ TRADE MATCH: Buy(${orderId}) & Sell(${sellKey}) @ ${executionPrice}`);

            // تنفيذ التسوية:
            // البائع: يحصل على SDM + يخصم منه MRK
            await db.ref(`users/${sellOrder.uP}/sdmBalance`).transaction(b => (b || 0) + tradeValue);
            await db.ref(`users/${sellOrder.uP}/mrkBalance`).transaction(m => (m || 0) - tradeAmount);

            // المشتري: يحصل على MRK (الـ SDM تم خصمه مسبقاً)
            await db.ref(`users/${order.uP}/mrkBalance`).transaction(m => (m || 0) + tradeAmount);
            
            // *مهم:* إذا اشترى بسعر أرخص مما طلب، نرجع له الفرق
            const refund = (order.price - executionPrice) * tradeAmount;
            if (refund > 0) {
                await db.ref(`users/${order.uP}/sdmBalance`).transaction(b => (b || 0) + refund);
            }

            // تسجيل الصفقة للسوق
            db.ref('market/history').push({ price: executionPrice, amount: tradeAmount, time: Date.now() });
            db.ref('market/last_price').set(executionPrice);

            // تحديث الطلبات (Partial Fills)
            // تحديث طلب الشراء
            if (order.amount > tradeAmount) {
                db.ref(`market/orders/buy/${orderId}`).update({ amount: order.amount - tradeAmount });
            } else {
                db.ref(`market/orders/buy/${orderId}`).remove();
            }
            // تحديث طلب البيع
            if (sellOrder.amount > tradeAmount) {
                db.ref(`market/orders/sell/${sellKey}`).update({ amount: sellOrder.amount - tradeAmount });
            } else {
                db.ref(`market/orders/sell/${sellKey}`).remove();
            }

        } else {
            // لا يوجد بائع حالياً، يظل الطلب معلقاً (والرصيد محجوز)
            console.log(`⏳ Buy Order Queued: ${orderId}`);
        }
    });

    // ج) معالجة أوامر البيع (Market SELL)
    db.ref('market/orders/sell').on('child_added', async (snap) => {
        const order = snap.val();
        const orderId = snap.key;

        // 1. محاولة حجز عملة MRK من البائع
        let assetLocked = false;
        await db.ref(`users/${order.uP}/mrkBalance`).transaction(bal => {
            if ((bal || 0) < order.amount) return;
            return (bal || 0) - order.amount; // حجز الكمية
        }, (err, committed) => {
            if (committed) assetLocked = true;
        });

        if (!assetLocked) {
            console.log(`❌ Rejected Sell Order: No MRK for ${order.uP}`);
            return db.ref(`market/orders/sell/${orderId}`).remove();
        }

        // 2. البحث عن مشتري (اختياري هنا لأن كود الشراء يقوم بالمطابقة أيضاً)
        // سيظل الطلب في قائمة الانتظار حتى يأتي مشتري أو يقوم كود الشراء باكتشافه
        console.log(`⏳ Sell Order Queued: ${orderId}`);
    });

    // د) معالجة التقييمات (Ratings)
    db.ref('rating_queue').on('child_added', async (snap) => {
        const d = snap.val();
        await db.ref(`users/${d.target}`).transaction(u => {
            if (!u) return u;
            const count = u.ratingCount || 1;
            const newR = ((u.rating || 5) * count + d.stars) / (count + 1);
            u.rating = parseFloat(newR.toFixed(1));
            u.ratingCount = count + 1;
            return u;
        });
        snap.ref.remove();
    });
}
