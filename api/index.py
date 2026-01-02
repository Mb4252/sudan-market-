Import telebot
import requests
import time
import hashlib
import hmac

# --- بيانات الـ API الخاصة بك ---
API_KEY = 'ITPifXfdCKwktQ9Gqqc2UEt0rxJpoKP1EHaKrY1JQjkbAsfPU5kVgFC10ftBdTDg'
SECRET_KEY = 'dNVtHcSCp3nOhVAb17iASkaGNI3iPR2coyWXF0OIT8wVZSTEu4LwmzhEgv0cnAEW'
BOT_TOKEN = 'ضع_توكن_بوت_التلجرام_هنا'

bot = telebot.TeleBot(BOT_TOKEN)
BASE_URL = "https://api.binance.com"
SDM_RATE = 4 

# --- القائمة الكاملة للباقات (محدثة) ---
PACKAGES = {
    # باقات ببجي موبايل (UC)
    "1": {"name": "60 UC PUBG", "usd": 1.0},
    "2": {"name": "325 UC PUBG", "usd": 5.0},
    "3": {"name": "660 UC PUBG", "usd": 10.0},
    "4": {"name": "1800 UC PUBG", "usd": 25.0},
    "5": {"name": "3850 UC PUBG", "usd": 50.0},
    # باقات فري فاير (Diamonds)
    "6": {"name": "110 Diamonds FF", "usd": 1.0},
    "7": {"name": "231 Diamonds FF", "usd": 2.2},
    "8": {"name": "583 Diamonds FF", "usd": 5.0},
    "9": {"name": "1188 Diamonds FF", "usd": 10.0},
    "10": {"name": "2420 Diamonds FF", "usd": 20.0}
}

def get_binance_balance():
    timestamp = int(time.time() * 1000)
    query_string = f"timestamp={timestamp}"
    signature = hmac.new(SECRET_KEY.encode('utf-8'), query_string.encode('utf-8'), hashlib.sha256).hexdigest()
    url = f"{BASE_URL}/api/v3/account?{query_string}&signature={signature}"
    headers = {'X-MBX-APIKEY': API_KEY}
    try:
        response = requests.get(url, headers=headers).json()
        for asset in response.get('balances', []):
            if asset['asset'] == 'USDT':
                return float(asset['free'])
    except:
        return 0.0
    return 0.0

@bot.message_handler(commands=['start', 'recharge'])
def show_menu(message):
    text = "💎 نظام شحن SDM الآلي - جوهرة سولانا المخفية 💎\n\n"
    text += "اختر رقم الباقة ثم أرسل: [الرقم] [الآيدي]\n\n"
    for id, pkg in PACKAGES.items():
        cost_sdm = pkg['usd'] * SDM_RATE
        text += f" {id} - {pkg['name']} ➔ {cost_sdm} SDM\n"
    bot.send_message(message.chat.id, text)

@bot.message_handler(func=lambda m: True)
def process_order(message):
    try:
        args = message.text.split()
        pkg_id, game_id = args[0], args[1]
        
        if pkg_id in PACKAGES:
            pkg = PACKAGES[pkg_id]
            cost_sdm = pkg['usd'] * SDM_RATE
            
            # (خطوة وهمية) التحقق من رصيد المستخدم في البوت
            user_sdm_balance = 100 # يجب ربطه بقاعدة بياناتك
            
            if user_sdm_balance < cost_sdm:
                bot.reply_to(message, f"❌ رصيدك غير كافٍ. تحتاج {cost_sdm} SDM.")
                return

            # التحقق من رصيد باينانس (المخزن)
            binance_usdt = get_binance_balance()
            
            if binance_usdt < pkg['usd']:
                # إلغاء العملية فوراً وإبلاغ المستخدم
                bot.reply_to(message, "⚠️ عذراً، محفظة الشحن فارغة حالياً.\nتم إلغاء العملية وإبقاء رصيدك كما هو. حاول لاحقاً.")
            else:
                # تنفيذ الشحن الفوري (خصم SDM + تنفيذ Binance API)
                # [هنا تضع كود الخصم النهائي وكود الـ Pay]
                bot.reply_to(message, f"✅ تم الشحن فوراً للأيدي: {game_id}\nشكراً لاستخدامك تقنية SDM الآمنة.")
    except:
        bot.reply_to(message, "يرجى الإرسال بصيغة: [رقم الباقة] [الآيدي]")

bot.polling()
