import json

def process_data(data):
    # معالجة البيانات
    return json.dumps(data)

def compare_prices(prices):
    # مقارنة الأسعار
    return sorted(prices, key=lambda x: x['price'])[:3]