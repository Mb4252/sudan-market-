import json
from datetime import datetime

# دالة لتحليل اتجاهات الأسعار في مدينة محددة
async def analyze_city_trend(city: str, posts: list) -> dict:
    # تصفية المنشورات حسب المدينة
    city_posts = [post for post in posts if post['city'] == city]

    if len(city_posts) < 2:
        raise ValueError("لا توجد بيانات كافية لتحليل الاتجاهات")

    # تحضير البيانات لتحليل الانحدار الخطي
    x = list(range(len(city_posts)))
    y = [post['price'] for post in city_posts]

    # حساب الانحدار الخطي
    slope, intercept = linear_regression(x, y)

    # تحديد الاتجاه
    trend = 'up' if slope > 0 else 'down'

    # حساب الحد الأدنى والحد الأقصى للسعر
    min_price = min(y)
    max_price = max(y)

    return {
        'city': city,
        'slope': slope,
        'intercept': intercept,
        'trend': trend,
        'min_price': min_price,
        'max_price': max_price
    }

def linear_regression(x: list, y: list) -> tuple:
    n = len(x)
    sum_x = sum(x)
    sum_y = sum(y)
    sum_xy = sum(xi * yi for xi, yi in zip(x, y))
    sum_xx = sum(xi * xi for xi in x)

    slope = (n * sum_xy - sum_x * sum_y) / (n * sum_xx - sum_x * sum_x)
    intercept = (sum_y - slope * sum_x) / n

    return slope, intercept

# دالة لمعالجة الطلبات
async def handle_request(request_data: dict) -> dict:
    try:
        city = request_data['city']
        posts = request_data['posts']

        trend_data = await analyze_city_trend(city, posts)

        return {
            'status': 'success',
            'data': trend_data
        }
    except Exception as e:
        return {
            'status': 'error',
            'message': str(e)
        }