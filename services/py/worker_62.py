import json
import requests

# إعدادات
API_BASE = 'https://sudan-market-2.onrender.com'

# مقارنة البيانات
async def compare_data():
    try:
        response = requests.get(f"{API_BASE}/compare")
        if response.status_code != 200:
            raise Exception('خطأ في جلب بيانات المقارنة')
        return json.loads(response.text)
    except Exception as e:
        handle_error(e)
        raise e

# معالجة الأخطاء
async def handle_error(error):
    print(f"خطأ في Worker 62: {error}")
    # يمكن إضافة منطق تسجيل الأخطاء أو إشعارات للمستخدم

# واجهة عامة
async def main():
    return await compare_data()
