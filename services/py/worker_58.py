import json
import numpy as np
from datetime import datetime

class CityTrendAnalyzer:
    def __init__(self):
        self.posts = []

    def analyze_city_trend(self, city):
        try:
            # جلب المنشورات من قاعدة البيانات
            self.posts = self.fetch_posts(city)

            if len(self.posts) < 5:
                raise ValueError('لا توجد بيانات كافية لتحليل المدينة')

            trend = self.calculate_trend()
            confidence = self.calculate_confidence()

            return {
                'trend': trend,
                'confidence': confidence
            }
        except Exception as e:
            print(f'خطأ في تحليل اتجاهات المدينة: {e}')
            raise

    def fetch_posts(self, city):
        # هنا يجب استبدال هذا بالاتصال الفعلي بقاعدة البيانات
        # هذا مثال وهمي
        return [
            {'price': 100, 'timestamp': datetime.now().isoformat()},
            {'price': 110, 'timestamp': datetime.now().isoformat()},
            {'price': 120, 'timestamp': datetime.now().isoformat()},
            {'price': 130, 'timestamp': datetime.now().isoformat()},
            {'price': 140, 'timestamp': datetime.now().isoformat()}
        ]

    def calculate_trend(self):
        # استخدام الانحدار الخطي لحساب الاتجاه
        x = np.array(range(len(self.posts)))
        y = np.array([post['price'] for post in self.posts])

        slope, _ = np.polyfit(x, y, 1)
        return float(slope)

    def calculate_confidence(self):
        # حساب الثقة بناءً على حجم البيانات والتباين
        prices = [post['price'] for post in self.posts]
        mean = np.mean(prices)
        std_dev = np.std(prices)

        # ثقة أعلى عندما يكون التباين منخفضًا وحجم البيانات كبيرًا
        return min(1, (1 / (std_dev + 1)) * (len(prices) / 10))

if __name__ == '__main__':
    analyzer = CityTrendAnalyzer()
    result = analyzer.analyze_city_trend('الخرطوم')
    print(json.dumps(result, ensure_ascii=False))