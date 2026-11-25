import json
from datetime import datetime

class PriceAnalyzer:
    def __init__(self):
        self.price_history = []

    def add_price(self, price, timestamp):
        """إضافة سعر جديد مع تأريخ"""
        if not isinstance(price, (int, float)):
            raise ValueError("السعر يجب أن يكون رقماً")
        if not isinstance(timestamp, str):
            raise ValueError("التاريخ يجب أن يكون نصاً ISO")
        try:
            datetime.fromisoformat(timestamp)
        except ValueError:
            raise ValueError("التاريخ غير صالح")
        self.price_history.append({
            "price": price,
            "timestamp": timestamp
        })

    def analyze(self):
        """تحليل الاتجاهات السعرية"""
        if len(self.price_history) < 2:
            return {
                "trend": "غير كاف",
                "message": "مطلوب على الأقل 2 أسعار لتحليل الاتجاهات"
            }
        prices = [item["price"] for item in self.price_history]
        timestamps = [datetime.fromisoformat(item["timestamp"]) for item in self.price_history]
        # حساب الانحدار الخطي
        n = len(prices)
        sum_x = sum(t.timestamp() for t in timestamps)
        sum_y = sum(prices)
        sum_xy = sum(x.timestamp() * y for x, y in zip(timestamps, prices))
        sum_x2 = sum(x.timestamp() ** 2 for x in timestamps)
        slope = (n * sum_xy - sum_x * sum_y) / (n * sum_x2 - sum_x ** 2)
        intercept = (sum_y - slope * sum_x) / n
        trend = "الارتفاع" if slope > 0 else "الهبوط"
        return {
            "trend": trend,
            "slope": slope,
            "intercept": intercept,
            "message": f"الأسعار تميل لل{trend} مع انحدار {slope:.2f}"
        }

    def save_to_file(self, filename):
        """حفظ البيانات إلى ملف JSON"""
        with open(filename, 'w') as f:
            json.dump(self.price_history, f)

    def load_from_file(self, filename):
        """تحميل البيانات من ملف JSON"""
        with open(filename, 'r') as f:
            self.price_history = json.load(f)