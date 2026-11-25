import json
from datetime import datetime

class Worker27:
    def __init__(self, db_connection):
        self.db = db_connection

    def analyze_city_trend(self, city):
        try:
            # جلب المنشورات من قاعدة البيانات
            cursor = self.db.cursor()
            cursor.execute("""
                SELECT price, timestamp
                FROM posts
                WHERE city = %s
                ORDER BY timestamp DESC
                LIMIT 5
            """, (city,))
            posts = cursor.fetchall()

            if len(posts) < 5:
                raise ValueError('عدد المنشورات في المدينة غير كافٍ للتحليل')

            # حساب الاتجاه
            trend = self.calculate_trend(posts)

            return {
                'city': city,
                'trend': 'ارتفاع' if trend['slope'] > 0 else 'هبوط',
                'min_price': min(p[0] for p in posts),
                'max_price': max(p[0] for p in posts),
                'avg_price': sum(p[0] for p in posts) / len(posts)
            }
        except Exception as e:
            print(f'Error analyzing city trend: {e}')
            raise

    def calculate_trend(self, posts):
        # تنزيل البيانات إلى مصفوفات
        x = list(range(len(posts)))  # الفهرس الزمني
        y = [p[0] for p in posts]  # الأسعار

        # حساب الانحدار الخطي
        n = len(x)
        sum_x = sum(x)
        sum_y = sum(y)
        sum_xy = sum(xi * yi for xi, yi in zip(x, y))
        sum_x2 = sum(xi * xi for xi in x)

        slope = (n * sum_xy - sum_x * sum_y) / (n * sum_x2 - sum_x * sum_x)
        intercept = (sum_y - slope * sum_x) / n

        return {'slope': slope, 'intercept': intercept}

# مثال على الاستخدام
if __name__ == '__main__':
    # هذا فقط للاختبار
    import psycopg2
    conn = psycopg2.connect(
        dbname='sudan_market',
        user='user',
        password='password',
        host='localhost'
    )
    worker = Worker27(conn)
    result = worker.analyze_city_trend('الخرطوم')
    print(json.dumps(result, ensure_ascii=False))
    conn.close()