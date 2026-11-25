import json
from datetime import datetime

class Feature49Worker:
    def __init__(self, store):
        self.store = store

    def handle_feature_49_analysis(self, action):
        city = action['payload']['city']
        posts = self.store.get_posts()

        # تحليل الاتجاهات
        trend_data = self.analyze_trend(posts, city)

        # تحديث واجهة المستخدم
        self.store.dispatch({
            'type': 'UPDATE_FEATURE_49_RESULTS',
            'payload': {
                'city': city,
                'trend': trend_data['trend'],
                'forecast': trend_data['forecast'],
                'confidence': trend_data['confidence']
            }
        })

    def analyze_trend(self, posts, city):
        city_posts = [post for post in posts if post['city'] == city]
        if len(city_posts) < 2:
            return {
                'trend': 0,
                'forecast': 0,
                'confidence': 0
            }

        # حساب الانحدار الخطي
        x = list(range(len(city_posts)))
        y = [post['price'] for post in city_posts]

        n = len(x)
        sum_x = sum(x)
        sum_y = sum(y)
        sum_xy = sum(xi * yi for xi, yi in zip(x, y))
        sum_x2 = sum(xi * xi for xi in x)

        slope = (n * sum_xy - sum_x * sum_y) / (n * sum_x2 - sum_x * sum_x)
        intercept = (sum_y - slope * sum_x) / n

        # التنبؤ بالأسعار المستقبلية
        forecast = intercept + slope * (n + 1)

        # حساب الثقة (بناءً على حجم البيانات والتباين)
        prices = [post['price'] for post in city_posts]
        mean = sum(prices) / len(prices)
        variance = sum((price - mean) ** 2 for price in prices) / len(prices)
        std_dev = variance ** 0.5
        confidence = min(100, (1 - std_dev / mean) * 100)

        return {
            'trend': slope,
            'forecast': forecast,
            'confidence': confidence
        }