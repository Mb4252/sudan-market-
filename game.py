import firebase_admin
from firebase_admin import credentials, db
from flask import Flask
from threading import Thread
import time
import os
import requests
import json

# ======================================================
# 1. إعدادات السيرفر (لإبقاء البوت مستيقظاً)
# ======================================================
app = Flask('')

@app.route('/')
def home():
    return "✅ Game Worker (Python) is Running..."

def run_http():
    app.run(host='0.0.0.0', port=8080)

def keep_alive():
    t = Thread(target=run_http)
    t.start()

# ======================================================
# 2. الاتصال بفايربيس والمزود
# ======================================================
# جلب المتغيرات من إعدادات Render (الأمان أولاً)
FIREBASE_KEY = os.environ.get('FIREBASE_PRIVATE_KEY')
PROVIDER_URL = os.environ.get('PROVIDER_URL') # رابط موقع الشحن
PROVIDER_KEY = os.environ.get('PROVIDER_KEY') # مفتاح موقع الشحن

if not firebase_admin._apps:
    try:
        if FIREBASE_KEY:
            # تنظيف المفتاح في حال وجود مشاكل في النسخ واللصق
            if isinstance(FIREBASE_KEY, str):
                cred_dict = json.loads(FIREBASE_KEY)
            else:
                cred_dict = FIREBASE_KEY
                
            cred = credentials.Certificate(cred_dict)
            firebase_admin.initialize_app(cred, {
                'databaseURL': 'https://sudan-market-6b122-default-rtdb.firebaseio.com'
            })
            print("✅ Connected to Firebase Database.")
        else:
            print("❌ CRITICAL: FIREBASE_PRIVATE_KEY is missing.")
    except Exception as e:
        print(f"❌ Firebase Connection Error: {e}")

# خريطة الخدمات (يجب مطابقتها مع موقع المزود الذي تستخدمه)
# مثال: الباقة 60 شدة في تطبيقك = الخدمة رقم 1555 في موقع المزود
SERVICES_MAP = {
    'pubg': {
        '4': 101,    # سعر 4 SDM = خدمة رقم 101
        '20': 102,   # سعر 20 SDM = خدمة رقم 102
        '40': 103    # سعر 40 SDM = خدمة رقم 103
    },
    'ff': {
        '4': 201,
        '20': 202,
        '40': 203
    }
}

# ======================================================
# 3. دالة الشحن (SMM API Standard)
# ======================================================
def process_order(order_id, order_data):
    # 1. تحديد رقم الخدمة
    try:
        cost_str = str(int(order_data.get('cost', 0))) # تحويل السعر لنص للمقارنة
        game_type = order_data.get('type') or order_data.get('gameType') # التأكد من اسم الحقل
        
        service_id = SERVICES_MAP.get(game_type, {}).get(cost_str)
        
        if not service_id:
            raise ValueError(f"No service ID found for {game_type} cost {cost_str}")

        print(f"⚡ Processing {order_id}: Service {service_id} for {order_data['playerId']}")

        # 2. إرسال الطلب للمزود
        payload = {
            'key': PROVIDER_KEY,
            'action': 'add',
            'service': service_id,
            'link': order_data['playerId'],
            'quantity': 1
        }

        response = requests.post(PROVIDER_URL, data=payload)
        res_json = response.json()

        # 3. تحليل الرد
        if 'order' in res_json:
            # نجاح
            return True, str(res_json['order'])
        elif 'error' in res_json:
            # فشل من المزود
            return False, str(res_json['error'])
        else:
            return False, f"Unknown Response: {res_json}"

    except Exception as e:
        return False, str(e)

# ======================================================
# 4. دالة استرجاع الأموال (Refund)
# ======================================================
def refund_user(uid, amount, reason):
    try:
        print(f"💸 Refunding {amount} to {uid}...")
        ref = db.reference(f'users/{uid}/sdmBalance')
        ref.transaction(lambda current: (current or 0) + float(amount))
        
        # إرسال تنبيه
        db.reference(f'alerts/{uid}').push({
            'msg': f"⚠️ تم استرجاع {amount} SDM. السبب: {reason}",
            'type': 'error',
            'time': int(time.time() * 1000)
        })
        return True
    except Exception as e:
        print(f"❌ Refund Error: {e}")
        return False

# ======================================================
# 5. مستمع قاعدة البيانات (Listener)
# ======================================================
def handle_event(event):
    # تجاهل الأحداث الجذرية أو الفارغة
    if event.data is None: return

    # التعامل مع الحالات المختلفة لمسار الحدث
    try:
        # الحالة 1: تم إضافة طلب جديد (المسار يكون /)
        if event.path == "/":
            data = event.data
            # إذا كانت البيانات قاموساً كبيراً (تحميل أولي أو إضافة)
            if isinstance(data, dict):
                for key, val in data.items():
                    check_and_execute(key, val)
        
        # الحالة 2: تم تعديل طلب محدد (المسار يكون /ORDER_ID)
        else:
            key = event.path.strip("/")
            val = event.data
            check_and_execute(key, val)

    except Exception as e:
        print(f"⚠️ Event Handler Error: {e}")

def check_and_execute(order_id, order_data):
    # الشرط الذهبي: نعالج فقط الطلبات "المدفوعة وبانتظار التنفيذ"
    if isinstance(order_data, dict) and order_data.get('status') == 'paid_waiting_execution':
        
        print(f"🔔 Found paid order: {order_id}")
        
        # 1. تغيير الحالة فوراً إلى processing لمنع التكرار
        db.reference(f'game_orders/{order_id}').update({'status': 'processing'})

        # 2. تنفيذ الشحن
        success, result_msg = process_order(order_id, order_data)

        if success:
            # تم الشحن
            db.reference(f'game_orders/{order_id}').update({
                'status': 'completed',
                'external_id': result_msg,
                'completed_at': int(time.time() * 1000)
            })
            # تنبيه نجاح
            db.reference(f'alerts/{order_data["uP"]}').push({
                'msg': f"✅ تم شحن {order_data.get('type', 'Game')} بنجاح!",
                'type': 'success'
            })
            print(f"✅ Order {order_id} Completed. ID: {result_msg}")
        else:
            # فشل الشحن -> استرجاع الأموال
            refund_user(order_data['uP'], order_data['cost'], result_msg)
            db.reference(f'game_orders/{order_id}').update({
                'status': 'refunded',
                'reason': result_msg
            })
            print(f"❌ Order {order_id} Failed & Refunded. Reason: {result_msg}")

# ======================================================
# 6. التشغيل
# ======================================================
if __name__ == "__main__":
    keep_alive()
    print("🚀 Python Game Worker Started... Listening for 'paid_waiting_execution'")
    # الاستماع للعقدة game_orders
    db.reference('game_orders').listen(handle_event)
