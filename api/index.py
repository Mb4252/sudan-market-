from flask import Flask, jsonify, request
import telebot
import requests
import time
import hashlib
import hmac

app = Flask(__name__)

# --- بيانات الـ API الخاصة بك (أمان عالي) ---
API_KEY = 'ITPifXfdCKwktQ9Gqqc2UEt0rxJpoKP1EHaKrY1JQjkbAsfPU5kVgFC10ftBdTDg'
SECRET_KEY = 'dNVtHcSCp3nOhVAb17iASkaGNI3iPR2coyWXF0OIT8wVZSTEu4LwmzhEgv0cnAEW'
BOT_TOKEN = '7611593539:AAHeq2IitqIun35e98x-w49HqE3u-NfJvO8' 

bot = telebot.TeleBot(BOT_TOKEN)
BASE_URL = "https://api.binance.com"
SDM_RATE = 4  # 1 دولار = 4 SDM

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

# --- هذا هو مفتاح الربط مع الـ HTML (هام جداً) ---
@app.route('/api/verify-charge', methods=['POST'])
def verify_charge():
    data = request.json
    sdm_amount = float(data.get('amount', 0))
    usd_needed = sdm_amount / SDM_RATE
    
    # التأكد من رصيد باينانس (المصداقية)
    binance_usdt = get_binance_balance()
    
    if binance_usdt < usd_needed:
        return jsonify({
            "status": "error",
            "message": "⚠️ رصيد محفظة الشحن العالمية حالياً غير كافٍ. لم يتم خصم أي شيء من رصيدك."
        })
    
    # إرسال إشعار فوري لمجموعة الإدارة عند كل عملية شحن ناجحة
    bot.send_message("-1002360252569", f"💎 طلب شحن جديد عبر SDM\nاللاعب: {data.get('playerID')}\nالكمية: {sdm_amount} SDM")
    
    return jsonify({"status": "success", "message": "تم التحقق من الأمان بنجاح"})

@app.route('/')
def home():
    return "SDM Backend is Live"

def handler(event, context):
    return app(event, context)
