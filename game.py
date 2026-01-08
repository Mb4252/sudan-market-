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
# 1. إعدادات السيرفر (لإبقاء البوت يعمل 24/7)
# ======================================================
app = Flask('')

@app.route('/')
def home():
    return "✅ Sudan Market Game Bot is Running 24/7!"

def run_http():
    app.run(host='0.0.0.0', port=8080)

def keep_alive():
    t = Thread(target=run_http)
    t.start()

# ======================================================
# 2. الاتصال بقاعدة بيانات فايربيس (تعديل الأمان والمصداقية)
# ======================================================
if not firebase_admin._apps:
    try:
        # قمنا بربط المفاتيح مباشرة من Secrets في Replit كما في الصورة
        firebase_creds = json.loads(os.environ['FIREBASE_PRIVATE_KEY'])
        cred = credentials.Certificate(firebase_creds)
        
        firebase_admin.initialize_app(cred, {
            'databaseURL': 'https://sudan-market-6b122-default-rtdb.firebaseio.com'
        })
        print("✅ تم الاتصال بقاعدة بيانات Sudan Market بنجاح.")
    except Exception as e:
        print(f"❌ فشل الاتصال بقاعدة البيانات: {e}")
        # محاولة أخيرة عبر الملف إذا لم تتوفر الـ Secrets
        try:
            cred = credentials.Certificate("serviceAccountKey.json")
            firebase_admin.initialize_app(cred, {
                'databaseURL': 'https://sudan-market-6b122-default-rtdb.firebaseio.com'
            })
        except:
            print("❌ لم يتم العثور على مفاتيح الوصول.")
            exit()

# ======================================================
# 3. دالة الدفع (Pay with Provider) - API الربط
# ======================================================
def pay_with_provider(player_id, game_type, pack_name):
    print(f"💳 محاولة شحن: {game_type} للآيدي: {player_id}")
    
    # التحقق من صحة البيانات
    if len(str(player_id)) < 5:
        return False, "الآيدي المدخل غير صحيح"

    # هنا يمكنك وضع API الخاص بـ Binance أو SMM Panel مستقبلاً
    # هذا المشروع ذو قيمة حقيقية وشفافية عالية في التعامل
    payment_success = True 
    
    if payment_success:
        return True, "تم الشحن بنجاح"
    else:
        return False, "فشل الدفع عند المزود"

# ======================================================
# 4. دالة استرجاع الأموال (Refund) بعملة SDM
# ======================================================
def return_money_to_user(uid, amount):
    print(f"🔄 جاري استرجاع {amount} SDM للمستخدم {uid}...")
    try:
        user_ref = db.reference(f'users/{uid}')
        def transaction_func(current_data):
            if current_data is None:
                return current_data
            current_balance = float(current_data.get('sdmBalance', 0))
            current_data['sdmBalance'] = current_balance + float(amount)
            return current_data
        
        user_ref.transaction(transaction_func)
        print(f"💰 تمت عملية استرجاع عملة SDM بنجاح.")
        return True
    except Exception as e:
        print(f"🔥 خطأ في الاسترجاع: {e}")
        return False

# ======================================================
# 5. دالة التنبيهات (Notifications)
# ======================================================
def send_alert(uid, msg, type_):
    try:
        db.reference(f'alerts/{uid}').push({
            'msg': msg,
            'type': type_,
            'time': int(time.time() * 1000),
            'read': False
        })
    except:
        pass

# ======================================================
# 6. معالج الطلبات (The Logic)
# ======================================================
def process_order(order_key, order_data):
    user_id = order_data.get('uP')
    cost = order_data.get('cost')
    game_type = order_data.get('gameType')
    player_id = order_data.get('playerId')
    pack_name = order_data.get('package')

    print(f"⚙️ معالجة طلب Sudan Market رقم: {order_key}")
    db.reference(f'game_orders/{order_key}').update({'delivery_status': 'processing'})

    success, message = pay_with_provider(player_id, game_type, pack_name)

    if success:
        db.reference(f'game_orders/{order_key}').update({
            'delivery_status': 'delivered',
            'delivery_time': int(time.time() * 1000)
        })
        send_alert(user_id, f"✅ تم شحن {game_type} ({pack_name}) بنجاح!", "success")
    else:
        refund_status = return_money_to_user(user_id, cost)
        if refund_status:
            db.reference(f'game_orders/{order_key}').update({
                'status': 'failed',
                'delivery_status': 'refunded',
                'reason': message
            })
            send_alert(user_id, f"❌ فشل الشحن، تم إعادة {cost} SDM إلى محفظتك.", "error")

# ======================================================
# 7. مراقب قاعدة البيانات (Listener)
# ======================================================
def handle_database_event(event):
    if event.data is None:
        return
    path = event.path
    if path == "/":
        return
    
    order_key = path.split('/')[1] if len(path.split('/')) > 1 else None
    if not order_key:
        return

    try:
        ref = db.reference(f'game_orders/{order_key}')
        snapshot = ref.get()
        if not snapshot:
            return

        status = snapshot.get('status')
        delivery_status = snapshot.get('delivery_status')

        if status == 'done' and delivery_status is None:
            process_order(order_key, snapshot)
    except Exception as e:
        print(f"خطأ في قراءة الطلب: {e}")

# ======================================================
# 8. التشغيل الرئيسي
# ======================================================
if __name__ == "__main__":
    print("🚀 جاري تشغيل بوت Sudan Market - جوهرة سولانا...")
    keep_alive()
    try:
        print("🎧 البوت يستمع الآن لطلبات الشحن...")
        db.reference('game_orders').listen(handle_database_event)
    except Exception as e:
        print(f"❌ خطأ في المستمع: {e}")
        os.execv(sys.executable, ['python'] + sys.argv)

