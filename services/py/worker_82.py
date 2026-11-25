# FILE: services/py/worker_82.py
import json
from datetime import datetime
from flask import Blueprint, request, jsonify

trends_bp = Blueprint('trends', __name__)

@trends_bp.route('/trends', methods=['GET'])
def get_trends():
    city = request.args.get('city')
    if not city:
        return jsonify({'error': 'مطلوب اسم المدينة'}), 400

    # هنا يجب استبدال هذه البيانات ببيانات حقيقية من قاعدة البيانات
    trends_data = {
        'city': city,
        'trends': [
            {'label': 'يناير', 'value': 100},
            {'label': 'فبراير', 'value': 110},
            {'label': 'مارس', 'value': 120},
            {'label': 'أبريل', 'value': 115},
            {'label': 'مايو', 'value': 130}
        ],
        'timestamp': datetime.utcnow().isoformat()
    }

    return jsonify(trends_data)

@trends_bp.route('/trends', methods=['POST'])
def save_trends():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'لا توجد بيانات'}), 400

    # هنا يجب حفظ البيانات في قاعدة البيانات
    # للاختصار، سنحفظ البيانات في ملف JSON
    with open('trends_data.json', 'a') as f:
        json.dump(data, f)
        f.write('\n')

    return jsonify({'status': 'تم حفظ بيانات الاتجاهات بنجاح'}), 200