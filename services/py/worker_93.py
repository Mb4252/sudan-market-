# إصلاح: التحقق من صحة البيانات قبل المعالجة
import json
from datetime import datetime

def process_data(data):
    if not data or not isinstance(data, dict):
        raise ValueError('بيانات غير صالحة')

    # منطق المعالجة
    return {
        'processed': True,
        'timestamp': datetime.now().isoformat()
    }

def handle_error(error):
    print(f'Error: {error}')
    return {
        'error': True,
        'message': str(error)
    }

# تصدير الوظائف
__all__ = ['process_data', 'handle_error']