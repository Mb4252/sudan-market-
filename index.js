const express = require('express');
const admin = require('firebase-admin');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// تهيئة Firebase Admin
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
});

const db = admin.database();

// ===== نظام المعالجة التلقائية =====

// 1. بوت التحويلات الآلي
async function processTransfers() {
  try {
    const transfersRef = db.ref('requests/transfers');
    const snapshot = await transfersRef.orderByChild('status').equalTo('pending').once('value');
    
    if (!snapshot.exists()) return;
    
    const transfers = snapshot.val();
    const now = Date.now();
    
    for (const [transferId, transfer] of Object.entries(transfers)) {
      // التحقق من أن التحويل أحدث من 5 ثواني (لتجنب المعالجة المزدوجة)
      if (now - transfer.date < 5000) continue;
      
      const { from, to, amount } = transfer;
      
      // التحقق من وجود المستخدمين
      const fromUser = await db.ref(`users/${from}`).once('value');
      const toUser = db.ref(`users/${to}`).once('value');
      
      if (!fromUser.exists() || !toUser.exists()) {
        await transfersRef.child(transferId).update({ 
          status: 'failed', 
          error: 'المستخدم غير موجود',
          processedAt: now 
        });
        continue;
      }
      
      const fromBalance = fromUser.val().sdmBalance || 0;
      
      // التحقق من الرصيد الكافي
      if (fromBalance < amount) {
        await transfersRef.child(transferId).update({ 
          status: 'failed', 
          error: 'رصيد غير كافٍ',
          processedAt: now 
        });
        continue;
      }
      
      // إجراء التحويل
      await db.ref(`users/${from}`).update({ 
        sdmBalance: fromBalance - amount 
      });
      
      const toBalance = (await toUser).val().sdmBalance || 0;
      await db.ref(`users/${to}`).update({ 
        sdmBalance: toBalance + amount 
      });
      
      // تسجيل المعاملة
      await db.ref('transactions').push({
        type: 'transfer',
        from: from,
        to: to,
        amount: amount,
        date: now,
        transferId: transferId,
        status: 'completed'
      });
      
      // تحديث حالة التحويل
      await transfersRef.child(transferId).update({ 
        status: 'completed', 
        processedAt: now 
      });
      
      // إرسال تنبيهات للمستخدمين
      await db.ref(`alerts/${from}`).push({
        msg: `✅ تم تحويل ${amount} SDM إلى ${to}`,
        type: 'info',
        date: now
      });
      
      await db.ref(`alerts/${to}`).push({
        msg: `💰 استلمت ${amount} SDM من ${from}`,
        type: 'success',
        date: now
      });
      
      console.log(`✅ تم معالجة تحويل ${transferId}: ${amount} SDM من ${from} إلى ${to}`);
    }
  } catch (error) {
    console.error('❌ خطأ في معالجة التحويلات:', error);
  }
}

// 2. بوت التقييمات الآلي
async function processRatings() {
  try {
    const ratingsRef = db.ref('rating_queue');
    const snapshot = await ratingsRef.once('value');
    
    if (!snapshot.exists()) return;
    
    const ratings = snapshot.val();
    const now = Date.now();
    
    for (const [ratingId, rating] of Object.entries(ratings)) {
      const { rater, target, stars, date } = rating;
      
      // التأكد من أن التقييم أحدث من 30 ثانية
      if (now - date < 30000) continue;
      
      // جلب التقييمات السابقة للهدف
      const targetUserRef = db.ref(`users/${target}`);
      const targetSnapshot = await targetUserRef.once('value');
      const targetData = targetSnapshot.val();
      
      if (!targetData) {
        await ratingsRef.child(ratingId).remove();
        continue;
      }
      
      // حساب المعدل الجديد
      const currentRating = targetData.rating || 5;
      const ratingCount = targetData.ratingCount || 0;
      const totalStars = currentRating * ratingCount;
      const newRating = (totalStars + stars) / (ratingCount + 1);
      
      // تحديث التقييم
      await targetUserRef.update({
        rating: newRating.toFixed(1),
        ratingCount: ratingCount + 1
      });
      
      // إرسال تنبيه للبائع
      await db.ref(`alerts/${target}`).push({
        msg: `⭐ حصلت على تقييم ${stars} نجوم من مستخدم`,
        type: 'success',
        date: now
      });
      
      // حذف التقييم من قائمة الانتظار
      await ratingsRef.child(ratingId).remove();
      
      console.log(`⭐ تم معالجة تقييم ${ratingId}: ${stars} نجوم لـ ${target}`);
    }
  } catch (error) {
    console.error('❌ خطأ في معالجة التقييمات:', error);
  }
}

