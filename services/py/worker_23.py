import json
from datetime import datetime

# دالة لتحليل الاتجاهات
async def analyze_trends(posts, city):
    # تصفية المنشورات حسب المدينة
    city_posts = [post for post in posts if post['city'] == city]

    if len(city_posts) < 2:
        return {'error': 'لا توجد بيانات كافية لتحليل الاتجاهات في هذه المدينة.'}

    # استخراج التواريخ والأسعار
    data_points = sorted([
        {
            'date': datetime.fromisoformat(post['timestamp']),
            'price': post['price']
        }
        for post in city_posts
    ], key=lambda x: x['date'])

    # حساب الانحدار الخطي
    slope, intercept = calculate_linear_regression(data_points)

    # تحديد اتجاه السعر
    if slope > 0.1:
        trend = 'ارتفاع'
    elif slope < -0.1:
        trend = 'هبوط'
    else:
        trend = 'ثابت'

    # حساب الثقة
    confidence = calculate_confidence(data_points)

    return {
        'trend': trend,
        'confidence': confidence,
        'city': city
    }

# دالة لحساب الانحدار الخطي
def calculate_linear_regression(data_points):
    n = len(data_points)
    sum_x = sum_y = sum_xy = sum_xx = 0

    for point in data_points:
        x = point['date'].timestamp()
        y = point['price']

        sum_x += x
        sum_y += y
        sum_xy += x * y
        sum_xx += x * x

    slope = (n * sum_xy - sum_x * sum_y) / (n * sum_xx - sum_x * sum_x)
    intercept = (sum_y - slope * sum_x) / n

    return slope, intercept

# دالة لحساب الثقة
def calculate_confidence(data_points):
    # حساب المتوسط
    mean = sum(point['price'] for point in data_points) / len(data_points)

    # حساب التباين
    variance = sum((point['price'] - mean) ** 2 for point in data_points) / len(data_points)

    # حساب الثقة
    confidence = min(100, (len(data_points) / 10) * (1 - variance / (mean ** 2)) * 100)

    return max(0, confidence)  # تأكد من أن القيمة بين 0 و 100

# دالة لمعالجة الطلبات
async def handle_request(request):
    if request.method == 'POST':
        data = await request.json()
        posts = data.get('posts', [])
        city = data.get('city', 'الخرطوم')
        result = await analyze_trends(posts, city)
        return {'result': result}
    else:
        return {'error': 'طريقة غير مدعومة'}