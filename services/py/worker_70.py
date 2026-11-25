import json
from datetime import datetime

class CityTrendAnalyzer:
    def __init__(self):
        self.city_trends = {}

    def analyze_city_trend(self, city, posts):
        city_posts = [post for post in posts if post['city'] == city]

        if len(city_posts) < 2:
            return {
                'city': city,
                'trend': 'لا توجد بيانات كافية لتحليل الاتجاهات',
                'dataPoints': len(city_posts)
            }

        # حساب الانحدار الخطي
        slope, intercept = self.calculate_linear_regression(city_posts)

        # تحديد الاتجاه
        if slope > 0.1:
            trend = 'ارتفاع'
        elif slope < -0.1:
            trend = 'هبوط'
        else:
            trend = 'ثبات'

        return {
            'city': city,
            'trend': trend,
            'slope': slope,
            'intercept': intercept,
            'dataPoints': len(city_posts)
        }

    def calculate_linear_regression(self, posts):
        n = len(posts)
        sum_x = sum_y = sum_xy = sum_xx = 0

        for post in posts:
            x = datetime.fromisoformat(post['timestamp']).timestamp()
            y = post['price']

            sum_x += x
            sum_y += y
            sum_xy += x * y
            sum_xx += x * x

        slope = (n * sum_xy - sum_x * sum_y) / (n * sum_xx - sum_x * sum_x)
        intercept = (sum_y - slope * sum_x) / n

        return slope, intercept

    def update_city_trends(self, posts):
        cities = {post['city'] for post in posts}
        for city in cities:
            self.city_trends[city] = self.analyze_city_trend(city, posts)

        return self.city_trends

# مثال على الاستخدام
if __name__ == '__main__':
    analyzer = CityTrendAnalyzer()
    sample_posts = [
        {'city': 'الخرطوم', 'price': 100, 'timestamp': '2023-01-01T00:00:00'},
        {'city': 'الخرطوم', 'price': 110, 'timestamp': '2023-01-02T00:00:00'},
        {'city': 'الخرطوم', 'price': 120, 'timestamp': '2023-01-03T00:00:00'},
        {'city': 'الخرطوم', 'price': 130, 'timestamp': '2023-01-04T00:00:00'},
        {'city': 'الخرطوم', 'price': 140, 'timestamp': '2023-01-05T00:00:00'}
    ]
    trends = analyzer.update_city_trends(sample_posts)
    print(json.dumps(trends, indent=2, ensure_ascii=False))
