import json
from datetime import datetime

# دالة لتحليل الاتجاهات
def analyze_trends(posts):
    city_trends = {}

    # تحليل الاتجاهات لكل مدينة
    for post in posts:
        city = post['city']
        if city not in city_trends:
            city_trends[city] = {
                'prices': [],
                'timestamps': []
            }

        city_trends[city]['prices'].append(post['price'])
        city_trends[city]['timestamps'].append(datetime.fromisoformat(post['timestamp']).timestamp())

    # حساب الانحدار الخطي لكل مدينة
    trend_results = {}
    for city, data in city_trends.items():
        prices = data['prices']
        timestamps = data['timestamps']
        if len(prices) < 2:
            trend_results[city] = 'غير كافٍ'
            continue

        n = len(prices)
        sum_x = sum(timestamps)
        sum_y = sum(prices)
        sum_xy = sum(x * y for x, y in zip(timestamps, prices))
        sum_x2 = sum(x * x for x in timestamps)

        slope = (n * sum_xy - sum_x * sum_y) / (n * sum_x2 - sum_x * sum_x)
        trend_results[city] = 'ارتفاع' if slope > 0 else 'هبوط' if slope < 0 else 'ثابت'

    return trend_results

# دالة لمعالجة الطلبات
async def handle_request(request):
    try:
        posts = request['posts']
        trend_results = analyze_trends(posts)
        return {
            'status': 'success',
            'results': trend_results
        }
    except Exception as e:
        return {
            'status': 'error',
            'message': str(e)
        }