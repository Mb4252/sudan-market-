import os
import json
import time
from datetime import datetime
from threading import Thread
from flask import Flask, jsonify
import firebase_admin
from firebase_admin import credentials, db

# ==========================================
# 1. إعداد السيرفر
# ==========================================
app = Flask('')

@app.route('/')
def home():
    return jsonify({"status": "Active", "msg": "Bot is working..."})

def run_http():
    app.run(host='0.0.0.0', port=8080)

def keep_alive():
    t = Thread(target=run_http)
    t.start()

# ==========================================
# 2. الاتصال بفايربيس
# ==========================================
try:
    secret_key_content = os.environ.get('FIREBASE_KEY')
    if not secret_key_content:
        print("❌ خطأ: لم يتم العثور على المفتاح FIREBASE_KEY في Secrets")
        exit()
    
    cred = credentials.Certificate(json.loads(secret_key_content))
    
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred, {
            'databaseURL': 'https://sudan-market-6b122-default-rtdb.firebaseio.com'
        })
    print("✅ تم الاتصال بقاعدة البيانات بنجاح")

except Exception as e:
    print(f"❌ فشل الاتصال: {e}")
    exit()

# ==========================================
# 3. معالجة التحويلات (Transfer)
# ==========================================
def process_transfer_queue():
    try:
        ref = db.reference('transfer_queue')
        queue = ref.get() # جلب كل الطلبات المعلقة
        
        if not queue: return 

        for key, req in queue.items():
            try:
                print(f"🔄 جاري معالجة التحويل: {key}")
                
                # استخراج البيانات
                sender = req.get('sender')
                receiver = req.get('receiver')
                amount = float(req.get('amount', 0))

                # التأكد من صحة البيانات
                if not sender or not receiver or amount <= 0:
                    print(f"⚠️ بيانات ناقصة في الطلب {key}")
                    ref.child(key).delete()
                    continue

                # جلب بيانات المستخدمين
                s_snap = db.reference(f'users/{sender}').get()
                r_snap = db.reference(f'users/{receiver}').get()

                if not s_snap or not r_snap:
                    print(f"❌ خطأ: المرسل أو المستلم غير موجود في قاعدة البيانات")
                    ref.child(key).delete()
                    continue

                # التحقق من الرصيد
                s_bal = float(s_snap.get('sdmBalance', 0))
                
                if s_bal < amount:
                    # الرصيد لا يكفي
                    db.reference(f'alerts/{sender}').push({
                        'msg': f'❌ فشل التحويل: رصيدك ({s_bal}) لا يكفي', 
                        'type': 'error'
                    })
                    print(f"⛔ رصيد غير كافٍ للمستخدم {sender}")
                else:
                    # تنفيذ التحويل
                    new_s_bal = s_bal - amount
                    new_r_bal = float(r_snap.get('sdmBalance', 0)) + amount
                    
                    updates = {
                        f'users/{sender}/sdmBalance': new_s_bal,
                        f'users/{receiver}/sdmBalance': new_r_bal
                    }
                    db.reference().update(updates)

                    # تسجيل المعاملة (هام جداً لكي تظهر في السجل)
                    op_id = "TR-" + str(int(time.time()))[-6:]
                    tx_data = {
                        'opId': op_id,
                        'amount': amount,
                        'sender': sender,
                        'senderName': s_snap.get('n', 'Unknown'),
                        'receiver': receiver,
                        'receiverName': r_snap.get('n', 'Unknown'),
                        'date': int(time.time() * 1000),
                        'involves': [sender, receiver], # هذا الحقل ضروري للقواعد الجديدة
                        'type': 'transfer'
                    }
                    
                    db.reference('transactions').push(tx_data)
                    
                    # إرسال إشعار للمستلم والمرسل
                    db.reference(f'alerts/{receiver}').push({'isReceipt': True, **tx_data, 'time': datetime.now().strftime("%Y-%m-%d %H:%M")})
                    db.reference(f'alerts/{sender}').push({'msg': f'✅ تم تحويل {amount} SDM بنجاح', 'type': 'success'})
                    
                    print(f"✅ نجاح: تم تحويل {amount} من {sender} إلى {receiver}")

            except Exception as inner_e:
                print(f"❌ خطأ أثناء معالجة الطلب {key}: {inner_e}")
            
            # حذف الطلب من الطابور بعد الانتهاء
            ref.child(key).delete()

    except Exception as e:
        print(f"Global Transfer Error: {e}")

# ==========================================
# 4. معالجة التقييمات (Rating) - المعادلة الصحيحة
# ==========================================
def process_rating_queue():
    try:
        ref = db.reference('rating_queue')
        queue = ref.get()
        
        if not queue: return

        for key, req in queue.items():
            try:
                target = req.get('target')
                rater = req.get('rater')
                stars = float(req.get('stars', 0))

                if not target or not rater:
                    ref.child(key).delete(); continue

                target_ref = db.reference(f'users/{target}')
                u_data = target_ref.get()
                
                if u_data:
                    rated_by = u_data.get('ratedBy', [])
                    # تصحيح نوع البيانات (أحياناً تعود كـ Dict)
                    if isinstance(rated_by, dict): rated_by = list(rated_by.values())
                    elif rated_by is None: rated_by = []
                    
                    if rater not in rated_by:
                        # --- حساب المتوسط الحسابي الصحيح ---
                        current_rating = float(u_data.get('rating', 0))
                        count = len(rated_by)
                        
                        # المعادلة: (التقييم القديم * العدد القديم + التقييم الجديد) / العدد الجديد
                        new_total_score = (current_rating * count) + stars
                        new_count = count + 1
                        new_average = new_total_score / new_count
                        
                        rated_by.append(rater)

                        target_ref.update({
                            'rating': new_average,
                            'ratedBy': rated_by
                        })
                        
                        db.reference(f'alerts/{rater}').push({'msg': '✅ تم إرسال تقييمك', 'type': 'success'})
                        print(f"⭐ تم تحديث تقييم المستخدم {target} إلى {new_average:.2f}")
                    else:
                        db.reference(f'alerts/{rater}').push({'msg': '⚠️ لقد قيمت هذا المستخدم مسبقاً', 'type': 'info'})
            
            except Exception as inner_e:
                print(f"❌ خطأ في التقييم {key}: {inner_e}")
            
            ref.child(key).delete()

    except Exception as e:
        print(f"Global Rating Error: {e}")

# ==========================================
# التشغيل
# ==========================================
if __name__ == "__main__":
    keep_alive()
    print("🚀 البوت يعمل الآن ويراقب الطلبات...")
    
    while True:
        try:
            process_transfer_queue()
            process_rating_queue()
            time.sleep(3) # فحص كل 3 ثواني
        except Exception as e:
            print(f"Main Loop Error: {e}")
            time.sleep(5)
