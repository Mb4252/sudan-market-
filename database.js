const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
    constructor() {
        const dbPath = process.env.NODE_ENV === 'production' 
            ? '/tmp/crystal_mining.db' 
            : path.join(__dirname, 'crystal_mining.db');
        
        this.db = new sqlite3.Database(dbPath);
        this.init();
    }

    init() {
        // جدول المستخدمين
        this.db.run(`
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY,
                username TEXT,
                first_name TEXT,
                crystal_balance REAL DEFAULT 0,
                mining_rate REAL DEFAULT 1,
                mining_level INTEGER DEFAULT 1,
                total_mined REAL DEFAULT 0,
                daily_mined REAL DEFAULT 0,
                last_mining_date DATE,
                last_mining_time DATETIME,
                referrer_id INTEGER,
                referral_count INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // جدول المعاملات
        this.db.run(`
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                type TEXT,
                amount REAL,
                usdt_amount REAL,
                status TEXT,
                transaction_hash TEXT,
                payment_address TEXT,
                admin_approved INTEGER DEFAULT 0,
                approved_by INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // جدول طلبات الترقية
        this.db.run(`
            CREATE TABLE IF NOT EXISTS upgrade_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                current_level INTEGER,
                requested_level INTEGER,
                usdt_amount REAL,
                status TEXT DEFAULT 'pending',
                transaction_hash TEXT,
                approved_by INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // جدول السيولة
        this.db.run(`
            CREATE TABLE IF NOT EXISTS liquidity (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                total_liquidity REAL DEFAULT 100000,
                total_sold REAL DEFAULT 0,
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // إضافة السيولة الابتدائية
        this.db.get('SELECT * FROM liquidity', (err, row) => {
            if (!row) {
                this.db.run('INSERT INTO liquidity (total_liquidity, total_sold) VALUES (100000, 0)');
            }
        });

        console.log('✅ Database initialized');
    }

    // تسجيل مستخدم جديد
    registerUser(userId, username, firstName, referrerId = null) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM users WHERE user_id = ?', [userId], async (err, user) => {
                if (err) reject(err);
                
                if (!user) {
                    this.db.run(`
                        INSERT INTO users (user_id, username, first_name, mining_rate, last_mining_date, referrer_id)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `, [userId, username, firstName, 1, new Date().toISOString().split('T')[0], referrerId], async (err) => {
                        if (err) reject(err);
                        
                        // مكافأة الإحالة
                        if (referrerId) {
                            await this.updateReferralReward(referrerId);
                        }
                        resolve(true);
                    });
                } else {
                    resolve(false);
                }
            });
        });
    }

    // تحديث مكافأة الإحالة
    async updateReferralReward(referrerId) {
        // زيادة عدد الإحالات
        await new Promise((resolve, reject) => {
            this.db.run(`
                UPDATE users 
                SET referral_count = referral_count + 1 
                WHERE user_id = ?
            `, [referrerId], (err) => {
                if (err) reject(err);
                resolve();
            });
        });

        // التحقق من مكافأة 5 إحالات
        const user = await this.getUser(referrerId);
        if (user.referral_count === 5) {
            await this.addCrystals(referrerId, 10, 'مكافأة إحالة 5 أشخاص');
        }
    }

    // الحصول على مستخدم
    getUser(userId) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM users WHERE user_id = ?', [userId], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
    }

    // إضافة كريستال
    addCrystals(userId, amount, reason) {
        return new Promise((resolve, reject) => {
            this.db.run(`
                UPDATE users 
                SET crystal_balance = crystal_balance + ? 
                WHERE user_id = ?
            `, [amount, userId], (err) => {
                if (err) reject(err);
                
                this.db.run(`
                    INSERT INTO transactions (user_id, type, amount, status)
                    VALUES (?, ?, ?, ?)
                `, [userId, 'reward', amount, 'completed']);
                
                resolve(true);
            });
        });
    }

    // عملية التعدين (محدودة بـ 4 كريستال يومياً)
    async mine(userId) {
        const user = await this.getUser(userId);
        if (!user) return { success: false, message: 'User not found' };

        const today = new Date().toISOString().split('T')[0];
        const lastMiningDate = user.last_mining_date;
        
        // إعادة تعيين الكمية اليومية إذا كان يوم جديد
        let dailyMined = user.daily_mined || 0;
        if (lastMiningDate !== today) {
            dailyMined = 0;
        }
        
        // التحقق من الحد اليومي (4 كريستال)
        if (dailyMined >= 4) {
            return { 
                success: false, 
                message: '⚠️ لقد وصلت للحد الأقصى اليومي (4 كريستال)\n⏰ انتظر حتى الغد للتعدين مرة أخرى!',
                dailyLimit: true
            };
        }
        
        const now = new Date();
        const lastMine = user.last_mining_time ? new Date(user.last_mining_time) : new Date(0);
        const diffMinutes = (now - lastMine) / 1000 / 60;
        
        // التحقق من وقت التعدين (كل ساعة)
        if (diffMinutes < 60) {
            const remaining = Math.floor((60 - diffMinutes) * 60);
            return { 
                success: false, 
                remaining: remaining,
                message: `⏰ يجب الانتظار ${Math.floor(remaining/60)} دقيقة و ${remaining%60} ثانية`
            };
        }
        
        // مكافأة التعدين (1-4 كريستال)
        const minReward = 1;
        const maxReward = 4;
        let reward = Math.floor(Math.random() * (maxReward - minReward + 1) + minReward);
        
        // تطبيق معدل التعدين (زيادة فرصة الحصول على مكافأة أعلى)
        if (user.mining_rate > 1) {
            const bonus = Math.random() * (user.mining_rate - 1);
            reward = Math.min(maxReward, reward + Math.floor(bonus));
        }
        
        // التأكد من عدم تجاوز الحد اليومي
        if (dailyMined + reward > 4) {
            reward = 4 - dailyMined;
        }
        
        if (reward <= 0) {
            return { 
                success: false, 
                message: '⚠️ لقد وصلت للحد الأقصى اليومي!',
                dailyLimit: true
            };
        }
        
        const newDailyMined = dailyMined + reward;
        
        return new Promise((resolve, reject) => {
            this.db.run(`
                UPDATE users 
                SET crystal_balance = crystal_balance + ?,
                    total_mined = total_mined + ?,
                    daily_mined = ?,
                    last_mining_date = ?,
                    last_mining_time = ?
                WHERE user_id = ?
            `, [reward, reward, newDailyMined, today, now.toISOString(), userId], (err) => {
                if (err) reject(err);
                
                this.db.run(`
                    INSERT INTO transactions (user_id, type, amount, status)
                    VALUES (?, ?, ?, ?)
                `, [userId, 'mining', reward, 'completed']);
                
                resolve({ 
                    success: true, 
                    reward: reward.toFixed(0),
                    dailyRemaining: 4 - newDailyMined,
                    dailyMined: newDailyMined
                });
            });
        });
    }

    // طلب ترقية بـ USDT
    requestUpgrade(userId, usdtAmount) {
        return new Promise(async (resolve, reject) => {
            const user = await this.getUser(userId);
            if (!user) {
                resolve({ success: false, message: 'المستخدم غير موجود' });
                return;
            }
            
            const currentLevel = user.mining_level;
            const requestedLevel = currentLevel + 1;
            
            // عنوان الدفع الثابت TRON
            const paymentAddress = 'TCZ2NGDSvxznADHTvvkedJTcbbGbD5RhfR';
            
            this.db.run(`
                INSERT INTO upgrade_requests (user_id, current_level, requested_level, usdt_amount, status)
                VALUES (?, ?, ?, ?, ?)
            `, [userId, currentLevel, requestedLevel, usdtAmount, 'pending'], function(err) {
                if (err) reject(err);
                
                resolve({
                    success: true,
                    request_id: this.lastID,
                    current_level: currentLevel,
                    requested_level: requestedLevel,
                    usdt_amount: usdtAmount,
                    payment_address: paymentAddress,
                    message: `📝 تم إنشاء طلب ترقية رقم #${this.lastID}\n💰 المبلغ: ${usdtAmount} USDT\n📤 أرسل المبلغ إلى:\n\`${paymentAddress}\`\n\n📎 بعد التحويل، أرسل /confirm_upgrade ${this.lastID} [رابط المعاملة]\n\n⚠️ سيتم مراجعة طلبك من قبل الأدمن`
                });
            });
        });
    }

    // تأكيد طلب الترقية من الأدمن
    async confirmUpgrade(requestId, transactionHash, adminId) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM upgrade_requests WHERE id = ? AND status = ?', 
                [requestId, 'pending'], async (err, request) => {
                if (err || !request) {
                    resolve({ success: false, message: 'طلب الترقية غير موجود أو تم معالجته مسبقاً' });
                    return;
                }
                
                // ترقية المستخدم
                const upgradeCost = 100 * request.current_level;
                const newMiningRate = request.current_level + 0.5;
                
                this.db.run(`
                    UPDATE users 
                    SET mining_rate = ?,
                        mining_level = ?
                    WHERE user_id = ?
                `, [newMiningRate, request.requested_level, request.user_id], (err) => {
                    if (err) reject(err);
                    
                    // تحديث حالة الطلب
                    this.db.run(`
                        UPDATE upgrade_requests 
                        SET status = 'approved', 
                            transaction_hash = ?,
                            approved_by = ?
                        WHERE id = ?
                    `, [transactionHash, adminId, requestId]);
                    
                    // تسجيل المعاملة
                    this.db.run(`
                        INSERT INTO transactions (user_id, type, amount, usdt_amount, status, transaction_hash)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `, [request.user_id, 'upgrade', upgradeCost, request.usdt_amount, 'completed', transactionHash]);
                    
                    resolve({ 
                        success: true, 
                        message: `✅ تمت الموافقة على طلب الترقية #${requestId}\n⚡ معدل التعدين الجديد: ${newMiningRate}x\n📈 المستوى الجديد: ${request.requested_level}`
                    });
                });
            });
        });
    }

    // رفض طلب الترقية
    rejectUpgrade(requestId, adminId) {
        return new Promise((resolve, reject) => {
            this.db.run(`
                UPDATE upgrade_requests 
                SET status = 'rejected', 
                    approved_by = ?
                WHERE id = ? AND status = 'pending'
            `, [adminId, requestId], function(err) {
                if (err) reject(err);
                
                if (this.changes === 0) {
                    resolve({ success: false, message: 'الطلب غير موجود أو تم معالجته' });
                } else {
                    resolve({ success: true, message: 'تم رفض طلب الترقية' });
                }
            });
        });
    }

    // الحصول على طلبات الترقية المعلقة
    getPendingUpgrades() {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT u.*, users.username, users.first_name 
                FROM upgrade_requests u
                JOIN users ON u.user_id = users.user_id
                WHERE u.status = 'pending'
                ORDER BY u.created_at DESC
            `, (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    }

    // قائمة المتصدرين
    getLeaderboard(limit = 10) {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT user_id, username, first_name, crystal_balance, total_mined, mining_level, referral_count
                FROM users 
                ORDER BY crystal_balance DESC 
                LIMIT ?
            `, [limit], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    }

    // إحصائيات المستخدم
    getUserStats(userId) {
        return new Promise(async (resolve, reject) => {
            const user = await this.getUser(userId);
            if (!user) {
                resolve(null);
                return;
            }
            
            // عدد الإحالات الناجحة
            const referrals = await new Promise((resolve, reject) => {
                this.db.all('SELECT user_id FROM users WHERE referrer_id = ?', [userId], (err, rows) => {
                    if (err) reject(err);
                    resolve(rows);
                });
            });
            
            resolve({
                ...user,
                referrals_count: referrals.length,
                referrals_list: referrals
            });
        });
    }

    // معلومات السيولة
    getLiquidity() {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT total_liquidity, total_sold FROM liquidity ORDER BY id DESC LIMIT 1', (err, row) => {
                if (err) reject(err);
                resolve(row || { total_liquidity: 100000, total_sold: 0 });
            });
        });
    }

    // الحصول على إحصائيات عامة
    getGlobalStats() {
        return new Promise((resolve, reject) => {
            this.db.get(`
                SELECT 
                    COUNT(*) as total_users,
                    SUM(crystal_balance) as total_crystals,
                    SUM(total_mined) as total_mined,
                    AVG(mining_level) as avg_level
                FROM users
            `, (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
    }
}

module.exports = new Database();
