import json
from datetime import datetime

class Feature48Worker:
    def __init__(self):
        self.last_analysis = None

    def analyze_city_trends(self, city, posts):
        try:
            city_posts = [post for post in posts if post['city'] == city]

            if len(city_posts) < 2:
                raise ValueError('لا توجد بيانات كافية لتحليل الاتجاهات')

            trend = self._calculate_trend(city_posts)
            confidence = self._calculate_confidence(city_posts)

            self.last_analysis = {
                'city': city,
                'trend': trend,
                'confidence': confidence,
                'last_posts': city_posts[-5:]
            }

            return self.last_analysis
        except Exception as e:
            raise e

    def _calculate_trend(self, posts):
        # منطق انحدار خطي بسيط
        sorted_posts = sorted(posts, key=lambda x: datetime.fromisoformat(x['timestamp']))
        prices = [post['price'] for post in sorted_posts]
        timestamps = [datetime.fromisoformat(post['timestamp']).timestamp() for post in sorted_posts]

        n = len(prices)
        sum_x = sum(timestamps)
        sum_y = sum(prices)
        sum_xy = sum(x * y for x, y in zip(timestamps, prices))
        sum_xx = sum(x * x for x in timestamps)

        slope = (n * sum_xy - sum_x * sum_y) / (n * sum_xx - sum_x * sum_x)
        return 'ارتفاع' if slope > 0 else 'هبوط' if slope < 0 else 'ثابت'

    def _calculate_confidence(self, posts):
        # حساب الثقة بناءً على حجم البيانات والتباين
        prices = [post['price'] for post in posts]
        mean = sum(prices) / len(prices)
        variance = sum((x - mean) ** 2 for x in prices) / len(prices)
        std_dev = variance ** 0.5

        # ثقة أعلى عندما يكون التباين منخفضًا وحجم البيانات كبير
        return min(100, max(0, 100 - (std_dev / mean) * 100))

# مثال على الاستخدام
if __name__ == '__main__':
    worker = Feature48Worker()
    sample_posts = [
        {'city': 'الخرطوم', 'price': 100, 'timestamp': '2023-01-01T00:00:00'}, 
        {'city': 'الخرطوم', 'price': 110, 'timestamp': '2023-01-02T00:00:00'}, 
        {'city': 'الخرطوم', 'price': 120, 'timestamp': '2023-01-03T00:00:00'},
        {'city': 'الخرطوم', 'price': 130, 'timestamp': '2023-01-04T00:00:00'},
        {'city': 'الخرطوم', 'price': 140, 'timestamp': '2023-01-05T00:00:00'},
        {'city': 'الخرطوم', 'price': 150, 'timestamp': '2023-01-06T00:00:00'}
    ]
    result = worker.analyze_city_trends('الخرطوم', sample_posts)
    print(json.dumps(result, indent=2, ensure_ascii=False))
