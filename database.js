// ==================== bot/database.js ====================
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

// مسار ملف قاعدة البيانات (يقرأ من .env أو يستخدم المسار الافتراضي)
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'db', 'bot_database.sqlite');

// إنشاء اتصال قاعدة البيانات
const db = new sqlite3.Database(dbPath);

// دالة لتهيئة الجداول عند بدء التشغيل لأول مرة
async function initializeDatabase() {
    return new Promise((resolve, reject) => {
        // جدول المستخدمين
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY,
                telegram_id INTEGER UNIQUE NOT NULL,
                username TEXT,
                balance REAL DEFAULT 0.0,
                energy INTEGER DEFAULT 100,
                last_claim INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) {
                console.error('❌ خطأ في إنشاء جدول users:', err.message);
                reject(err);
                return;
            }
            console.log('✅ تم إنشاء/التأكد من جدول users');
            resolve(db);
        });
    });
}

// دالة لإنشاء مستخدم جديد أو جلبه إذا كان موجوداً
function getOrCreateUser(telegramId, username) {
    return new Promise((resolve, reject) => {
        // 1. حاول البحث عن المستخدم أولاً
        db.get('SELECT * FROM users WHERE telegram_id = ?', [telegramId], (err, existingUser) => {
            if (err) {
                reject(err);
                return;
            }

            if (existingUser) {
                // المستخدم موجود، أرجع بياناته
                resolve(existingUser);
            } else {
                // 2. المستخدم غير موجود، قم بإنشائه
                const newUser = {
                    telegram_id: telegramId,
                    username: username || null,
                    balance: 0.0,
                    energy: 100,
                    last_claim: null
                };

                db.run(`
                    INSERT INTO users (telegram_id, username, balance, energy, last_claim)
                    VALUES (?, ?, ?, ?, ?)
                `, [newUser.telegram_id, newUser.username, newUser.balance, newUser.energy, newUser.last_claim],
                function(insertErr) {
                    if (insertErr) {
                        reject(insertErr);
                        return;
                    }
                    // أضف الـ ID المُنشأ حديثاً للكائن
                    newUser.user_id = this.lastID;
                    resolve(newUser);
                });
            }
        });
    });
}

// دالة لتحديث رصيد وطاقة المستخدم
function updateUserBalance(userId, balanceChange, energyChange) {
    return new Promise((resolve, reject) => {
        // استعلام ديناميكي بناءً على التغييرات المطلوبة
        let updateQuery = 'UPDATE users SET ';
        const queryParams = [];
        const updates = [];

        if (balanceChange !== undefined) {
            updates.push('balance = balance + ?');
            queryParams.push(balanceChange);
        }
        if (energyChange !== undefined) {
            updates.push('energy = energy + ?');
            queryParams.push(energyChange);
        }

        updateQuery += updates.join(', ') + ' WHERE user_id = ?';
        queryParams.push(userId);

        db.run(updateQuery, queryParams, function(err) {
            if (err) {
                reject(err);
                return;
            }
            resolve({ changes: this.changes });
        });
    });
}

// تصدير الدوال لاستخدامها في ملفات أخرى
module.exports = {
    db,
    initializeDatabase,
    getOrCreateUser,
    updateUserBalance
};
