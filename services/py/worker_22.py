import requests
import json

class Worker22:
    def __init__(self):
        self.base_url = 'https://sudan-market-2.onrender.com'

    def fetch_data(self):
        try:
            response = requests.get(f"{self.base_url}/feature-22-data")
            if response.status_code != 200:
                raise Exception('خطأ في جلب بيانات الميزة 22')
            return response.json()
        except Exception as e:
            print(f"خطأ في معالجة بيانات الميزة 22: {e}")
            return None

    def process_data(self, data):
        if data:
            print(f"تمت معالجة بيانات الميزة 22: {data}")
        else:
            print("لا توجد بيانات لمعالجتها")

if __name__ == "__main__":
    worker = Worker22()
    data = worker.fetch_data()
    worker.process_data(data)