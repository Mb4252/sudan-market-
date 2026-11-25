import json
from datetime import datetime

class CityTrendsAnalyzer:
    @staticmethod
    def analyze_city_trends(city, posts):
        try:
            city_posts = [post for post in posts if post['city'] == city]

            if len(city_posts) < 2:
                raise ValueError('لا يوجد بيانات كافية لتحليل الاتجاهات')

            prices = [post['price'] for post in city_posts]
            timestamps = [datetime.fromisoformat(post['timestamp']).timestamp() for post in city_posts]

            trend = CityTrendsAnalyzer.calculate_trend(timestamps, prices)
            confidence = CityTrendsAnalyzer.calculate_confidence(len(city_posts), prices)

            return {
                'city': city,
                'trend': trend,
                'confidence': confidence,
                'chart': CityTrendsAnalyzer.generate_chart(prices)
            }
        except Exception as e:
            raise Exception(f"خطأ في تحليل الاتجاهات: {str(e)}")

    @staticmethod
    def calculate_trend(timestamps, prices):
        n = len(timestamps)
        sum_x = sum(timestamps)
        sum_y = sum(prices)
        sum_xy = sum(x * y for x, y in zip(timestamps, prices))
        sum_x2 = sum(x * x for x in timestamps)

        slope = (n * sum_xy - sum_x * sum_y) / (n * sum_x2 - sum_x * sum_x)
        return 'ارتفاع' if slope > 0 else 'هبوط' if slope < 0 else 'ثابت'

    @staticmethod
    def calculate_confidence(data_size, prices):
        variance = CityTrendsAnalyzer.calculate_variance(prices)
        return min(100, (data_size / 10) * (1 - variance / max(prices)) * 100)

    @staticmethod
    def calculate_variance(values):
        avg = sum(values) / len(values)
        return sum((x - avg) ** 2 for x in values) / len(values)

    @staticmethod
    def generate_chart(prices):
        min_price = min(prices)
        max_price = max(prices)
        normalized_prices = [int((p - min_price) / (max_price - min_price) * 10) for p in prices]

        chart = []
        for i in range(9, -1, -1):
            row = ''.join(['■ ' if price >= i else '  ' for price in normalized_prices])
            chart.append(row)

        return '\n'.join(chart)

if __name__ == '__main__':
    # مثال على الاستخدام
    sample_posts = [
        {'city': 'الخرطوم', 'price': 100, 'timestamp': '2023-01-01T00:00:00'},
        {'city': 'الخرطوم', 'price': 120, 'timestamp': '2023-01-02T00:00:00'},
        {'city': 'الخرطوم', 'price': 110, 'timestamp': '2023-01-03T00:00:00'}
    ]
    
    analyzer = CityTrendsAnalyzer()
    result = analyzer.analyze_city_trends('الخرطوم', sample_posts)
    print(json.dumps(result, indent=2, ensure_ascii=False))