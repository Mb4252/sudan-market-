import json
from datetime import datetime

class Feature30Worker:
    def __init__(self):
        self.analysis_data = None

    def perform_analysis(self, posts):
        """تحليل المنشورات وتوليد بيانات التحليل"""
        if not posts:
            return None

        # حساب متوسط السعر
        total_price = sum(post['price'] for post in posts)
        average_price = total_price / len(posts)

        # حساب التباين
        price_variance = sum((post['price'] - average_price) ** 2 for post in posts) / len(posts)

        # حساب الاتجاه (ارتفاع/هبوط)
        trend = "stable"
        if len(posts) > 1:
            first_price = posts[0]['price']
            last_price = posts[-1]['price']
            if last_price > first_price * 1.1:
                trend = "up"
            elif last_price < first_price * 0.9:
                trend = "down"

        self.analysis_data = {
            "average_price": average_price,
            "price_variance": price_variance,
            "trend": trend,
            "last_updated": datetime.now().isoformat()
        }

        return self.analysis_data

    def get_analysis_data(self):
        """إرجاع بيانات التحليل"""
        return self.analysis_data