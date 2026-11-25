def process_data(data):
    """معالجة البيانات الواردة"""
    return {
        'message': f"تم معالجة البيانات: {data}"
    }

if __name__ == '__main__':
    # كود الاختبار
    test_data = "بيانات الاختبار"
    result = process_data(test_data)
    print(result)