import firebase_admin
from firebase_admin import credentials, db
from flask import Flask
from threading import Thread
import time
import os
import sys
import requests
import json

# ======================================================
# 1. إعدادات السيرفر
# ======================================================
app = Flask('')

@app.route('/')
def home():
    return "✅ Bot is Running | Connected to SMM Panel"

def run_http():
    app.run(host='0.0.0.0', port=8080)

def keep_alive():
    t = Thread(target=run_http)
    t.start()

# ======================================================
# 2. الاتصال بفايربيس
# ======================================================
if not firebase_admin._apps:
    try:
        # يحاول جلب المفاتيح من متغيرات البيئة في Render
        key_content = os.environ.get('FIREBASE_PRIVATE_KEY')
        if key_content:
            firebase_creds = json.loads(key_content)
            cred = credentials.Certificate(firebase_creds)
            firebase_admin.initialize_app(cred, {
                'databaseURL': 'https://sudan-market-6b122-default-rtdb.firebaseio.com'
            })
            print("✅ تم الاتصال بقاعدة البيانات.")
        else:
            print("⚠️ لم يتم العثور على مفاتيح الفايربيس في المتغيرات.")
    except Exception as e:
        print(f"❌ خطأ في الاتصال: {e}")

# ======================================================
# 3. إعدادات مزود الخدمة (SMM Panel) - عدل هنا
# ======================================================
# 🔴🔴 هام: استبدل البيانات أدناه ببيانات الموقع الذي شحنت فيه رصيدك 🔴🔴
PROVIDER_API_URL = "https://example.com/api/v2"  # ضع رابط الـ API للموقع هنا
PROVIDER_API_KEY = "xxxxxxxxxxxxxxxxxxxxxxxxxxxx"  # ضع الـ API Key الطويل هنا

# أرقام الخدمات في الموقع (Service IDs)
# تأكد من هذه الأرقام من صفحة Services في الموقع
SERVICES_MAP = {
    'pubg': {
        '60': 101,   # رقم خدمة 60 شدة
        '325': 102,  # رقم خدمة 325 شدة
        '660': 103   # رقم خدمة 660 شدة
    },
    'ff': {
        '100': 201,  # رقم خدمة 100 جوهرة
        '530': 202,
        '1080': 203
    }
}

# ======================================================
# 4. دالة الشحن (API Connection)
# ======================================================
def pay_with_provider(player_id, game_type, pack_sdm):
    # تحديد الخدمة المطلوبة
    service_id = None
    cost_sdm = int(pack_sdm)
    
    # تحويل رصيد SDM إلى رقم الخدمة المناسب
    if game_type == 'pubg':
        if cost_sdm == 4: service_id = SERVICES_MAP['pubg']['60']
        elif cost_sdm == 20: service_id = SERVICES_MAP['pubg']['325']
        elif cost_sdm == 40: service_id = SERVICES_MAP['pubg']['660']
    elif game_type == 'ff':
        if cost_sdm == 4: service_id = SERVICES_MAP['ff']['100']
        elif cost_sdm == 20: service_id = SERVICES_MAP['ff']['530']
        elif cost_sdm == 40: service_id = SERVICES_MAP['ff']['1080']
        
    if not service_id:
        return False, "السعر غير مطابق لأي باقة مسجلة"

    # تجهيز الطلب
    payload = {
        'key': PROVIDER_API_KEY,
        'action': 'add',
        'service': service_id,
        'link': player_id,
        'quantity': 1
    }

    # تنفيذ الطلب
    try:
        response = requests.post(PROVIDER_API_URL, data=payload)
        res_json = response.json()
        
        if 'order' in res_json:
            return True, f"تم الطلب برقم: {res_json['order']}"
        elif 'error' in res_json:
            return False, f"رفض المزود: {res_json['error']}"
        else:
            return False, "خطأ غير معروف"
    except Exception as e:
        return False, f"خطأ اتصال: {str(e)}"

# ======================================================
# 5. استرجاع الأموال
# ======================================================
def return_money(uid, amount):
    try:
        db.reference(f'users/{uid}/sdmBalance').transaction(
            lambda current: (current or 0) + float(amount)
        )
        return True
    except: return False

# ======================================================
# 6. التنبيهات
# ======================================================
def send_alert(uid, msg, type_):
    try:
        db.reference(f'alerts/{uid}').push({
            'msg': msg, 'type': type_, 'time': int(time.time()*1000)
        })
    except: pass

# ======================================================
# 7. المعالج الرئيسي
# ======================================================
def handle_database_event(event):
    if not event.data or event.path == "/": return
    
    # الحصول على المفتاح والبيانات
    key = event.path.split('/')[-1] if '/' in event.path else event.path
    if not key: return

    try:
        ref = db.reference(f'game_orders/{key}')
        order = ref.get()
        if not order: return

        # الشروط: الحالة pending ولم تتم المعالجة بعد
        if order.get('status') == 'pending' and not order.get('delivery_status'):
            
            # تغيير الحالة فوراً لمنع التكرار
            ref.update({'delivery_status': 'processing'})
            
            # محاولة الشحن
            success, msg = pay_with_provider(order['playerId'], order['gameType'], order['cost'])
            
            if success:
                ref.update({
                    'status': 'done',
                    'delivery_status': 'delivered',
                    'provider_msg': msg
                })
                send_alert(order['uP'], f"✅ تم شحن {order['gameType']} بنجاح!", "success")
                print(f"✅ نجاح: طلب {key}")
            else:
                # فشل -> استرجاع
                return_money(order['uP'], order['cost'])
                ref.update({
                    'status': 'failed',
                    'delivery_status': 'refunded',
                    'reason': msg
                })
                send_alert(order['uP'], f"❌ فشل الشحن: {msg}", "error")
                print(f"❌ فشل: طلب {key} - {msg}")
                
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    print("🚀 Bot Started...")
    keep_alive()
    db.reference('game_orders').listen(handle_database_event)
