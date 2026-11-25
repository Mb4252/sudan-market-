import logging
from datetime import datetime

# إعداد التسجيل
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# دالة معالجة الأخطاء
def handle_error(error):
    logger.error(f"Error occurred: {error}")
    # يمكنك هنا إضافة منطق معالجة الأخطاء

# دالة التحقق من صحة التاريخ
def is_valid_date(date_str):
    try:
        datetime.strptime(date_str, '%Y-%m-%dT%H:%M:%S.%fZ')
        return True
    except ValueError:
        return False

# دالة تنظيف البيانات
def sanitize_input(input_str):
    return input_str.replace("<", "&lt;").replace(">", "&gt;").replace("'", "&apos;").replace("\"")

# تصدير الوظائف
__all__ = ['handle_error', 'is_valid_date', 'sanitize_input']