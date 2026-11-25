import json
from typing import List, Dict

async def analyze_prices(posts: List[Dict]) -> Dict:
    """تحليل أسعار المنشورات."""
    try:
        prices = [post['price'] for post in posts if isinstance(post['price'], (int, float))]
        if not prices:
            raise ValueError('لا توجد أسعار صالحة')

        average = sum(prices) / len(prices)
        min_price = min(prices)
        max_price = max(prices)

        return {
            'average': average,
            'min': min_price,
            'max': max_price
        }
    except Exception as e:
        raise ValueError(f'خطأ في تحليل الأسعار: {str(e)}')