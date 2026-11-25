import json
from datetime import datetime

class PriceAnalyzer:
    def __init__(self):
        self.price_history = []

    def add_price(self, price, timestamp):
        self.price_history.append({
            'price': price,
            'timestamp': timestamp
        })

    def analyze_trend(self):
        if len(self.price_history) < 2:
            return 'غير كافي من البيانات'

        prices = [item['price'] for item in self.price_history]
        timestamps = [datetime.fromisoformat(item['timestamp']) for item in self.price_history]

        # حساب الانحدار الخطي
        n = len(prices)
        sum_x = sum(t.timestamp() for t in timestamps)
        sum_y = sum(prices)
        sum_xy = sum(x.timestamp() * y for x, y in zip(timestamps, prices))
        sum_x2 = sum(x.timestamp() ** 2 for x in timestamps)

        denominator = n * sum_x2 - sum_x ** 2
        if denominator == 0:
            return 'لا يوجد اتجاه واضح'

        slope = (n * sum_xy - sum_x * sum_y) / denominator
        intercept = (sum_y - slope * sum_x) / n

        if slope > 0:
            return 'الارتفاع'
        elif slope < 0:
            return 'الهبوط'
        else:
            return 'ثابت'

    def calculate_confidence(self):
        if len(self.price_history) < 2:
            return 0

        prices = [item['price'] for item in self.price_history]
        mean = sum(prices) / len(prices)
        variance = sum((x - mean) ** 2 for x in prices) / len(prices)
        std_dev = variance ** 0.5

        if std_dev == 0:
            return 1

        confidence = 1 - (std_dev / mean)
        return max(0, min(1, confidence))

if __name__ == '__main__':
    analyzer = PriceAnalyzer()
    analyzer.add_price(100, '2023-01-01T00:00:00')
    analyzer.add_price(120, '2023-01-02T00:00:00')
    analyzer.add_price(110, '2023-01-03T00:00:00')
    print(analyzer.analyze_trend())  # يجب أن يعرض 'الهبوط'
    print(analyzer.calculate_confidence())  # يجب أن يعرض قيمة بين 0 و 1