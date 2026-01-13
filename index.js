const admin = require('firebase-admin');
const functions = require('firebase-functions');

// تهيئة Firebase
const serviceAccount = require('./service-account-key.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
});

const db = admin.database();

// البوت الأساسي لتداول MRK
exports.processTradeOrders = functions.database
  .ref('/trade_orders/{orderId}')
  .onCreate(async (snapshot, context) => {
    const order = snapshot.val();
    const orderId = context.params.orderId;
    
    if (order.status !== 'pending') return null;
    
    try {
      // تحديث الحالة إلى جاري المعالجة
      await snapshot.ref.update({ status: 'processing' });
      
      // البحث عن مطابقة في الطلبات المعاكسة
      const oppositeType = order.type === 'buy' ? 'sell' : 'buy';
      const ordersRef = db.ref(`market/orders/${oppositeType}`);
      
      const oppositeOrders = await ordersRef
        .orderByChild('price')
        .once('value');
      
      let matched = false;
      let remainingAmount = order.amount;
      let executedTrades = [];
      
      oppositeOrders.forEach(async (oppositeSnap) => {
        if (matched || remainingAmount <= 0) return;
        
        const oppositeOrder = oppositeSnap.val();
        const oppositeOrderId = oppositeSnap.key;
        
        // التحقق من المطابقة
        if (
          (order.type === 'buy' && order.price >= oppositeOrder.price) ||
          (order.type === 'sell' && order.price <= oppositeOrder.price)
        ) {
          // حساب الكمية القابلة للتنفيذ
          const tradeAmount = Math.min(remainingAmount, oppositeOrder.amount);
          const tradePrice = oppositeOrder.price;
          
          // تحديث أرصدة المستخدمين
          if (order.type === 'buy') {
            // المشتري يحصل على MRK، البائع يحصل على SDM
            await updateUserBalance(order.userId, 'mrkBalance', tradeAmount, '+');
            await updateUserBalance(oppositeOrder.userId, 'sdmBalance', tradeAmount * tradePrice, '+');
          } else {
            // البائع يحصل على SDM، المشتري يحصل على MRK
            await updateUserBalance(order.userId, 'sdmBalance', tradeAmount * tradePrice, '+');
            await updateUserBalance(oppositeOrder.userId, 'mrkBalance', tradeAmount, '+');
          }
          
          // تسجيل الصفقة في التاريخ
          await db.ref('market/history').push({
            price: tradePrice,
            amount: tradeAmount,
            buyer: order.type === 'buy' ? order.userId : oppositeOrder.userId,
            seller: order.type === 'sell' ? order.userId : oppositeOrder.userId,
            timestamp: Date.now()
          });
          
          // تحديث سعر السوق الأخير
          await db.ref('market/current_price').set(tradePrice);
          
          // تحديث كمية الطلب المقابل
          const newOppositeAmount = oppositeOrder.amount - tradeAmount;
          if (newOppositeAmount > 0) {
            await oppositeSnap.ref.update({ amount: newOppositeAmount });
          } else {
            await oppositeSnap.ref.remove();
          }
          
          remainingAmount -= tradeAmount;
          executedTrades.push({
            price: tradePrice,
            amount: tradeAmount,
            withUser: oppositeOrder.userId
          });
          
          if (remainingAmount <= 0) {
            matched = true;
          }
        }
      });
      
      // تحديث حالة الطلب
      if (matched) {
        await snapshot.ref.update({
          status: 'completed',
          executedTrades: executedTrades,
          completedAt: Date.now()
        });
        
        // إذا بقي جزء من الطلب غير منفذ، تضعه في دفتر الطلبات
        if (remainingAmount > 0) {
          await db.ref(`market/orders/${order.type}`).push({
            userId: order.userId,
            price: order.price,
            amount: remainingAmount,
            timestamp: Date.now()
          });
        }
      } else {
        // إذا لم توجد مطابقة، يضاف الطلب لدفتر الطلبات
        await db.ref(`market/orders/${order.type}`).push({
          userId: order.userId,
          price: order.price,
          amount: order.amount,
          timestamp: Date.now()
        });
        
        await snapshot.ref.update({
          status: 'queued',
          queuedAt: Date.now()
        });
      }
      
      // إرسال إشعارات للمستخدمين
      await sendNotification(order.userId, 'تم معالجة طلبك');
      
    } catch (error) {
      console.error('Error processing order:', error);
      await snapshot.ref.update({
        status: 'failed',
        error: error.message
      });
    }
    
    return null;
  });

// دالة مساعدة لتحديث أرصدة المستخدمين
async function updateUserBalance(userId, balanceType, amount, operation) {
  const userRef = db.ref(`users/${userId}/${balanceType}`);
  const snapshot = await userRef.once('value');
  const currentBalance = snapshot.val() || 0;
  
  let newBalance;
  if (operation === '+') {
    newBalance = currentBalance + amount;
  } else {
    newBalance = currentBalance - amount;
  }
  
  await userRef.set(newBalance);
  return newBalance;
}

// دالة إرسال الإشعارات
async function sendNotification(userId, message) {
  await db.ref(`alerts/${userId}`).push({
    msg: message,
    type: 'info',
    timestamp: Date.now()
  });
}

// بوت للمهام الأخرى (شراء SDM، طلبات الألعاب، VIP)
exports.processOtherRequests = functions.database
  .ref('/pending_requests/{requestId}')
  .onCreate(async (snapshot, context) => {
    const request = snapshot.val();
    const requestId = context.params.requestId;
    
    // هنا يمكنك إضافة منطق معالجة الطلبات الأخرى
    // مثل: طلبات شراء SDM، شحن الألعاب، تفعيل VIP
    
    return null;
  });
