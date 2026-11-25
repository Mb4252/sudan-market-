# worker_29.py
import json
import logging
from datetime import datetime

logging.basicConfig(level=logging.INFO)

class Feature29Worker:
    def __init__(self):
        self.error_log = []

    def log_error(self, error_message):
        error_entry = {
            'timestamp': datetime.utcnow().isoformat(),
            'message': error_message
        }
        self.error_log.append(error_entry)
        logging.error(f"Error logged: {error_message}")

    def get_error_log(self):
        return self.error_log

# Example usage
if __name__ == '__main__':
    worker = Feature29Worker()
    worker.log_error("Test error message")
    print(json.dumps(worker.get_error_log(), indent=2))
