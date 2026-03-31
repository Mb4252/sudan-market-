require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// الاتصال بقاعدة البيانات
(async () => {
    try {
        await db.connect();
        console.log('✅ Database connected successfully');
    } catch (error) {
        console.error('❌ Database connection failed:', error);
    }
})();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'mining-app')));

// تقديم التطبيق المصغر
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'mining-app', 'index.html'));
});

// الحصول على بيانات المستخدم
app.get('/api/user/:userId', async (req, res) => {
    try {
        const user = await db.getUser(parseInt(req.params.userId));
        if (user) {
            res.json({
                balance: user.crystalBalance,
                miningRate: user.miningRate,
                miningLevel: user.miningLevel,
                totalMined: user.totalMined,
                lastMiningTime: user.lastMiningTime,
                dailyMined: user.dailyMined,
                lastMiningDate: user.lastMiningDate
            });
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// عملية التعدين
app.post('/api/mine', async (req, res) => {
    try {
        const { user_id } = req.body;
        const result = await db.mine(parseInt(user_id));
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// قائمة المتصدرين
app.get('/api/leaderboard', async (req, res) => {
    try {
        const leaders = await db.getLeaderboard(10);
        const formatted = leaders.map(leader => ({
            name: leader.firstName || leader.username || `User ${leader.userId}`,
            balance: leader.crystalBalance,
            level: leader.miningLevel
        }));
        res.json(formatted);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// معلومات السيولة
app.get('/api/liquidity', async (req, res) => {
    try {
        const liquidity = await db.getLiquidity();
        res.json({
            total_liquidity: liquidity.totalLiquidity,
            total_sold: liquidity.totalSold,
            available: liquidity.totalLiquidity - liquidity.totalSold
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// طلب شراء
app.post('/api/purchase', async (req, res) => {
    try {
        const { user_id, amount } = req.body;
        const result = await db.requestPurchase(parseInt(user_id), parseFloat(amount));
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// طلب ترقية
app.post('/api/upgrade', async (req, res) => {
    try {
        const { user_id } = req.body;
        const result = await db.requestUpgrade(parseInt(user_id), parseFloat(process.env.UPGRADE_USDT_PRICE));
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// تسجيل مستخدم
app.post('/api/register', async (req, res) => {
    try {
        const { user_id, username, first_name } = req.body;
        await db.registerUser(parseInt(user_id), username, first_name);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// إحصائيات المستخدم
app.get('/api/user/stats/:userId', async (req, res) => {
    try {
        const stats = await db.getUserStats(parseInt(req.params.userId));
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// معلومات التعدين اليومي
app.get('/api/user/daily/:userId', async (req, res) => {
    try {
        const stats = await db.getUserStats(parseInt(req.params.userId));
        res.json({
            daily_mined: stats?.dailyMined || 0,
            daily_limit: parseInt(process.env.DAILY_LIMIT) || 4,
            remaining: (parseInt(process.env.DAILY_LIMIT) || 4) - (stats?.dailyMined || 0)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// تشغيل الخادم
app.listen(PORT, () => {
    console.log(`🌐 Server running on port ${PORT}`);
    console.log(`📱 WebApp URL: ${process.env.WEBAPP_URL}`);
});
