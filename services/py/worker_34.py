import logging

class ErrorHandler:
    @staticmethod
    def handle_error(error):
        logging.error(f"Error occurred: {error}")
        return {"status": "error", "message": str(error)}

worker_34 = ErrorHandler()