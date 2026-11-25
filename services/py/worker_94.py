import json

class Worker94:
    def __init__(self):
        self.data = []

    def process_data(self, data):
        # معالجة البيانات
        self.data = data

    def get_processed_data(self):
        return self.data

worker_94 = Worker94()