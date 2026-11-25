import json
from datetime import datetime

class Feature54Worker:
    def __init__(self):
        self.cities = ['الخرطوم', 'أم درمان', 'بورتسودان', 'كسلا', 'عطبرة', 'الدمازين']

    def analyze_city_trends(self, city):
        try:
            # جلب المنشورات للمدينة المحددة
            posts = self.fetch_posts()
            city_posts = [post for post in posts if post['city'] == city]

            if len(city_posts) < 5:
                raise ValueError('لا توجد بيانات كافية لتحليل اتجاهات المدينة')

            # تحليل الاتجاه
            trend_data = self.calculate_trend(city_posts)
            return trend_data
        except Exception as e:
            return {'error': str(e)}

    def fetch_posts(self):
        # هنا يجب استبدال هذا بالتحقق من قاعدة البيانات أو API
        # هذا مجرد مثال
        return [
            {'city': 'الخرطوم', 'price': 100, 'timestamp': '2023-01-01T00:00:00Z'},
            {'city': 'الخرطوم', 'price': 110, 'timestamp': '2023-01-02T00:00:00Z'},
            {'city': 'الخرطوم', 'price': 120, 'timestamp': '2023-01-03T00:00:00Z'},
            {'city': 'الخرطوم', 'price': 130, 'timestamp': '2023-01-04T00:00:00Z'},
            {'city': 'الخرطوم', 'price': 140, 'timestamp': '2023-01-05T00:00:00Z'},
            {'city': 'أم درمان', 'price': 90, 'timestamp': '2023-01-01T00:00:00Z'},
            {'city': 'أم درمان', 'price': 95, 'timestamp': '2023-01-02T00:00:00Z'},
            {'city': 'أم درمان', 'price': 100, 'timestamp': '2023-01-03T00:00:00Z'},
            {'city': 'أم درمان', 'price': 105, 'timestamp': '2023-01-04T00:00:00Z'},
            {'city': 'أم درمان', 'price': 110, 'timestamp': '2023-01-05T00:00:00Z'}
        ]

    def calculate_trend(self, posts):
        # ترتيب المنشورات حسب التاريخ
        sorted_posts = sorted(posts, key=lambda x: datetime.strptime(x['timestamp'], '%Y-%m-%dT%H:%M:%SZ'))

        # استخراج الأسعار والأوقات
        prices = [post['price'] for post in sorted_posts]
        times = list(range(len(sorted_posts)))

        # حساب الانحدار الخطي
        slope, intercept = self.linear_regression(times, prices)

        # حساب الاتجاه
        trend = 'up' if slope > 0 else 'down'

        # حساب الثقة (بناءً على حجم البيانات والتباين)
        confidence = self.calculate_confidence(len(posts), prices)

        return {
            'trend': trend,
            'confidence': confidence,
            'labels': [f'منشور {t + 1}' for t in times],
            'values': prices
        }

    def linear_regression(self, x, y):
        n = len(x)
        sum_x = sum(x)
        sum_y = sum(y)
        sum_xy = sum(x[i] * y[i] for i in range(n))
        sum_xx = sum(x[i] * x[i] for i in range(n))

        slope = (n * sum_xy - sum_x * sum_y) / (n * sum_xx - sum_x * sum_x)
        intercept = (sum_y - slope * sum_x) / n

        return slope, intercept

    def calculate_confidence(self, data_size, prices):
        # حساب التباين
        mean = sum(prices) / len(prices)
        variance = sum((price - mean) ** 2 for price in prices) / len(prices)
        std_dev = variance ** 0.5

        # حساب الثقة (بناءً على حجم البيانات والتباين)
        # هنا نستخدم صيغة بسيطة: الثقة = (حجم البيانات / 10) * (1 - (التباين / متوسط السعر))
        confidence = min(100, max(0, (data_size / 10) * (1 - (std_dev / mean)) * 100))

        return round(confidence)

# مثال على الاستخدام
if __name__ == '__main__':
    worker = Feature54Worker()
    result = worker.analyze_city_trends('الخرطوم')
    print(json.dumps(result, ensure_ascii=False, indent=2))