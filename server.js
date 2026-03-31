require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 10000;

// اتصال قاعدة البيانات
(async () => {
    try {
        await db.connect();
        console.log('✅ Database connected');
    } catch (error) {
        console.error('❌ Database error:', error);
    }
})();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'mining-app')));

// صفحة رئيسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'mining-app', 'index.html'));
});

// Health check - مهم لـ Render
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API المستخدم
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
            res.json({ balance: 0, miningRate: 1, miningLevel: 1, totalMined: 0 });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API التعدين
app.post('/api/mine', async (req, res) => {
    try {
        const { user_id } = req.body;
        const result = await db.mine(parseInt(user_id));
        res.json(result);
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// API المتصدرين
app.get('/api/leaderboard', async (req, res) => {
    try {
        const leaders = await db.getLeaderboard(10);
        const formatted = leaders.map(leader => ({
            name: leader.firstName || leader.username || `مستخدم ${leader.userId}`,
            balance: leader.crystalBalance || 0,
            level: leader.miningLevel || 1
        }));
        res.json(formatted);
    } catch (error) {
        res.json([]);
    }
});

// API السيولة
app.get('/api/liquidity', async (req, res) => {
    try {
        const liquidity = await db.getLiquidity();
        res.json({
            total_liquidity: liquidity?.totalLiquidity || 100000,
            total_sold: liquidity?.totalSold || 0,
            available: (liquidity?.totalLiquidity || 100000) - (liquidity?.totalSold || 0)
        });
    } catch (error) {
        res.json({ total_liquidity: 100000, total_sold: 0, available: 100000 });
    }
});

// API الشراء
app.post('/api/purchase', async (req, res) => {
    try {
        const { user_id, amount } = req.body;
        const result = await db.requestPurchase(parseInt(user_id), parseFloat(amount));
        res.json(result);
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// API الترقية
app.post('/api/upgrade', async (req, res) => {
    try {
        const { user_id } = req.body;
        const result = await db.requestUpgrade(parseInt(user_id), 5);
        res.json(result);
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// API التسجيل
app.post('/api/register', async (req, res) => {
    try {
        const { user_id, username, first_name } = req.body;
        await db.registerUser(parseInt(user_id), username, first_name);
        res.json({ success: true });
    } catch (error) {
        res.json({ success: true });
    }
});

// API إحصائيات اليوم
app.get('/api/user/daily/:userId', async (req, res) => {
    try {
        const stats = await db.getUserStats(parseInt(req.params.userId));
        res.json({
            daily_mined: stats?.dailyMined || 0,
            daily_limit: 4,
            remaining: 4 - (stats?.dailyMined || 0)
        });
    } catch (error) {
        res.json({ daily_mined: 0, daily_limit: 4, remaining: 4 });
    }
});

// تشغيل الخادم
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Web server running on port ${PORT}`);
    console.log(`📱 WebApp URL: ${process.env.WEBAPP_URL || `http://localhost:${PORT}`}`);
});