// 3. بوت البلاغات الآلي
async function processReports() {
  try {
    const reportsRef = db.ref('user_reports');
    const snapshot = await reportsRef.orderByChild('status').equalTo('pending').once('value');
    
    if (!snapshot.exists()) return;
    
    const reports = snapshot.val();
    const now = Date.now();
    
    for (const [reportId, report] of Object.entries(reports)) {
      // التأكد من أن البلاغ أحدث من 60 ثانية
      if (now - report.date < 60000) continue;
      
      const { offender, reporter, reason } = report;
      
      // التحقق من عدد البلاغات للمستخدم
      const offenderRef = db.ref(`users/${offender}`);
      const offenderSnap = await offenderRef.once('value');
      const offenderData = offenderSnap.val();
      
      if (!offenderData) {
        await reportsRef.child(reportId).update({ status: 'invalid' });
        continue;
      }
      
      // زيادة عداد البلاغات
      const reportCount = (offenderData.reportCount || 0) + 1;
      await offenderRef.update({ reportCount: reportCount });
      
      // التحقق إذا تجاوز الحد المسموح
      if (reportCount >= 3) {
        // حظر المستخدم لمدة 7 أيام
        const banUntil = now + (7 * 24 * 60 * 60 * 1000);
        await offenderRef.update({ 
          bannedUntil: banUntil,
          banReason: 'تجاوز عدد البلاغات المسموح بها'
        });
        
        // إرسال تنبيه للمستخدم المحظور
        await db.ref(`alerts/${offender}`).push({
          msg: `⛔ تم حظر حسابك لمدة 7 أيام بسبب تعدد البلاغات`,
          type: 'error',
          date: now
        });
      }
      
      // إرسال تنبيه للأدمن
      const admins = await db.ref('users').orderByChild('role').equalTo('admin').once('value');
      admins.forEach(adminSnap => {
        db.ref(`alerts/${adminSnap.key}`).push({
          msg: `🚩 بلاغ جديد ضد ${offender}: ${reason}`,
          type: 'warning',
          date: now
        });
      });
      
      // تحديث حالة البلاغ
      await reportsRef.child(reportId).update({ 
        status: 'processed',
        processedAt: now,
        reportCount: reportCount
      });
      
      console.log(`🚩 تم معالجة بلاغ ${reportId} ضد ${offender}`);
    }
  } catch (error) {
    console.error('❌ خطأ في معالجة البلاغات:', error);
  }
}

// 4. بوت حذف VIP المنتهي
async function cleanupExpiredVIP() {
  try {
    const vipPostsRef = db.ref('vip_posts');
    const snapshot = await vipPostsRef.once('value');
    
    if (!snapshot.exists()) return;
    
    const now = Date.now();
    const vipPosts = snapshot.val();
    
    for (const [postId, post] of Object.entries(vipPosts)) {
      if (post.vExpiry && post.vExpiry < now) {
        await vipPostsRef.child(postId).remove();
        console.log(`🗑️ تم حذف منشور VIP منتهي: ${postId}`);
      }
    }
    
    // حذف اشتراكات VIP المنتهية
    const usersRef = db.ref('users');
    const usersSnap = await usersRef.once('value');
    const users = usersSnap.val();
    
    for (const [userId, user] of Object.entries(users)) {
      if (user.vipStatus === 'active' && user.vipExpiry && user.vipExpiry < now) {
        await usersRef.child(userId).update({
          vipStatus: 'expired'
        });
        
        // إرسال تنبيه للمستخدم
        await db.ref(`alerts/${userId}`).push({
          msg: `💔 انتهى اشتراك VIP الخاص بك`,
          type: 'info',
          date: now
        });
        
        console.log(`💔 تم تحديث حالة VIP للمستخدم ${userId}`);
      }
    }
  } catch (error) {
    console.error('❌ خطأ في تنظيف VIP:', error);
  }
}

