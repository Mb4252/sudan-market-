# خدمة Python للميزة الجديدة

def process_data(input_data):
    """معالجة البيانات للميزة الجديدة"""
    # منطق المعالجة
    return {
        "processed": True,
        "data": input_data
    }

if __name__ == "__main__":
    # كود الاختبار
    test_data = {"key": "value"}
    result = process_data(test_data)
    print(result)