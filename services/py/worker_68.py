from fastapi import APIRouter
from typing import List, Dict
import json
import os

router = APIRouter()

@router.get('/trends/{city}')
async def analyze_trends(city: str) -> Dict:
    try:
        # قراءة المنشورات من الملف
        posts_path = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'posts.json')
        with open(posts_path, 'r', encoding='utf-8') as f:
            posts = json.load(f)

        city_posts = [post for post in posts if post['city'] == city]

        if len(city_posts) < 2:
            raise ValueError('لا توجد بيانات كافية لتحليل الاتجاهات')

        # تنزيل السعر والوقت
        city_posts.sort(key=lambda x: x['timestamp'])
        prices = [post['price'] for post in city_posts]
        times = [i for i in range(len(city_posts))]

        # حساب الانحدار الخطي
        slope, intercept = linear_regression(times, prices)
        trend = 'increase' if slope > 0 else 'decrease'
        change_percentage = (slope / prices[0]) * 100
        confidence = calculate_confidence(len(city_posts), prices)

        return {
            'city': city,
            'trend': trend,
            'changePercentage': round(change_percentage, 2),
            'confidence': round(confidence, 2)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

def linear_regression(x: List[int], y: List[float]) -> tuple:
    n = len(x)
    sum_x = sum(x)
    sum_y = sum(y)
    sum_xy = sum(xi * yi for xi, yi in zip(x, y))
    sum_x2 = sum(xi ** 2 for xi in x)

    slope = (n * sum_xy - sum_x * sum_y) / (n * sum_x2 - sum_x ** 2)
    intercept = (sum_y - slope * sum_x) / n

    return slope, intercept

def calculate_confidence(data_size: int, prices: List[float]) -> float:
    mean = sum(prices) / len(prices)
    variance = sum((price - mean) ** 2 for price in prices) / len(prices)
    std_dev = variance ** 0.5

    # ثقة أعلى مع حجم بيانات أكبر وتباين أقل
    return min(100, (data_size / 10) * (1 - (std_dev / mean)) * 100)