// 5. نظام الصيانة التلقائي
async function systemMaintenance() {
  try {
    const now = Date.now();
    
    // تحديث حالة النظام
    await db.ref('system/status').update({
      last_online: now,
      bot_status: 'active',
      processed_transfers: admin.database.ServerValue.increment(1)
    });
    
    // حذف السجلات القديمة
    const oldDate = now - (30 * 24 * 60 * 60 * 1000); // 30 يوم
    
    // حذف التنبيهات القديمة
    const alertsRef = db.ref('alerts');
    const alertsSnap = await alertsRef.once('value');
    if (alertsSnap.exists()) {
      const alerts = alertsSnap.val();
      for (const [userId, userAlerts] of Object.entries(alerts)) {
        for (const [alertId, alert] of Object.entries(userAlerts)) {
          if (alert.date && alert.date < oldDate) {
            await db.ref(`alerts/${userId}/${alertId}`).remove();
          }
        }
      }
    }
    
    console.log(`🔧 تم إجراء الصيانة النظامية`);
  } catch (error) {
    console.error('❌ خطأ في الصيانة:', error);
  }
}

// ===== تشغيل البوتات كل 5 ثواني =====
async function runBots() {
  console.log('🤖 بدء تشغيل البوتات الآلية...');
  
  setInterval(async () => {
    try {
      await processTransfers();
      await processRatings();
      await processReports();
      await cleanupExpiredVIP();
      await systemMaintenance();
    } catch (error) {
      console.error('❌ خطأ في تشغيل البوتات:', error);
    }
  }, 5000); // كل 5 ثواني
}

// ===== واجهة API =====
app.use(express.json());

// صفحة الترحيب
app.get('/', (req, res) => {
  res.json({
    message: 'SDM Market Bot System - 🤖',
    status: 'active',
    endpoints: {
      health: '/health',
      stats: '/stats',
      manual_transfer: '/transfer/:id (POST)',
      force_cleanup: '/cleanup (POST)'
    }
  });
});

// التحقق من صحة النظام
app.get('/health', async (req, res) => {
  try {
    const status = await db.ref('system/status').once('value');
    res.json({
      status: 'healthy',
      timestamp: Date.now(),
      system: status.val() || {}
    });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});

// إحصائيات النظام
app.get('/stats', async (req, res) => {
  try {
    const [
      users, posts, vipPosts, transfers, ratings, reports
    ] = await Promise.all([
      db.ref('users').once('value'),
      db.ref('posts').once('value'),
      db.ref('vip_posts').once('value'),
      db.ref('requests/transfers').orderByChild('status').equalTo('pending').once('value'),
      db.ref('rating_queue').once('value'),
      db.ref('user_reports').orderByChild('status').equalTo('pending').once('value')
    ]);
    
    res.json({
      users: users.numChildren(),
      posts: posts.numChildren(),
      vip_posts: vipPosts.numChildren(),
      pending_transfers: transfers.numChildren(),
      pending_ratings: ratings.numChildren(),
      pending_reports: reports.numChildren(),
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// معالجة تحويل يدوي
app.post('/transfer/:id', async (req, res) => {
  try {
    const transferId = req.params.id;
    const transferRef = db.ref(`requests/transfers/${transferId}`);
    const transferSnap = await transferRef.once('value');
    
    if (!transferSnap.exists()) {
      return res.status(404).json({ error: 'التحويل غير موجود' });
    }
    
    const transfer = transferSnap.val();
    if (transfer.status !== 'pending') {
      return res.status(400).json({ error: 'التحويل تمت معالجته مسبقاً' });
    }
    
    await processTransfers();
    res.json({ 
      message: 'تم معالجة التحويل', 
      transferId: transferId,
      status: 'processing'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// تنظيف قسري
app.post('/cleanup', async (req, res) => {
  try {
    await cleanupExpiredVIP();
    await systemMaintenance();
    res.json({ message: 'تم التنظيف بنجاح' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== تشغيل السيرفر =====
app.listen(PORT, () => {
  console.log(`🚀 Bot Server running on port ${PORT}`);
  runBots();
});
