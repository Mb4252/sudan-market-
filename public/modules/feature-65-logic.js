(function() {
    'use strict';

    class Feature65Logic {
        constructor() {
            this.analysisData = {
                'price-trend': {
                    labels: [],
                    values: [],
                    trend: '',
                    change: 0
                },
                'market-share': {
                    labels: [],
                    values: [],
                    share: 0,
                    position: ''
                }
            };
        }

        init() {
            this.bindEvents();
        }

        bindEvents() {
            document.addEventListener('feature65:analyze', (e) => {
                const { type } = e.detail;
                this.performAnalysis(type);
            });
        }

        async performAnalysis(type) {
            try {
                let results;

                if (type === 'price-trend') {
                    results = await this.analyzePriceTrend();
                } else if (type === 'market-share') {
                    results = await this.analyzeMarketShare();
                }

                // إرسال النتائج إلى الواجهة
                const event = new CustomEvent('feature65:results', {
                    detail: {
                        type,
                        data: results
                    }
                });
                document.dispatchEvent(event);
            } catch (error) {
                console.error('خطأ في التحليل:', error);
                const event = new CustomEvent('feature65:results', {
                    detail: {
                        error: 'حدث خطأ أثناء التحليل. يرجى المحاولة مرة أخرى.'
                    }
                });
                document.dispatchEvent(event);
            }
        }

        async analyzePriceTrend() {
            // جلب البيانات من الخادم
            const posts = await window.api.fetchPosts();

            // معالجة البيانات
            const prices = posts.map(post => post.price);
            const dates = posts.map(post => new Date(post.timestamp));

            // حساب الانحدار الخطي
            const { slope, intercept } = this.calculateLinearRegression(dates, prices);

            // تحديد اتجاه السعر
            let trend;
            if (slope > 0) {
                trend = 'ارتفاع';
            } else if (slope < 0) {
                trend = 'انخفاض';
            } else {
                trend = 'ثابت';
            }

            // حساب التغير بالنسبة المئوية
            const firstPrice = prices[0];
            const lastPrice = prices[prices.length - 1];
            const change = ((lastPrice - firstPrice) / firstPrice) * 100;

            // تحديث بيانات التحليل
            this.analysisData['price-trend'] = {
                labels: dates.map(date => date.toLocaleDateString()),
                values: prices,
                trend,
                change: change.toFixed(2)
            };

            return this.analysisData['price-trend'];
        }

        async analyzeMarketShare() {
            // جلب البيانات من الخادم
            const posts = await window.api.fetchPosts();

            // معالجة البيانات
            const cityCounts = {};
            posts.forEach(post => {
                if (cityCounts[post.city]) {
                    cityCounts[post.city]++;
                } else {
                    cityCounts[post.city] = 1;
                }
            });

            // تحويل البيانات إلى مصفوفتين
            const labels = Object.keys(cityCounts);
            const values = Object.values(cityCounts);

            // حساب حصة السوق
            const totalPosts = posts.length;
            const share = (values.reduce((a, b) => a + b, 0) / totalPosts) * 100;

            // تحديد مركز السوق
            let position;
            if (share > 50) {
                position = 'سائد';
            } else if (share > 30) {
                position = 'قوي';
            } else if (share > 10) {
                position = 'متوسط';
            } else {
                position = 'ضعيف';
            }

            // تحديث بيانات التحليل
            this.analysisData['market-share'] = {
                labels,
                values,
                share: share.toFixed(2),
                position
            };

            return this.analysisData['market-share'];
        }

        calculateLinearRegression(x, y) {
            const n = x.length;
            let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

            for (let i = 0; i < n; i++) {
                sumX += x[i].getTime();
                sumY += y[i];
                sumXY += x[i].getTime() * y[i];
                sumXX += x[i].getTime() * x[i].getTime();
            }

            const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
            const intercept = (sumY - slope * sumX) / n;

            return { slope, intercept };
        }
    }

    // تهيئة المنطق عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', () => {
        const feature65Logic = new Feature65Logic();
        feature65Logic.init();
    });

    // تصدير المنطق إلى النافذة العالمية
    window.feature65Logic = Feature65Logic;
})();