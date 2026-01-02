import hashlib
import hmac
import time
import requests
from flask import Flask, request, jsonify

app = Flask(__name__)

# --- إعدادات الحساب ---
BINANCE_API_KEY = 'ضع_هنا_API_KEY_الخاص_بك'
BINANCE_SECRET = 'ضع_هنا_SECRET_KEY_الخاص_بك'
SDM_RATE = 4  # كل 1 دولار = 4 حبات SDM

# --- تعريف الباقات وأسعارها ---
PACKAGES = {
    "ff_100": {"name": "100 جوهرة فري فاير", "usd": 1.0, "sdm": 4},
    "ff_500": {"name": "500 جوهرة فري فاير", "usd": 5.0, "sdm": 20},
    "pubg_60": {"name": "60 شدة ببجي", "usd": 1.0, "sdm": 4},
    "pubg_325": {"name": "325 شدة ببجي", "usd": 5.0, "sdm": 20}
}

def get_binance_balance():
    """التحقق من رصيد USDT المتاح في باينانس"""
    timestamp = int(time.time() * 1000)
    query = f"timestamp={timestamp}"
    signature = hmac.new(BINANCE_SECRET.encode(), query.encode(), hashlib.sha256).hexdigest()
    url = f"https://api.binance.com/api/v3/account?{query}&signature={signature}"
    try:
        res = requests.get(url, headers={'X-MBX-APIKEY': BINANCE_API_KEY}).json()
        for asset in res.get('balances', []):
            if asset['asset'] == 'USDT':
                return float(asset['free'])
    except: return 0.0
    return 0.0

@app.route('/api/order', methods=['POST'])
def process_order():
    data = request.json
    pkg_id = data.get('pkg_id')
    player_id = data.get('player_id')
    user_sdm_balance = float(data.get('user_balance', 0))

    pkg = PACKAGES.get(pkg_id)
    if not pkg:
        return jsonify({"status": "error", "msg": "الباقة غير موجودة"})

    # 1. فحص رصيد المستخدم (SDM)
    if user_sdm_balance < pkg['sdm']:
        return jsonify({"status": "error", "msg": "رصيد SDM الخاص بك غير كافٍ"})

    # 2. فحص الأيدي (ID) - شرط الطول للأمان
    if not player_id or len(player_id) < 5:
        return jsonify({"status": "error", "msg": "الأيدي (ID) خاطئ، تم إلغاء العملية"})

    # 3. فحص رصيد باينانس (السيولة)
    binance_usdt = get_binance_balance()
    if binance_usdt < pkg['usd']:
        return jsonify({"status": "error", "msg": "فشل: لا يوجد رصيد كافٍ في محفظة المنصة (باينانس)"})

    # 4. إذا مرت الشروط (هنا تضع كود استدعاء API الشحن الفعلي)
    # ملاحظة: باينانس باي يتطلب ربطاً خاصاً، سنقوم هنا بإرجاع "نجاح" لبدء الخصم
    return jsonify({
        "status": "success", 
        "msg": f"تم التحقق بنجاح. سيتم شحن {pkg['name']} وخصم {pkg['sdm']} SDM",
        "deduct": pkg['sdm']
    })
