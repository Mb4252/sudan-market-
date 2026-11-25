import json
import time
from datetime import datetime

class TrendAnalyzer:
    def __init__(self):
        self.posts = []

    def add_post(self, post):
        self.posts.append(post)

    def analyze_trend(self):
        if not self.posts:
            raise ValueError("لا توجد منشورات للتحليل")

        prices = [post['price'] for post in self.posts]
        timestamps = [datetime.fromisoformat(post['timestamp']).timestamp() for post in self.posts]

        n = len(prices)
        sum_x = sum(timestamps)
        sum_y = sum(prices)
        sum_xy = sum(x * y for x, y in zip(timestamps, prices))
        sum_x2 = sum(x * x for x in timestamps)

        slope = (n * sum_xy - sum_x * sum_y) / (n * sum_x2 - sum_x * sum_x)
        intercept = (sum_y - slope * sum_x) / n

        mean = sum_y / n
        variance = sum((y - mean) ** 2 for y in prices) / n
        confidence = min(100, max(0, 100 - (variance / mean) * 100))

        return {
            'trend': 'ارتفاع' if slope > 0 else 'هبوط' if slope < 0 else 'ثابت',
            'confidence': round(confidence)
        }

if __name__ == '__main__':
    analyzer = TrendAnalyzer()
    # مثال على استخدام
    sample_posts = [
        {'price': 100, 'timestamp': '2023-01-01T00:00:00'},
        {'price': 150, 'timestamp': '2023-01-02T00:00:00'},
        {'price': 200, 'timestamp': '2023-01-03T00:00:00'}
    ]
    for post in sample_posts:
        analyzer.add_post(post)
    print(analyzer.analyze_trend())