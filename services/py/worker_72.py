import json
from datetime import datetime

class TrendAnalyzer:
    def __init__(self):
        self.trend_data = {}

    def analyze_trend(self, city, posts):
        try:
            city_posts = [post for post in posts if post['city'] == city]

            if len(city_posts) < 5:
                raise ValueError('عدد المنشورات غير كافٍ لتحليل الاتجاه')

            prices = [post['price'] for post in city_posts]
            timestamps = [datetime.fromisoformat(post['timestamp']).timestamp() for post in city_posts]

            trend = self._calculate_trend(prices, timestamps)
            confidence = self._calculate_confidence(len(city_posts))

            self.trend_data[city] = {'trend': trend, 'confidence': confidence}
            return self.trend_data[city]
        except Exception as e:
            print(f'خطأ في تحليل الاتجاه: {e}')
            raise

    def _calculate_trend(self, prices, timestamps):
        # منطق حساب الاتجاه
        pass

    def _calculate_confidence(self, data_size):
        # منطق حساب الثقة
        pass

analyzer = TrendAnalyzer()
