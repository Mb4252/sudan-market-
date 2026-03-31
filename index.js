import asyncio
import sqlite3
import json
import random
import hashlib
from datetime import datetime, timedelta
from typing import Optional
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes, MessageHandler, filters
from telegram.constants import ParseMode
import logging

# إعداد التسجيل
logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO)
logger = logging.getLogger(__name__)

# توكن البوت
BOT_TOKEN = "8231977249:AAFCIBzTa8sw4iBLniWLbp_k2uCnCcIJ2UM"
ADMIN_ID = 6701743450

# سعر العملة بالدولار
CRYSTAL_PRICE_USDT = 0.01  # 1 كريستال = 0.01 USDT
MIN_PURCHASE_USDT = 10  # الحد الأدنى للشراء 10 USDT

class MiningBot:
    def __init__(self):
        self.setup_database()
        
    def setup_database(self):
        """إعداد قاعدة البيانات"""
        self.conn = sqlite3.connect('mining_bot.db', check_same_thread=False)
        self.cursor = self.conn.cursor()
        
        # جدول المستخدمين
        self.cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY,
                username TEXT,
                first_name TEXT,
                crystal_balance REAL DEFAULT 0,
                mining_rate REAL DEFAULT 1,
                mining_level INTEGER DEFAULT 1,
                last_mining_time TIMESTAMP,
                total_mined REAL DEFAULT 0,
                referrer_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # جدول المعاملات
        self.cursor.execute('''
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                type TEXT,
                amount REAL,
                usdt_amount REAL,
                status TEXT,
                transaction_hash TEXT,
                payment_address TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # جدول تحسينات التعدين
        self.cursor.execute('''
            CREATE TABLE IF NOT EXISTS upgrades (
                user_id INTEGER,
                upgrade_type TEXT,
                level INTEGER DEFAULT 1,
                price REAL,
                PRIMARY KEY (user_id, upgrade_type)
            )
        ''')
        
        # جدول السيولة
        self.cursor.execute('''
            CREATE TABLE IF NOT EXISTS liquidity (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                total_liquidity REAL DEFAULT 0,
                total_sold REAL DEFAULT 0,
                last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # إضافة السيولة الابتدائية
        self.cursor.execute('SELECT * FROM liquidity')
        if not self.cursor.fetchone():
            self.cursor.execute('INSERT INTO liquidity (total_liquidity, total_sold) VALUES (100000, 0)')
        
        self.conn.commit()
        
    def get_user(self, user_id):
        """الحصول على بيانات المستخدم"""
        self.cursor.execute('SELECT * FROM users WHERE user_id = ?', (user_id,))
        return self.cursor.fetchone()
    
    def register_user(self, user_id, username, first_name, referrer_id=None):
        """تسجيل مستخدم جديد"""
        if not self.get_user(user_id):
            self.cursor.execute('''
                INSERT INTO users (user_id, username, first_name, mining_rate, last_mining_time, referrer_id)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (user_id, username, first_name, 1, datetime.now(), referrer_id))
            self.conn.commit()
            
            if referrer_id:
                self.add_crystals(referrer_id, 50, "مكافأة إحالة")
            return True
        return False
    
    def add_crystals(self, user_id, amount, reason):
        """إضافة كريستال للمستخدم"""
        self.cursor.execute('''
            UPDATE users 
            SET crystal_balance = crystal_balance + ? 
            WHERE user_id = ?
        ''', (amount, user_id))
        self.conn.commit()
        
        self.cursor.execute('''
            INSERT INTO transactions (user_id, type, amount, status)
            VALUES (?, ?, ?, ?)
        ''', (user_id, 'mining', amount, 'completed'))
        self.conn.commit()
        
    def mine_crystals(self, user_id):
        """عملية التعدين"""
        user = self.get_user(user_id)
        if not user:
            return 0, None
            
        last_mining = datetime.strptime(user[5], '%Y-%m-%d %H:%M:%S.%f') if user[5] else datetime.now()
        time_diff = (datetime.now() - last_mining).total_seconds()
        
        if time_diff < 3600:
            remaining = 3600 - time_diff
            return 0, remaining
            
        mining_rate = user[3]
        base_reward = 10 * mining_rate
        random_bonus = random.randint(0, int(5 * mining_rate))
        total_reward = base_reward + random_bonus
        
        self.cursor.execute('''
            UPDATE users 
            SET crystal_balance = crystal_balance + ?, 
                total_mined = total_mined + ?,
                last_mining_time = ?
            WHERE user_id = ?
        ''', (total_reward, total_reward, datetime.now(), user_id))
        self.conn.commit()
        
        self.cursor.execute('''
            INSERT INTO transactions (user_id, type, amount, status)
            VALUES (?, ?, ?, ?)
        ''', (user_id, 'mining', total_reward, 'completed'))
        self.conn.commit()
        
        return total_reward, None
    
    def get_leaderboard(self, limit=10):
        """الحصول على قائمة المتصدرين"""
        self.cursor.execute('''
            SELECT user_id, username, first_name, crystal_balance, total_mined
            FROM users 
            ORDER BY crystal_balance DESC 
            LIMIT ?
        ''', (limit,))
        return self.cursor.fetchall()
    
    def get_liquidity_info(self):
        """الحصول على معلومات السيولة"""
        self.cursor.execute('SELECT total_liquidity, total_sold FROM liquidity ORDER BY id DESC LIMIT 1')
        result = self.cursor.fetchone()
        if result:
            return {'total_liquidity': result[0], 'total_sold': result[1]}
        return {'total_liquidity': 100000, 'total_sold': 0}
    
    def create_purchase_order(self, user_id, crystal_amount):
        """إنشاء أمر شراء"""
        usdt_amount = crystal_amount * CRYSTAL_PRICE_USDT
        
        if usdt_amount < MIN_PURCHASE_USDT:
            return None, f"الحد الأدنى للشراء هو {MIN_PURCHASE_USDT} USDT"
        
        # التحقق من السيولة
        liquidity = self.get_liquidity_info()
        if crystal_amount > liquidity['total_liquidity'] - liquidity['total_sold']:
            return None, "عذراً، السيولة غير كافية حالياً"
        
        # إنشاء عنوان دفع مؤقت
        payment_address = self.generate_payment_address(user_id)
        
        self.cursor.execute('''
            INSERT INTO transactions (user_id, type, amount, usdt_amount, status, payment_address)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (user_id, 'purchase', crystal_amount, usdt_amount, 'pending', payment_address))
        self.conn.commit()
        
        transaction_id = self.cursor.lastrowid
        
        return {
            'transaction_id': transaction_id,
            'crystal_amount': crystal_amount,
            'usdt_amount': usdt_amount,
            'payment_address': payment_address
        }, None
    
    def generate_payment_address(self, user_id):
        """توليد عنوان دفع مؤقت"""
        # في التطبيق الحقيقي، يجب استخدام API لمحفظة حقيقية
        return f"T{hashlib.sha256(f'{user_id}{datetime.now()}'.encode()).hexdigest()[:34]}"
    
    def confirm_payment(self, transaction_id, transaction_hash):
        """تأكيد الدفع"""
        self.cursor.execute('''
            SELECT user_id, amount FROM transactions 
            WHERE id = ? AND status = 'pending'
        ''', (transaction_id,))
        transaction = self.cursor.fetchone()
        
        if not transaction:
            return False, "المعاملة غير موجودة أو تم معالجتها مسبقاً"
        
        user_id, crystal_amount = transaction
        
        # تحديث رصيد المستخدم
        self.cursor.execute('''
            UPDATE users 
            SET crystal_balance = crystal_balance + ? 
            WHERE user_id = ?
        ''', (crystal_amount, user_id))
        
        # تحديث حالة المعاملة
        self.cursor.execute('''
            UPDATE transactions 
            SET status = 'completed', transaction_hash = ? 
            WHERE id = ?
        ''', (transaction_hash, transaction_id))
        
        # تحديث السيولة
        self.cursor.execute('''
            UPDATE liquidity 
            SET total_sold = total_sold + ? 
            WHERE id = (SELECT id FROM liquidity ORDER BY id DESC LIMIT 1)
        ''', (crystal_amount,))
        
        self.conn.commit()
        
        return True, "تم شراء العملة بنجاح!"
    
    def upgrade_mining(self, user_id, upgrade_type):
        """ترقية معدل التعدين"""
        self.cursor.execute('''
            SELECT level, price FROM upgrades 
            WHERE user_id = ? AND upgrade_type = ?
        ''', (user_id, upgrade_type))
        upgrade = self.cursor.fetchone()
        
        if upgrade:
            level = upgrade[0]
            price = 100 * (level + 1)  # سعر الترقية
        else:
            level = 0
            price = 100  # السعر الابتدائي
        
        user = self.get_user(user_id)
        if user[2] < price:  # crystal_balance
            return False, f"رصيدك غير كافي! تحتاج {price} كريستال"
        
        # خصم الكريستال
        self.cursor.execute('''
            UPDATE users 
            SET crystal_balance = crystal_balance - ? 
            WHERE user_id = ?
        ''', (price, user_id))
        
        # تحديث معدل التعدين
        new_mining_rate = user[3] + 0.5
        
        self.cursor.execute('''
            UPDATE users 
            SET mining_rate = ?, mining_level = mining_level + 1 
            WHERE user_id = ?
        ''', (new_mining_rate, user_id))
        
        # تحديث جدول الترقيات
        if upgrade:
            self.cursor.execute('''
                UPDATE upgrades 
                SET level = level + 1, price = ? 
                WHERE user_id = ? AND upgrade_type = ?
            ''', (100 * (level + 2), user_id, upgrade_type))
        else:
            self.cursor.execute('''
                INSERT INTO upgrades (user_id, upgrade_type, level, price)
                VALUES (?, ?, ?, ?)
            ''', (user_id, upgrade_type, 1, 200))
        
        self.conn.commit()
        
        return True, f"تمت الترقية! معدل التعدين الجديد: {new_mining_rate}x"

# إنشاء البوت
mining_bot = MiningBot()
app = Application.builder().token(BOT_TOKEN).build()

# إعداد WebApp
WEBAPP_URL = "https://your-domain.com/mining-app"  # غيّر هذا لرابط التطبيق المصغر

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """رسالة الترحيب"""
    user = update.effective_user
    mining_bot.register_user(user.id, user.username, user.first_name)
    
    keyboard = [
        [InlineKeyboardButton("🚀 فتح تطبيق التعدين", web_app=WebAppInfo(url=WEBAPP_URL))],
        [InlineKeyboardButton("📊 لوحة المتصدرين", callback_data="leaderboard")],
        [InlineKeyboardButton("💰 شراء كريستال", callback_data="buy_crystal")],
        [InlineKeyboardButton("⚡ تطوير معدل التعدين", callback_data="upgrade")],
        [InlineKeyboardButton("ℹ️ معلومات السيولة", callback_data="liquidity")]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    user_data = mining_bot.get_user(user.id)
    crystal_balance = user_data[2] if user_data else 0
    mining_rate = user_data[3] if user_data else 1
    
    welcome_text = f"""
✨ **مرحباً بك في بوت تعدين CRYSTAL!** ✨

👤 **المستخدم:** {user.first_name}
💎 **رصيد الكريستال:** {crystal_balance:,.2f} CRYSTAL
⚡ **معدل التعدين:** {mining_rate}x
💰 **سعر العملة:** {CRYSTAL_PRICE_USDT} USDT لكل CRYSTAL

🚀 **ابدأ التعدين الآن من خلال التطبيق المصغر!**
    """
    
    await update.message.reply_text(welcome_text, parse_mode=ParseMode.MARKDOWN, reply_markup=reply_markup)

async def leaderboard(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """عرض قائمة المتصدرين"""
    query = update.callback_query
    await query.answer()
    
    leaders = mining_bot.get_leaderboard(10)
    
    leaderboard_text = "🏆 **قائمة المتصدرين** 🏆\n\n"
    for i, leader in enumerate(leaders, 1):
        user_id, username, first_name, balance, total_mined = leader
        name = first_name or username or f"مستخدم {user_id}"
        leaderboard_text += f"{i}. {name}\n"
        leaderboard_text += f"   💎 الرصيد: {balance:,.2f} CRYSTAL\n"
        leaderboard_text += f"   ⛏️ تم التعدين: {total_mined:,.2f} CRYSTAL\n\n"
    
    keyboard = [[InlineKeyboardButton("🔙 رجوع", callback_data="back_to_menu")]]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await query.edit_message_text(leaderboard_text, parse_mode=ParseMode.MARKDOWN, reply_markup=reply_markup)

async def buy_crystal(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """شراء العملة"""
    query = update.callback_query
    await query.answer()
    
    liquidity = mining_bot.get_liquidity_info()
    available = liquidity['total_liquidity'] - liquidity['total_sold']
    
    text = f"""
💎 **شراء عملة CRYSTAL** 💎

💰 **سعر العملة:** {CRYSTAL_PRICE_USDT} USDT لكل CRYSTAL
📊 **السيولة المتاحة:** {available:,.2f} CRYSTAL
💰 **إجمالي السيولة:** {liquidity['total_liquidity']:,.2f} CRYSTAL
💵 **تم البيع:** {liquidity['total_sold']:,.2f} CRYSTAL

📝 **للشراء:**
1. أرسل المبلغ الذي تريد شراءه بالكريستال
2. سيتم إنشاء عنوان دفع USDT لك
3. قم بالتحويل وأرسل رابط المعاملة للتأكيد

⚠️ **الحد الأدنى للشراء:** {MIN_PURCHASE_USDT} USDT
    """
    
    keyboard = [
        [InlineKeyboardButton("🔙 رجوع", callback_data="back_to_menu")],
        [InlineKeyboardButton("💵 شراء", callback_data="initiate_purchase")]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await query.edit_message_text(text, parse_mode=ParseMode.MARKDOWN, reply_markup=reply_markup)

async def handle_purchase_amount(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """معالجة طلب الشراء"""
    user = update.effective_user
    try:
        crystal_amount = float(update.message.text)
        
        order, error = mining_bot.create_purchase_order(user.id, crystal_amount)
        
        if error:
            await update.message.reply_text(f"❌ {error}")
            return
        
        text = f"""
✅ **تم إنشاء طلب الشراء!**

💎 **الكمية:** {order['crystal_amount']:,.2f} CRYSTAL
💰 **المبلغ:** {order['usdt_amount']:,.2f} USDT
🆔 **رقم العملية:** {order['transaction_id']}

📤 **ارسل المبلغ إلى العنوان التالي:**
`{order['payment_address']}`

⚠️ **بعد التحويل، أرسل رابط المعاملة (Transaction Hash)**
📝 **الصيغة:** /confirm [رقم العملية] [رابط المعاملة]
        """
        
        await update.message.reply_text(text, parse_mode=ParseMode.MARKDOWN)
        
    except ValueError:
        await update.message.reply_text("❌ الرجاء إدخال رقم صحيح")

async def confirm_payment(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """تأكيد الدفع"""
    if len(context.args) != 2:
        await update.message.reply_text("❌ الصيغة: /confirm [رقم العملية] [رابط المعاملة]")
        return
    
    try:
        transaction_id = int(context.args[0])
        transaction_hash = context.args[1]
        
        success, message = mining_bot.confirm_payment(transaction_id, transaction_hash)
        
        if success:
            await update.message.reply_text(f"✅ {message}")
        else:
            await update.message.reply_text(f"❌ {message}")
            
    except ValueError:
        await update.message.reply_text("❌ رقم العملية غير صحيح")

async def upgrade(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """ترقية معدل التعدين"""
    query = update.callback_query
    await query.answer()
    
    user = mining_bot.get_user(query.from_user.id)
    current_rate = user[3] if user else 1
    upgrade_cost = 100 * (user[4] if user else 1)  # mining_level
    
    text = f"""
⚡ **تطوير معدل التعدين** ⚡

📊 **المعدل الحالي:** {current_rate}x
💰 **تكلفة الترقية:** {upgrade_cost} CRYSTAL
📈 **المعدل بعد الترقية:** {current_rate + 0.5}x

**فوائد الترقية:**
• زيادة سرعة التعدين
• زيادة المكافآت العشوائية
• وصول أسرع للمتصدرين
    """
    
    keyboard = [
        [InlineKeyboardButton("⚡ ترقية الآن", callback_data="do_upgrade")],
        [InlineKeyboardButton("🔙 رجوع", callback_data="back_to_menu")]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await query.edit_message_text(text, parse_mode=ParseMode.MARKDOWN, reply_markup=reply_markup)

async def do_upgrade(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """تنفيذ الترقية"""
    query = update.callback_query
    await query.answer()
    
    success, message = mining_bot.upgrade_mining(query.from_user.id, "mining_speed")
    
    if success:
        await query.edit_message_text(f"✅ {message}\n\n🔙 اضغط رجوع للعودة")
    else:
        await query.edit_message_text(f"❌ {message}\n\n🔙 اضغط رجوع للعودة")

async def liquidity_info(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """عرض معلومات السيولة"""
    query = update.callback_query
    await query.answer()
    
    liquidity = mining_bot.get_liquidity_info()
    available = liquidity['total_liquidity'] - liquidity['total_sold']
    
    text = f"""
💰 **معلومات السيولة** 💰

💎 **إجمالي السيولة:** {liquidity['total_liquidity']:,.2f} CRYSTAL
📊 **السيولة المتاحة:** {available:,.2f} CRYSTAL
💵 **تم البيع:** {liquidity['total_sold']:,.2f} CRYSTAL
📈 **نسبة البيع:** {(liquidity['total_sold'] / liquidity['total_liquidity'] * 100):.2f}%

💎 **سعر العملة:** {CRYSTAL_PRICE_USDT} USDT لكل CRYSTAL

✅ **السيولة كافية وآمنة!**
    """
    
    keyboard = [[InlineKeyboardButton("🔙 رجوع", callback_data="back_to_menu")]]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await query.edit_message_text(text, parse_mode=ParseMode.MARKDOWN, reply_markup=reply_markup)

async def back_to_menu(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """العودة للقائمة الرئيسية"""
    query = update.callback_query
    await query.answer()
    
    user = mining_bot.get_user(query.from_user.id)
    crystal_balance = user[2] if user else 0
    mining_rate = user[3] if user else 1
    
    keyboard = [
        [InlineKeyboardButton("🚀 فتح تطبيق التعدين", web_app=WebAppInfo(url=WEBAPP_URL))],
        [InlineKeyboardButton("📊 لوحة المتصدرين", callback_data="leaderboard")],
        [InlineKeyboardButton("💰 شراء كريستال", callback_data="buy_crystal")],
        [InlineKeyboardButton("⚡ تطوير معدل التعدين", callback_data="upgrade")],
        [InlineKeyboardButton("ℹ️ معلومات السيولة", callback_data="liquidity")]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    text = f"""
✨ **قائمة CRYSTAL الرئيسية** ✨

👤 **المستخدم:** {query.from_user.first_name}
💎 **رصيد الكريستال:** {crystal_balance:,.2f} CRYSTAL
⚡ **معدل التعدين:** {mining_rate}x
💰 **سعر العملة:** {CRYSTAL_PRICE_USDT} USDT لكل CRYSTAL
    """
    
    await query.edit_message_text(text, parse_mode=ParseMode.MARKDOWN, reply_markup=reply_markup)

# إضافة معالج الرسائل
app.add_handler(CommandHandler("start", start))
app.add_handler(CallbackQueryHandler(leaderboard, pattern="^leaderboard$"))
app.add_handler(CallbackQueryHandler(buy_crystal, pattern="^buy_crystal$"))
app.add_handler(CallbackQueryHandler(upgrade, pattern="^upgrade$"))
app.add_handler(CallbackQueryHandler(liquidity_info, pattern="^liquidity$"))
app.add_handler(CallbackQueryHandler(back_to_menu, pattern="^back_to_menu$"))
app.add_handler(CallbackQueryHandler(do_upgrade, pattern="^do_upgrade$"))
app.add_handler(CommandHandler("confirm", confirm_payment))
app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_purchase_amount))

if __name__ == "__main__":
    print("🚀 Bot is starting...")
    app.run_polling(allowed_updates=Update.ALL_TYPES)
