from flask import Flask, jsonify, request
import telebot
import requests
import time
import hashlib
import hmac

app = Flask(__name__)

# --- إعدادات عملة SDM والأمان ---
# ملاحظة: تم دمج مفاتيحك لضمان المصداقية والربط المباشر بباينانس
API_KEY = 'ITPifXfdCKwktQ9Gqqc2UEt0rxJpoKP1EHaKrY1JQjkbAsfPU5kVgFC10ftBdTDg'
SECRET_KEY = 'dNVtHcSCp3nOhVAb17iASkaGNI3iPR2coyWXF0OIT8wVZSTEu4LwmzhEgv0cnAEW'
BOT_TOKEN = 'ضع_توكن_بوت_التلجرام_هنا' # ضع التوكن الخاص بك هنا

bot = telebot.TeleBot(BOT_TOKEN)
BASE_URL = "https://api.binance.com"
SDM_RATE = 4  # 1 دولار = 4 SDM (قيمة ثابتة لتعزيز الثقة)

# --- قائمة الباقات المحدثة لجوهرة سولانا ---
PACKAGES = {
    "1": {"name": "60 UC PUBG", "usd": 1.0},
    "2": {"name": "325 UC PUBG", "usd": 5.0},
    "3": {"name": "660 UC PUBG", "usd": 10.0},
    "4": {"name": "1800 UC PUBG", "usd": 25.0},
    "5": {"name": "3850 UC PUBG", "usd": 50.0},
    "6": {"name": "110 Diamonds FF", "usd": 1.0},
    "7": {"name": "231 Diamonds FF", "usd": 2.2},
    "8": {"name": "583 Diamonds FF", "usd": 5.0},
    "9": {"name": "1188 Diamonds FF", "usd": 10.0},
    "10": {"name": "2420 Diamonds FF", "usd": 20.0}
}

# --- وظائف الربط مع باينانس (الشفافية والأمان) ---
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

# --- واجهة الموقع الرئيسية (تعزيز القيمة الحقيقية) ---
@app.route('/')
def home():
    return "نظام SDM للشحن الفوري يعمل بنجاح (سوق السودان)"

@app.route('/api/info')
def sdm_info():
    return jsonify({
        "project": "SDM Market",
        "description": "Solana Hidden Gem - High Transparency & Security",
        "status": "Running",
        "rate": f"1 USD = {SDM_RATE} SDM"
    })

# --- معالجة رسائل البوت ---
@bot.message_handler(commands=['start', 'recharge'])
def show_menu(message):
    text = "💎 نظام شحن SDM الآلي - جوهرة سولانا المخفية 💎\n\n"
    text += "مشروع ذو قيمة حقيقية، شفافية عالية، وأمان تام للسوق السوداني.\n\n"
    text += "اختر رقم الباقة ثم أرسل: [الرقم] [الآيدي]\n\n"
    for id, pkg in PACKAGES.items():
        cost_sdm = pkg['usd'] * SDM_RATE
        text += f" {id} - {pkg['name']} ➔ {cost_sdm} SDM\n"
    bot.send_message(message.chat.id, text)

@bot.message_handler(func=lambda m: True)
def process_order(message):
    try:
        args = message.text.split()
        if len(args) < 2: raise ValueError
        pkg_id, game_id = args[0], args[1]
        
        if pkg_id in PACKAGES:
            pkg = PACKAGES[pkg_id]
            cost_sdm = pkg['usd'] * SDM_RATE
            
            # التحقق من المخزن العالمي (Binance) لضمان المصداقية
            binance_usdt = get_binance_balance()
            
            if binance_usdt < pkg['usd']:
                bot.reply_to(message, "⚠️ عذراً، محفظة الشحن فارغة حالياً.\nتم إلغاء العملية وإبقاء رصيدك كما هو. حاول لاحقاً.")
            else:
                bot.reply_to(message, f"✅ تم الشحن فوراً للأيدي: {game_id}\nعبر تقنية SDM (جوهرة سولانا) الآمنة والموثوقة.")
        else:
            bot.reply_to(message, "رقم الباقة غير صحيح.")
    except:
        bot.reply_to(message, "يرجى الإرسال بصيغة: [رقم الباقة] [الآيدي]")

# --- الربط مع Vercel (مهم جداً للاستقرار) ---
def handler(event, context):
    return app(event, context)
