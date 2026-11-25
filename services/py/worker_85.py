import json
from datetime import datetime

# دالة لمعالجة البيانات

def process_data(data):
    processed_data = {
        'status': 'processed',
        'data': data,
        'timestamp': datetime.now().isoformat()
    }
    return json.dumps(processed_data)

# دالة لمعالجة الأخطاء

def handle_error(error):
    error_data = {
        'status': 'error',
        'message': str(error),
        'timestamp': datetime.now().isoformat()
    }
    return json.dumps(error_data)