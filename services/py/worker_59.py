import json
import random
from datetime import datetime, timedelta

class Feature59Worker:
    def __init__(self):
        self.cities = ['الخرطوم', 'أم درمان', 'بحري', 'كردفان', 'الجزيرة']

    def fetch_city_trend_data(self, city):
        """Fetch trend data for a specific city"""
        # في تطبيق حقيقي، سيتم جلب البيانات من قاعدة البيانات
        # هذا مجرد محاكاة
        mock_data = self.generate_mock_trend_data(city)
        return json.dumps(mock_data)

    def generate_mock_trend_data(self, city):
        """Generate mock trend data for a city"""
        trends = ['ارتفاع', 'هبوط', 'استقرار']
        random_trend = random.choice(trends)
        return {
            'city': city,
            'trend': random_trend,
            'last5Posts': self.generate_mock_posts(city)
        }

    def generate_mock_posts(self, city):
        """Generate mock posts for a city"""
        posts = []
        for i in range(5):
            posts.append({
                'price': random.randint(100, 1100),
                'timestamp': (datetime.now() - timedelta(days=i)).isoformat()
            })
        return posts

# إنشاء مثيل من الكلاس
feature_59_worker = Feature59Worker()

# دالة للتواصل مع JavaScript
async def handle_request(request):
    try:
        data = json.loads(request)
        city = data.get('city')
        if not city:
            raise ValueError('City parameter is required')
        trend_data = feature_59_worker.fetch_city_trend_data(city)
        return trend_data
    except Exception as e:
        return json.dumps({'error': str(e)})