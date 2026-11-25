import json
import requests
from datetime import datetime

# دالة للحصول على بيانات الميزة
async def fetch_feature_data():
    try:
        response = requests.get('https://sudan-market-2.onrender.com/api/feature-61')
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"[Worker 61] Error fetching data: {e}")
        return None

# دالة لتحديث البيانات
async def update_feature():
    data = await fetch_feature_data()
    if data:
        # معالجة البيانات وتخزينها
        print(f"[Worker 61] Data updated at {datetime.now()}")
    else:
        print("[Worker 61] Failed to update data")

# نقطة الدخول
if __name__ == "__main__":
    import asyncio
    asyncio.run(update_feature())