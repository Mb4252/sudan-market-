
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

// تهيئة الجداول
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY,
        username TEXT,
        first_name TEXT,
        crystal_balance REAL DEFAULT 0,
        mining_rate REAL DEFAULT 1,
        mining_level INTEGER DEFAULT 1,
        total_mined REAL DEFAULT 0,
        last_mining_time DATETIME
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS system_stats (
        id INTEGER PRIMARY KEY,
        total_liquidity REAL DEFAULT 1000000,
        total_sold REAL DEFAULT 0
    )`);
    
    // إدخال السيولة الافتراضية إذا لم تكن موجودة
    db.run(`INSERT OR IGNORE INTO system_stats (id) VALUES (1)`);
});

// دوال قاعدة البيانات
module.exports = {
    registerUser: (userId, username, firstName) => {
        return new Promise((resolve, reject) => {
            db.run(`INSERT OR IGNORE INTO users (user_id, username, first_name) VALUES (?, ?, ?)`,
                [userId, username, firstName], (err) => err ? reject(err) : resolve());
        });
    },

    getUser: (userId) => {
        return new Promise((resolve, reject) => {
            db.get(`SELECT * FROM users WHERE user_id = ?`, [userId], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
    },

    mine: async (userId) => {
        const user = await module.exports.getUser(userId);
        if (!user) return { success: false, message: 'User not found' };

        const now = new Date();
        const lastMine = user.last_mining_time ? new Date(user.last_mining_time) : new Date(0);
        const diffMinutes = (now - lastMine) / 1000 / 60;

        // التعدين مسموح كل 60 دقيقة
        if (diffMinutes < 60) {
            return { success: false, remaining: Math.floor((60 - diffMinutes) * 60) };
        }

        const reward = (Math.random() * 5 + 1) * user.mining_rate; // مكافأة عشوائية مضروبة في معدل التعدين
        
        return new Promise((resolve, reject) => {
            db.run(`UPDATE users SET crystal_balance = crystal_balance + ?, total_mined = total_mined + ?, last_mining_time = ? WHERE user_id = ?`,
                [reward, reward, now.toISOString(), userId], (err) => {
                    if (err) reject(err);
                    resolve({ success: true, reward: reward.toFixed(2) });
                });
        });
    },

    upgradeMining: async (userId) => {
        const user = await module.exports.getUser(userId);
        const cost = 100 * user.mining_level;

        if (user.crystal_balance < cost) {
            return { success: false, message: `تحتاج إلى ${cost} كريستال للترقية` };
        }

        return new Promise((resolve, reject) => {
            db.run(`UPDATE users SET crystal_balance = crystal_balance - ?, mining_rate = mining_rate + 0.5, mining_level = mining_level + 1 WHERE user_id = ?`,
                [cost, userId], (err) => {
                    if (err) reject(err);
                    resolve({ success: true, message: 'تمت الترقية بنجاح!' });
                });
        });
    },

    getLeaderboard: () => {
        return new Promise((resolve, reject) => {
            db.all(`SELECT user_id, first_name as name, crystal_balance as balance FROM users ORDER BY crystal_balance DESC LIMIT 10`, (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    },

    getLiquidity: () => {
        return new Promise((resolve, reject) => {
            db.get(`SELECT * FROM system_stats WHERE id = 1`, (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
    }
};
