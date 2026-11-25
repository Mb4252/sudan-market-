import json
from datetime import datetime

class Feature65Worker:
    def __init__(self):
        self.analysis_data = {
            'price-trend': {
                'labels': [],
                'values': [],
                'trend': '',
                'change': 0
            },
            'market-share': {
                'labels': [],
                'values': [],
                'share': 0,
                'position': ''
            }
        }

    def perform_analysis(self, analysis_type, posts):
        try:
            if analysis_type == 'price-trend':
                results = self.analyze_price_trend(posts)
            elif analysis_type == 'market-share':
                results = self.analyze_market_share(posts)

            return {
                'type': analysis_type,
                'data': results
            }
        except Exception as e:
            print(f"Error in analysis: {e}")
            return {
                'error': 'An error occurred during analysis. Please try again.'
            }

    def analyze_price_trend(self, posts):
        # Process data
        prices = [post['price'] for post in posts]
        dates = [datetime.fromisoformat(post['timestamp']) for post in posts]

        # Calculate linear regression
        slope, intercept = self.calculate_linear_regression(dates, prices)

        # Determine price trend
        if slope > 0:
            trend = 'increase'
        elif slope < 0:
            trend = 'decrease'
        else:
            trend = 'stable'

        # Calculate percentage change
        first_price = prices[0]
        last_price = prices[-1]
        change = ((last_price - first_price) / first_price) * 100

        # Update analysis data
        self.analysis_data['price-trend'] = {
            'labels': [date.strftime('%Y-%m-%d') for date in dates],
            'values': prices,
            'trend': trend,
            'change': round(change, 2)
        }

        return self.analysis_data['price-trend']

    def analyze_market_share(self, posts):
        # Process data
        city_counts = {}
        for post in posts:
            if post['city'] in city_counts:
                city_counts[post['city']] += 1
            else:
                city_counts[post['city']] = 1

        # Convert data to lists
        labels = list(city_counts.keys())
        values = list(city_counts.values())

        # Calculate market share
        total_posts = len(posts)
        share = (sum(values) / total_posts) * 100

        # Determine market position
        if share > 50:
            position = 'dominant'
        elif share > 30:
            position = 'strong'
        elif share > 10:
            position = 'moderate'
        else:
            position = 'weak'

        # Update analysis data
        self.analysis_data['market-share'] = {
            'labels': labels,
            'values': values,
            'share': round(share, 2),
            'position': position
        }

        return self.analysis_data['market-share']

    def calculate_linear_regression(self, x, y):
        n = len(x)
        sum_x = sum(xi.timestamp() for xi in x)
        sum_y = sum(y)
        sum_xy = sum(xi.timestamp() * yi for xi, yi in zip(x, y))
        sum_xx = sum(xi.timestamp() ** 2 for xi in x)

        slope = (n * sum_xy - sum_x * sum_y) / (n * sum_xx - sum_x ** 2)
        intercept = (sum_y - slope * sum_x) / n

        return slope, intercept

# Example usage
if __name__ == '__main__':
    worker = Feature65Worker()
    sample_posts = [
        {'price': 100, 'timestamp': '2023-01-01T00:00:00', 'city': 'Khartoum'},
        {'price': 110, 'timestamp': '2023-01-02T00:00:00', 'city': 'Khartoum'},
        {'price': 120, 'timestamp': '2023-01-03T00:00:00', 'city': 'Omdurman'},
        {'price': 130, 'timestamp': '2023-01-04T00:00:00', 'city': 'Khartoum'},
        {'price': 140, 'timestamp': '2023-01-05T00:00:00', 'city': 'Omdurman'}
    ]

    result = worker.perform_analysis('price-trend', sample_posts)
    print(json.dumps(result, indent=2))

    result = worker.perform_analysis('market-share', sample_posts)
    print(json.dumps(result, indent=2))