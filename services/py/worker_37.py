import json
from datetime import datetime

# دالة لحساب الانحدار الخطي
def calculate_trend(posts):
    x = [datetime.fromisoformat(post['timestamp']).timestamp() for post in posts]
    y = [post['price'] for post in posts]

    n = len(x)
    sum_x = sum(x)
    sum_y = sum(y)
    sum_xy = sum(xi * yi for xi, yi in zip(x, y))
    sum_x2 = sum(xi ** 2 for xi in x)

    slope = (n * sum_xy - sum_x * sum_y) / (n * sum_x2 - sum_x * sum_x)
    intercept = (sum_y - slope * sum_x) / n

    # حساب ثقة الانحدار
    confidence = calculate_confidence(posts, slope)

    trend = 'ارتفاع' if slope > 0 else 'هبوط' if slope < 0 else 'ثبات'

    return {
        'trend': trend,
        'confidence': confidence
    }

# دالة لحساب ثقة الانحدار
def calculate_confidence(posts, slope):
    n = len(posts)
    variance = sum((post['price'] - (slope * datetime.fromisoformat(post['timestamp']).timestamp() + intercept)) ** 2 for post in posts) / n
    std_dev = variance ** 0.5

    confidence = 100 - (std_dev / (sum(post['price'] for post in posts) / n)) * 100

    return max(0, min(100, confidence))

# دالة لمعالجة الطلبات
async def handle_request(request):
    try:
        data = await request.json()
        posts = data.get('posts', [])

        if not posts:
            return {'error': 'لا توجد منشورات'}

        result = calculate_trend(posts)
        return result
    except Exception as e:
        return {'error': str(e)}

# دالة رئيسية
async def main():
    import asyncio
    from aiohttp import web

    app = web.Application()
    app.router.add_post('/analyze-trends', handle_request)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, port=8080)
    await site.start()

    print('Worker 37 is running on port 8080')
    await asyncio.Event().wait()

if __name__ == '__main__':
    asyncio.run(main())