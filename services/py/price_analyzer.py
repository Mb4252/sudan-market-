import pandas as pd
from sklearn.linear_model import LinearRegression

class PriceAnalyzer:
    def __init__(self):
        self.model = LinearRegression()

    def train(self, X, y):
        self.model.fit(X, y)

    def predict(self, X):
        return self.model.predict(X)

    def calculate_confidence(self, X, y):
        predictions = self.predict(X)
        errors = abs(predictions - y)
        confidence = 1 - (errors.mean() / y.mean())
        return max(0, min(1, confidence))