const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const http = require('http');
const Tesseract = require('tesseract.js');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// سيرفر لإبقاء البوت حياً على Render
http.createServer((req, res) => { 
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('All-in-One Bot is Fully Operational'); 
}).listen(process.env.PORT || 10000);

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// ====================
// 🗄️ نظام التخزين في Telegram (مُحسّن)
// ====================

class TelegramStorage {
    constructor() {
        this.channelId = process.env.STORAGE_CHANNEL_ID || '-100';
        this.adminId = process.env.ADMIN_ID || '';
        this.cache = new Map();
        this.userIndex = new Map(); // فهرسة بيانات المستخدمين
        this.dataLifetime = 30 * 24 * 60 * 60 * 1000; // 30 يوم
    }

    // تخزين البيانات في قناة Telegram
    async storeData(userId, dataType, data) {
        try {
            const timestamp = Date.now();
            const dataId = `${userId}_${dataType}_${timestamp}`;
            
            // تحويل البيانات إلى JSON
            const jsonData = JSON.stringify({
                id: dataId,
                userId: userId.toString(),
                type: dataType,
                timestamp: timestamp,
                data: data
            }, null, 2);

            // تخزين في الرسائل المحفوظة
            const message = await bot.telegram.sendMessage(
                this.channelId,
                `📦 ${dataType.toUpperCase()}_${timestamp}\n\n${jsonData}`
            );

            // تحديث الفهرس
            if (!this.userIndex.has(userId)) {
                this.userIndex.set(userId, []);
            }
            this.userIndex.get(userId).push({
                dataId,
                type: dataType,
                timestamp,
                messageId: message.message_id
            });

            // حفظ في الذاكرة المؤقتة
            this.cache.set(dataId, {
                messageId: message.message_id,
                data: data,
                timestamp: timestamp
            });

            // تنظيف الذاكرة المؤقتة القديمة
            this.cleanupCache();

            return {
                success: true,
                dataId: dataId,
                messageId: message.message_id,
                timestamp: timestamp
            };

        } catch (error) {
            console.error('Error storing data:', error);
            return { success: false, error: error.message };
        }
    }

    // استرجاع البيانات من Telegram
    async retrieveData(userId, dataType, limit = 10, offset = 0) {
        try {
            const userData = this.userIndex.get(userId) || [];
            const filteredData = userData.filter(item => 
                item.type === dataType && 
                (Date.now() - item.timestamp) < this.dataLifetime
            );
            
            // ترتيب تنازلي حسب التاريخ
            filteredData.sort((a, b) => b.timestamp - a.timestamp);
            
            const paginatedData = filteredData.slice(offset, offset + limit);
            const results = [];
            
            for (const item of paginatedData) {
                // محاولة الاسترجاع من الذاكرة المؤقتة أولاً
                if (this.cache.has(item.dataId)) {
                    const cached = this.cache.get(item.dataId);
                    results.push({
                        dataId: item.dataId,
                        messageId: item.messageId,
                        data: cached.data,
                        timestamp: item.timestamp,
                        source: 'cache'
                    });
                } else {
                    // الاسترجاع من الرسالة (محاكاة)
                    results.push({
                        dataId: item.dataId,
                        messageId: item.messageId,
                        data: null,
                        timestamp: item.timestamp,
                        source: 'telegram',
                        note: 'يحتاج استرجاع فعلي من الرسالة'
                    });
                }
            }

            return {
                success: true,
                data: results,
                total: filteredData.length,
                hasMore: filteredData.length > offset + limit
            };

        } catch (error) {
            console.error('Error retrieving data:', error);
            return { success: false, error: error.message };
        }
    }

    // حذف البيانات القديمة
    async cleanupOldData(days = 30) {
        const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
        
        this.cache.forEach((value, key) => {
            if (value.timestamp < cutoffTime) {
                this.cache.delete(key);
            }
        });
        
        // تنظيف الفهرس
        this.userIndex.forEach((items, userId) => {
            const filtered = items.filter(item => item.timestamp >= cutoffTime);
            if (filtered.length === 0) {
                this.userIndex.delete(userId);
            } else {
                this.userIndex.set(userId, filtered);
            }
        });
    }

    // تنظيف الذاكرة المؤقتة
    cleanupCache() {
        const maxCacheSize = 1000; // أقصى عدد للعناصر في الكاش
        if (this.cache.size > maxCacheSize) {
            const entries = Array.from(this.cache.entries());
            entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
            
            // حذف أقدم العناصر
            const toDelete = entries.slice(0, entries.length - maxCacheSize);
            toDelete.forEach(([key]) => this.cache.delete(key));
        }
    }
}

// إنشاء نسخة من نظام التخزين
const storage = new TelegramStorage();

// ====================
// 🧠 نظام الذكاء الاصطناعي المحسن
// ====================

class SmartTextAnalyzer {
    constructor() {
        this.stopWords = new Set(['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'من', 'في', 'على', 'إلى', 'أن', 'هذا', 'هذه', 'ذلك', 'تلك', 'كان', 'يكون']);
        this.conceptPatterns = {
            definition: /(يعرف|تعريف|مفهوم|هو|يشير إلى|يعني)/gi,
            process: /(مراحل|خطوات|مرحلة|خطوة|أولاً|ثانياً|ثالثاً)/gi,
            comparison: /(مقارنة|فرق|اختلاف|تشابه)/gi,
            cause: /(سبب|نتيجة|بسبب|يؤدي إلى|ينتج عن)/gi
        };
    }

    // تحليل النص المتقدم
    async analyzeText(text, userId) {
        const analysis = {
            metadata: {
                length: text.length,
                wordCount: this.countWords(text),
                sentenceCount: this.countSentences(text),
                paragraphCount: this.countParagraphs(text),
                language: this.detectLanguage(text),
                readingTime: this.calculateReadingTime(text)
            },
            content: {
                keywords: this.extractKeywords(text),
                entities: this.extractEntities(text),
                concepts: this.extractConcepts(text),
                topics: this.identifyTopics(text),
                summary: this.generateSummary(text),
                tone: this.analyzeTone(text),
                complexity: this.analyzeComplexity(text)
            },
            structure: {
                hasIntroduction: this.hasIntroduction(text),
                hasConclusion: this.hasConclusion(text),
                sections: this.identifySections(text),
                logicalFlow: this.analyzeLogicalFlow(text)
            },
            educational: {
                difficulty: this.assessDifficulty(text),
                learningObjectives: this.generateLearningObjectives(text),
                assessmentPoints: this.identifyAssessmentPoints(text),
                prerequisites: this.identifyPrerequisites(text)
            },
            timestamp: Date.now()
        };

        // تحسين بناءً على تاريخ المستخدم
        analysis.recommendations = await this.getPersonalizedRecommendations(userId, analysis);
        
        return analysis;
    }

    // استخراج الكلمات المفتاحية المتقدمة
    extractKeywords(text) {
        const words = text.toLowerCase().split(/\W+/);
        const wordFreq = {};
        
        words.forEach(word => {
            if (word.length > 2 && !this.stopWords.has(word)) {
                wordFreq[word] = (wordFreq[word] || 0) + 1;
            }
        });

        // تطبيق TF-IDF مبسط
        const totalWords = words.length;
        const sortedKeywords = Object.entries(wordFreq)
            .sort((a, b) => {
                // حساب أهمية الكلمة
                const scoreA = this.calculateKeywordScore(a[0], a[1], totalWords, text);
                const scoreB = this.calculateKeywordScore(b[0], b[1], totalWords, text);
                return scoreB - scoreA;
            })
            .slice(0, 15)
            .map(([word, freq]) => ({
                word,
                frequency: freq,
                importance: this.calculateKeywordScore(word, freq, totalWords, text),
                type: this.classifyWordType(word)
            }));

        return sortedKeywords;
    }

    // استخراج الكيانات
    extractEntities(text) {
        const entities = {
            people: [],
            places: [],
            organizations: [],
            dates: [],
            numbers: [],
            terms: []
        };

        // اكتشاف الأسماء (نمط محسن للعربية والإنجليزية)
        const namePattern = /\b(?:السيد|الدكتور|الأستاذ|المهندس|Mr\.|Mrs\.|Dr\.|Prof\.)?\s*[أ-يA-Z][أ-يa-z]+\s+[أ-يA-Z][أ-يa-z]+(?:\s+[أ-يA-Z][أ-يa-z]+)?\b/g;
        entities.people = [...new Set(text.match(namePattern) || [])];

        // اكتشاف التواريخ
        const datePattern = /\b\d{1,2}\/\d{1,2}\/\d{4}\b|\b\d{4}-\d{2}-\d{2}\b|\b(?:يناير|فبراير|مارس|إبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر)\s+\d{1,2},?\s+\d{4}\b/gi;
        entities.dates = [...new Set(text.match(datePattern) || [])];

        // اكتشاف المصطلحات المهمة
        const termPattern = /"[^"]+"|'[^']+'|\b(?:مبدأ|نظرية|قانون|نظام|آلية|استراتيجية|تكتيك)\s+[أ-ي]+\b/gi;
        entities.terms = [...new Set(text.match(termPattern) || [])];

        return entities;
    }

    // استخراج المفاهيم
    extractConcepts(text) {
        const concepts = [];
        const sentences = text.split(/[.!?]+/);
        
        sentences.forEach(sentence => {
            Object.entries(this.conceptPatterns).forEach(([type, pattern]) => {
                if (pattern.test(sentence)) {
                    concepts.push({
                        sentence: sentence.trim(),
                        type: type,
                        keywords: this.extractKeywords(sentence).slice(0, 3)
                    });
                }
            });
        });

        return concepts.slice(0, 10);
    }

    // تحديد الموضوعات
    identifyTopics(text) {
        const topics = [];
        const keywords = this.extractKeywords(text);
        
        // تجميع الكلمات المفتاحية المتشابهة
        const topicClusters = this.clusterKeywords(keywords.map(k => k.word));
        
        topicClusters.forEach(cluster => {
            if (cluster.length >= 2) {
                topics.push({
                    name: cluster[0],
                    relatedTerms: cluster.slice(1),
                    importance: this.calculateTopicImportance(cluster, text)
                });
            }
        });

        return topics.sort((a, b) => b.importance - a.importance).slice(0, 5);
    }

    // توليد ملخص ذكي
    generateSummary(text, maxLength = 200) {
        const sentences = text.split(/[.!?]+/);
        const importantSentences = sentences.filter(sentence => {
            const words = sentence.toLowerCase().split(/\W+/);
            const importantWords = words.filter(word => 
                word.length > 4 && !this.stopWords.has(word)
            );
            return importantWords.length >= 3;
        });

        if (importantSentences.length === 0) return text.substring(0, maxLength) + '...';
        
        // اختيار الجمل الأكثر أهمية
        const summary = importantSentences
            .slice(0, 3)
            .map(s => s.trim() + '.')
            .join(' ');

        return summary.length > maxLength ? summary.substring(0, maxLength) + '...' : summary;
    }

    // تحديد مستوى الصعوبة
    assessDifficulty(text) {
        const score = this.calculateComplexityScore(text);
        
        if (score >= 8) return { level: 'خبير', score, description: 'نص معقد يحتوي على مصطلحات متخصصة وتركيب لغوي متقدم' };
        if (score >= 6) return { level: 'متقدم', score, description: 'نص متوسط التعقيد مع بعض المصطلحات المتخصصة' };
        if (score >= 4) return { level: 'متوسط', score, description: 'نص واضح مع مصطلحات أساسية' };
        return { level: 'مبتدئ', score, description: 'نص بسيط وواضح' };
    }

    // توليد أهداف تعليمية
    generateLearningObjectives(text) {
        const objectives = [];
        const keywords = this.extractKeywords(text).slice(0, 5);
        
        keywords.forEach(keyword => {
            objectives.push({
                objective: `فهم مفهوم ${keyword.word}`,
                level: 'معرفة',
                assessment: 'أسئلة تعريفية'
            });
            
            objectives.push({
                objective: `تطبيق مفهوم ${keyword.word} في سياقات مختلفة`,
                level: 'تطبيق',
                assessment: 'أسئلة تطبيقية'
            });
        });

        return objectives.slice(0, 5);
    }

    // الحصول على توصيات مخصصة
    async getPersonalizedRecommendations(userId, analysis) {
        const recommendations = [];
        
        if (analysis.metadata.wordCount > 1000) {
            recommendations.push("النص طويل، يمكن تقسيمه إلى أجزاء للدراسة الفعالة");
        }
        
        if (analysis.content.complexity > 7) {
            recommendations.push("مستوى الصعوبة عالي، ينصح بالتركيز على المصطلحات الأساسية أولاً");
        }
        
        if (analysis.content.keywords.length < 5) {
            recommendations.push("النص يحتوي على مصطلحات محدودة، يمكن إضافة مصادر إضافية للتعمق");
        }

        return recommendations;
    }

    // ====== الدوال المساعدة ======
    
    countWords(text) {
        return text.split(/\s+/).filter(word => word.length > 0).length;
    }

    countSentences(text) {
        return (text.match(/[.!?]+/g) || []).length;
    }

    countParagraphs(text) {
        return text.split(/\n\s*\n/).filter(p => p.trim().length > 0).length;
    }

    detectLanguage(text) {
        const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
        const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
        return arabicChars > englishChars ? 'arabic' : 'english';
    }

    calculateReadingTime(text) {
        const wordsPerMinute = 200;
        const wordCount = this.countWords(text);
        return Math.ceil(wordCount / wordsPerMinute);
    }

    calculateKeywordScore(word, frequency, totalWords, text) {
        const frequencyScore = (frequency / totalWords) * 100;
        const positionScore = this.calculatePositionScore(word, text);
        const lengthScore = Math.min(word.length / 10, 1);
        
        return (frequencyScore * 0.5) + (positionScore * 0.3) + (lengthScore * 0.2);
    }

    calculatePositionScore(word, text) {
        const sentences = text.split(/[.!?]+/);
        let score = 0;
        
        sentences.slice(0, 3).forEach(sentence => {
            if (sentence.toLowerCase().includes(word.toLowerCase())) {
                score += 0.3;
            }
        });
        
        sentences.slice(-2).forEach(sentence => {
            if (sentence.toLowerCase().includes(word.toLowerCase())) {
                score += 0.2;
            }
        });
        
        return Math.min(score, 1);
    }

    classifyWordType(word) {
        if (word.length > 7) return 'مصطلح متخصص';
        if (word.length > 4) return 'مفهوم أساسي';
        return 'كلمة مساعدة';
    }

    clusterKeywords(keywords) {
        const clusters = [];
        
        keywords.forEach(keyword => {
            let added = false;
            
            for (let cluster of clusters) {
                if (this.areKeywordsSimilar(keyword, cluster[0])) {
                    cluster.push(keyword);
                    added = true;
                    break;
                }
            }
            
            if (!added) {
                clusters.push([keyword]);
            }
        });
        
        return clusters;
    }

    areKeywordsSimilar(word1, word2) {
        const minLength = Math.min(word1.length, word2.length);
        const maxLength = Math.max(word1.length, word2.length);
        
        if (maxLength - minLength > 3) return false;
        
        // حساب تشابه بسيط
        let matches = 0;
        for (let i = 0; i < minLength; i++) {
            if (word1[i] === word2[i]) matches++;
        }
        
        return matches / maxLength >= 0.7;
    }

    calculateTopicImportance(cluster, text) {
        let importance = 0;
        cluster.forEach(word => {
            const matches = (text.match(new RegExp(word, 'gi')) || []).length;
            importance += matches * word.length;
        });
        return importance;
    }

    analyzeTone(text) {
        const positiveWords = ['ممتاز', 'جيد', 'رائع', 'إيجابي', 'ناجح'];
        const negativeWords = ['سيء', 'ضعيف', 'مشكلة', 'سلبي', 'فشل'];
        
        let positiveCount = 0;
        let negativeCount = 0;
        
        positiveWords.forEach(word => {
            positiveCount += (text.match(new RegExp(word, 'gi')) || []).length;
        });
        
        negativeWords.forEach(word => {
            negativeCount += (text.match(new RegExp(word, 'gi')) || []).length;
        });
        
        if (positiveCount > negativeCount * 2) return 'إيجابي';
        if (negativeCount > positiveCount * 2) return 'سلبي';
        return 'محايد';
    }

    analyzeComplexity(text) {
        const avgWordLength = text.split(/\s+/).reduce((sum, word) => sum + word.length, 0) / this.countWords(text);
        const avgSentenceLength = this.countWords(text) / this.countSentences(text);
        const uniqueWordRatio = new Set(text.toLowerCase().split(/\W+/)).size / this.countWords(text);
        
        return Math.min(10, (avgWordLength * 0.3) + (avgSentenceLength * 0.4) + (uniqueWordRatio * 100 * 0.3));
    }

    hasIntroduction(text) {
        const firstParagraph = text.split(/\n\s*\n/)[0] || '';
        const introWords = ['مقدمة', 'تمهيد', 'بداية', 'في البداية', 'أولاً'];
        return introWords.some(word => firstParagraph.includes(word));
    }

    hasConclusion(text) {
        const lastParagraph = text.split(/\n\s*\n/).pop() || '';
        const conclusionWords = ['خاتمة', 'ختاماً', 'في النهاية', 'باختصار', 'خلاصة'];
        return conclusionWords.some(word => lastParagraph.includes(word));
    }

    identifySections(text) {
        const sections = [];
        const lines = text.split('\n');
        let currentSection = '';
        
        lines.forEach(line => {
            if (line.match(/^#+\s+/)) {
                if (currentSection) {
                    sections.push(currentSection.trim());
                }
                currentSection = line;
            } else if (currentSection) {
                currentSection += '\n' + line;
            }
        });
        
        if (currentSection) {
            sections.push(currentSection.trim());
        }
        
        return sections;
    }

    analyzeLogicalFlow(text) {
        const transitionWords = ['أولاً', 'ثانياً', 'ثالثاً', 'بعد ذلك', 'من ناحية أخرى', 'علاوة على ذلك'];
        let flowScore = 0;
        
        transitionWords.forEach(word => {
            flowScore += (text.match(new RegExp(word, 'gi')) || []).length;
        });
        
        return flowScore > 3 ? 'جيد' : flowScore > 1 ? 'متوسط' : 'ضعيف';
    }

    calculateComplexityScore(text) {
        const factors = {
            wordLength: Math.min(this.countWords(text) / 100, 2),
            sentenceComplexity: Math.min(this.countWords(text) / this.countSentences(text) / 20, 2),
            keywordDensity: Math.min(this.extractKeywords(text).length / 5, 2),
            specialChars: Math.min((text.match(/[^\w\s]/g) || []).length / 50, 2)
        };
        
        const total = Object.values(factors).reduce((sum, val) => sum + val, 0);
        return Math.min(10, total * 2.5);
    }

    identifyAssessmentPoints(text) {
        const points = [];
        const sentences = text.split(/[.!?]+/);
        
        sentences.forEach((sentence, index) => {
            if (sentence.includes('؟') || sentence.includes('ماذا') || sentence.includes('كيف') || sentence.includes('لماذا')) {
                points.push({
                    sentence: sentence.trim(),
                    type: 'استفهام',
                    position: index
                });
            }
            
            if (sentence.includes(':') || sentence.includes('-')) {
                points.push({
                    sentence: sentence.trim(),
                    type: 'قائمة',
                    position: index
                });
            }
        });
        
        return points.slice(0, 10);
    }

    identifyPrerequisites(text) {
        const prerequisites = [];
        const prerequisiteWords = ['يجب', 'لازم', 'ضروري', 'مطلوب', 'شرط'];
        
        prerequisiteWords.forEach(word => {
            const regex = new RegExp(`${word}[^.!?]*[.!?]`, 'gi');
            const matches = text.match(regex) || [];
            matches.forEach(match => {
                prerequisites.push(match.trim());
            });
        });
        
        return prerequisites.slice(0, 5);
    }
}

// ====================
// 🎯 مولد الامتحانات الذكي
// ====================

class IntelligentExamGenerator {
    constructor() {
        this.analyzer = new SmartTextAnalyzer();
        this.questionTemplates = {
            definition: [
                "ما هو تعريف {term}؟",
                "عرف مفهوم {term}.",
                "ماذا نقصد بـ {term}؟"
            ],
            explanation: [
                "اشرح {concept} بتفصيل.",
                "كيف يعمل {concept}؟",
                "ما هي آلية {concept}؟"
            ],
            comparison: [
                "قارن بين {term1} و {term2}.",
                "ما الفرق بين {term1} و {term2}؟",
                "اذكر أوجه التشابه والاختلاف بين {term1} و {term2}."
            ],
            causeEffect: [
                "ما أسباب {phenomenon}؟",
                "ما نتائج {action}؟",
                "كيف يؤدي {cause} إلى {effect}؟"
            ],
            application: [
                "كيف تطبق {concept} في {context}؟",
                "اذكر مثالاً على {concept}.",
                "ما التطبيقات العملية لـ {concept}؟"
            ],
            analysis: [
                "حلل {situation}.",
                "ما عناصر {system}؟",
                "كيف ترتبط {element1} بـ {element2}؟"
            ],
            evaluation: [
                "قيم {argument}.",
                "ما إيجابيات وسلبيات {option}؟",
                "أيهما أفضل {option1} أم {option2} ولماذا؟"
            ]
        };
    }

    // توليد امتحان ذكي
    async generateExam(text, userId, options = {}) {
        const {
            difficulty = 'medium',
            count = 10,
            types = 'all',
            timeLimit = null
        } = options;

        // تحليل النص
        const analysis = await this.analyzer.analyzeText(text, userId);
        
        // تحديد أنواع الأسئلة بناءً على الصعوبة
        const questionTypes = this.selectQuestionTypes(difficulty, types);
        
        // توليد الأسئلة
        const questions = this.generateQuestions(analysis, questionTypes, count);
        
        // تقييم الأسئلة وترتيبها
        const evaluatedQuestions = questions.map(q => ({
            ...q,
            quality: this.evaluateQuestionQuality(q, analysis),
            estimatedTime: this.estimateQuestionTime(q)
        })).sort((a, b) => b.quality - a.quality);

        // حساب الوقت الكلي المقترح
        const totalTime = evaluatedQuestions.reduce((sum, q) => sum + q.estimatedTime, 0);

        return {
            examId: `${userId}_${Date.now()}`,
            metadata: {
                sourceLength: text.length,
                wordCount: analysis.metadata.wordCount,
                difficulty: difficulty,
                questionCount: evaluatedQuestions.length,
                estimatedTime: totalTime,
                generatedAt: Date.now()
            },
            analysis: analysis,
            questions: evaluatedQuestions.slice(0, count),
            instructions: this.generateInstructions(difficulty, totalTime)
        };
    }

    // توليد الأسئلة
    generateQuestions(analysis, questionTypes, count) {
        const questions = [];
        const usedConcepts = new Set();
        
        questionTypes.forEach(type => {
            const templateCount = Math.ceil(count / questionTypes.length);
            const templates = this.questionTemplates[type] || [];
            
            for (let i = 0; i < templateCount && questions.length < count; i++) {
                const question = this.createQuestion(type, analysis, usedConcepts);
                if (question) {
                    questions.push(question);
                }
            }
        });

        // إذا لم يتم توليد عدد كافٍ من الأسئلة، أضف المزيد من الأنواع المختلفة
        while (questions.length < count) {
            const randomType = questionTypes[Math.floor(Math.random() * questionTypes.length)];
            const question = this.createQuestion(randomType, analysis, usedConcepts);
            if (question) questions.push(question);
        }

        return questions.slice(0, count);
    }

    // إنشاء سؤال فردي
    createQuestion(type, analysis, usedConcepts) {
        const keywords = analysis.content.keywords;
        const entities = analysis.content.entities;
        const concepts = analysis.content.concepts;
        
        if (keywords.length === 0) return null;

        let question = null;
        
        switch(type) {
            case 'definition':
                const term = this.selectUnusedKeyword(keywords, usedConcepts);
                if (term) {
                    question = {
                        type: 'definition',
                        text: this.getRandomTemplate('definition').replace('{term}', term.word),
                        correctAnswer: this.generateDefinition(term.word, analysis),
                        options: this.generateDistractors(term.word, analysis, 'definition'),
                        explanation: `تعريف ${term.word} هو ${this.generateDefinition(term.word, analysis)}`,
                        difficulty: this.calculateQuestionDifficulty(term, analysis),
                        tags: ['تعريف', term.word]
                    };
                    usedConcepts.add(term.word);
                }
                break;
                
            case 'explanation':
                const concept = concepts[Math.floor(Math.random() * concepts.length)];
                if (concept) {
                    question = {
                        type: 'explanation',
                        text: this.getRandomTemplate('explanation').replace('{concept}', concept.sentence.split(' ')[0]),
                        correctAnswer: this.generateExplanation(concept, analysis),
                        options: null, // أسئلة الشرح لا تحتاج خيارات
                        explanation: `شرح ${concept.sentence}`,
                        difficulty: 'medium',
                        tags: ['شرح', concept.type]
                    };
                }
                break;
                
            case 'comparison':
                if (keywords.length >= 2) {
                    const term1 = keywords[Math.floor(Math.random() * keywords.length)];
                    const term2 = keywords[Math.floor(Math.random() * keywords.length)];
                    if (term1 !== term2) {
                        question = {
                            type: 'comparison',
                            text: this.getRandomTemplate('comparison')
                                .replace('{term1}', term1.word)
                                .replace('{term2}', term2.word),
                            correctAnswer: this.generateComparison(term1.word, term2.word, analysis),
                            options: this.generateDistractors(`${term1.word} vs ${term2.word}`, analysis, 'comparison'),
                            explanation: `مقارنة بين ${term1.word} و ${term2.word}`,
                            difficulty: 'hard',
                            tags: ['مقارنة', term1.word, term2.word]
                        };
                    }
                }
                break;
                
            case 'causeEffect':
                const keyword = keywords[Math.floor(Math.random() * keywords.length)];
                question = {
                    type: 'causeEffect',
                    text: this.getRandomTemplate('causeEffect').replace('{phenomenon}', keyword.word),
                    correctAnswer: this.generateCauseEffect(keyword.word, analysis),
                    options: this.generateDistractors(keyword.word, analysis, 'causeEffect'),
                    explanation: `أسباب ونتائج ${keyword.word}`,
                    difficulty: 'medium',
                    tags: ['سبب ونتيجة', keyword.word]
                };
                break;
        }

        return question;
    }

    // توليد إجابة صحيحة للتعريف
    generateDefinition(term, analysis) {
        const definitions = [
            `مصطلح ${term} يشير إلى ${this.getTermDescription(term)}`,
            `يُعرف ${term} بأنه ${this.getTermFunction(term)}`,
            `${term} هو ${this.getTermContext(term, analysis)}`
        ];
        return definitions[Math.floor(Math.random() * definitions.length)];
    }

    // توليد مشتتات ذكية
    generateDistractors(correctAnswer, analysis, type) {
        const distractors = [];
        const keywords = analysis.content.keywords.map(k => k.word);
        
        // مشتت 1: إجابة عكسية
        distractors.push(this.generateOppositeAnswer(correctAnswer, type));
        
        // مشتت 2: إجابة لمصطلح مشابه
        const similarTerm = this.findSimilarTerm(correctAnswer, keywords);
        if (similarTerm) {
            distractors.push(this.generateDefinition(similarTerm, analysis));
        }
        
        // مشتت 3: إجابة عامة جداً
        distractors.push(this.generateVagueAnswer(correctAnswer, type));
        
        // مشتت 4: إجابة صحيحة لكن لمصطلح آخر
        if (keywords.length > 3) {
            const otherTerm = keywords.filter(k => k !== correctAnswer && k !== similarTerm)[0];
            if (otherTerm) {
                distractors.push(this.generateDefinition(otherTerm, analysis));
            }
        }
        
        // خلط المشتتات
        return this.shuffleArray(distractors).slice(0, 3);
    }

    // توليد شرح
    generateExplanation(concept, analysis) {
        return `شرح ${concept.sentence} يتضمن ${concept.keywords.map(k => k.word).join('، ')}.`;
    }

    // توليد مقارنة
    generateComparison(term1, term2, analysis) {
        return `${term1} و ${term2} يختلفان في ${this.getRandomAspect()} ويتشابهان في ${this.getRandomAspect()}.`;
    }

    // توليد سبب ونتيجة
    generateCauseEffect(term, analysis) {
        return `من أسباب ${term}: ${this.getRandomCause()}. ومن نتائجه: ${this.getRandomEffect()}.`;
    }

    // ====== الدوال المساعدة ======
    
    selectQuestionTypes(difficulty, requestedTypes) {
        const typeMap = {
            easy: ['definition'],
            medium: ['definition', 'explanation', 'causeEffect'],
            hard: ['definition', 'explanation', 'comparison', 'application'],
            expert: ['comparison', 'analysis', 'evaluation', 'application']
        };
        
        let types = typeMap[difficulty] || typeMap.medium;
        
        if (requestedTypes !== 'all') {
            if (Array.isArray(requestedTypes)) {
                types = types.filter(type => requestedTypes.includes(type));
            } else if (typeof requestedTypes === 'string') {
                types = types.filter(type => type === requestedTypes);
            }
        }
        
        return types.length > 0 ? types : typeMap.medium;
    }

    selectUnusedKeyword(keywords, usedConcepts) {
        const available = keywords.filter(k => !usedConcepts.has(k.word));
        return available.length > 0 ? available[0] : keywords[0];
    }

    getRandomTemplate(type) {
        const templates = this.questionTemplates[type];
        return templates[Math.floor(Math.random() * templates.length)];
    }

    calculateQuestionDifficulty(term, analysis) {
        const importance = term.importance || 5;
        if (importance > 8) return 'hard';
        if (importance > 5) return 'medium';
        return 'easy';
    }

    evaluateQuestionQuality(question, analysis) {
        let score = 5;
        
        // تقييم الوضوح
        if (question.text.length > 10 && question.text.length < 150) score += 2;
        
        // تقييم الصلة بالنص
        if (this.isQuestionRelevant(question, analysis)) score += 3;
        
        // تقييم الخيارات (إن وجدت)
        if (question.options) {
            const uniqueOptions = new Set(question.options.map(o => o.substring(0, 30)));
            if (uniqueOptions.size === question.options.length) score += 2;
        }
        
        // تقييم مستوى التفكير
        if (question.type === 'analysis' || question.type === 'evaluation') score += 1;
        
        return Math.min(10, score);
    }

    estimateQuestionTime(question) {
        const baseTimes = {
            definition: 45,
            explanation: 90,
            comparison: 120,
            causeEffect: 75,
            application: 100,
            analysis: 150,
            evaluation: 180
        };
        
        return baseTimes[question.type] || 60;
    }

    generateInstructions(difficulty, totalTime) {
        const timeStr = Math.ceil(totalTime / 60);
        
        return {
            general: `امتحان ${difficulty} - الوقت المقترح: ${timeStr} دقيقة`,
            tips: [
                "اقرأ كل سؤال بعناية قبل الإجابة",
                "راجع إجاباتك قبل الانتهاء",
                "استخدم الوقت بحكمة",
                "إذا لم تعرف الإجابة، انتقل للسؤال التالي ثم عد لاحقاً"
            ],
            grading: "سيتم احتساب النسبة المئوية بناءً على الإجابات الصحيحة"
        };
    }

    isQuestionRelevant(question, analysis) {
        const questionText = question.text.toLowerCase();
        const keywords = analysis.content.keywords.map(k => k.word.toLowerCase());
        
        return keywords.some(keyword => questionText.includes(keyword));
    }

    getTermDescription(term) {
        const descriptions = [
            "مفهوم أساسي في هذا المجال",
            "أحد العناصر الرئيسية المذكورة",
            "عملية أو آلية مهمة",
            "نظرية أو مبدأ أساسي"
        ];
        return descriptions[Math.floor(Math.random() * descriptions.length)];
    }

    getTermFunction(term) {
        const functions = [
            "تحقيق الهدف المطلوب",
            "تنفيذ عملية معينة",
            "تحسين الأداء",
            "زيادة الفعالية"
        ];
        return functions[Math.floor(Math.random() * functions.length)];
    }

    getTermContext(term, analysis) {
        const topics = analysis.content.topics.map(t => t.name);
        if (topics.length > 0) {
            return `أحد مفاهيم ${topics[0]}`;
        }
        return "أحد المفاهيم المذكورة في النص";
    }

    generateOppositeAnswer(term, type) {
        const opposites = {
            definition: `تعريف خاطئ لـ ${term}`,
            comparison: `لا يوجد فرق بينهما`,
            causeEffect: `لا توجد علاقة سببية`
        };
        return opposites[type] || `إجابة غير صحيحة`;
    }

    findSimilarTerm(term, keywords) {
        return keywords.find(k => 
            k !== term && 
            k.length >= term.length - 2 && 
            k.length <= term.length + 2 &&
            k[0] === term[0]
        );
    }

    generateVagueAnswer(term, type) {
        const vague = {
            definition: "مصطلح مهم",
            comparison: "كلاهما مهم",
            causeEffect: "هناك عدة عوامل"
        };
        return vague[type] || "إجابة عامة";
    }

    getRandomAspect() {
        const aspects = ["الوظيفة", "الهدف", "المكونات", "النتائج", "التكلفة", "الفعالية"];
        return aspects[Math.floor(Math.random() * aspects.length)];
    }

    getRandomCause() {
        const causes = ["عوامل متعددة", "ظروف معينة", "قرارات سابقة", "تغيرات في البيئة"];
        return causes[Math.floor(Math.random() * causes.length)];
    }

    getRandomEffect() {
        const effects = ["تحسين الأداء", "زيادة الكفاءة", "تغيير النتائج", "تحقيق الأهداف"];
        return effects[Math.floor(Math.random() * effects.length)];
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
}

// ====================
// 🤖 نظام إدارة المستخدمين
// ====================

class UserSessionManager {
    constructor() {
        this.sessions = new Map();
        this.statistics = new Map();
    }

    getOrCreateSession(userId) {
        if (!this.sessions.has(userId)) {
            this.sessions.set(userId, {
                userId,
                currentExam: null,
                preferences: {
                    difficulty: 'medium',
                    questionCount: 10,
                    timeLimit: null,
                    showHints: true,
                    language: 'ar',
                    questionTypes: 'all',
                    autoSave: true
                },
                stats: {
                    totalExams: 0,
                    averageScore: 0,
                    totalQuestions: 0,
                    correctAnswers: 0,
                    totalTime: 0,
                    strengths: [],
                    weaknesses: [],
                    lastActive: Date.now(),
                    streak: 0,
                    level: 1,
                    xp: 0
                },
                history: {
                    recentExams: [],
                    recentTopics: [],
                    performanceTrend: []
                },
                cache: {
                    recentTexts: [],
                    recentAnalyses: [],
                    pendingActions: []
                }
            });
        }
        
        return this.sessions.get(userId);
    }

    updateStats(userId, examResult) {
        const session = this.getOrCreateSession(userId);
        const stats = session.stats;
        
        // تحديث الإحصائيات الأساسية
        stats.totalExams++;
        stats.totalQuestions += examResult.totalQuestions;
        stats.correctAnswers += examResult.correctAnswers;
        stats.totalTime += examResult.timeSpent;
        
        // تحديث المتوسط
        stats.averageScore = (
            (stats.averageScore * (stats.totalExams - 1)) + examResult.score
        ) / stats.totalExams;
        
        // تحديث التتابع (streak)
        if (examResult.score >= 70) {
            stats.streak++;
            stats.xp += Math.floor(examResult.score / 10) * stats.streak;
        } else {
            stats.streak = 0;
        }
        
        // تحديث المستوى
        stats.level = Math.floor(stats.xp / 100) + 1;
        
        // تحديث نقاط القوة والضعف
        this.updateStrengthsWeaknesses(session, examResult);
        
        // تحديث تاريخ النشاط
        stats.lastActive = Date.now();
        
        // تحديث التوجه
        session.history.performanceTrend.push({
            date: Date.now(),
            score: examResult.score,
            type: examResult.examType || 'smart'
        });
        
        // حفظ التوجه (أخر 10 نتائج)
        if (session.history.performanceTrend.length > 10) {
            session.history.performanceTrend.shift();
        }
        
        return stats;
    }

    updateStrengthsWeaknesses(session, examResult) {
        const stats = session.stats;
        
        // تحليل الأداء حسب نوع السؤال
        if (examResult.performance && examResult.performance.byQuestionType) {
            Object.entries(examResult.performance.byQuestionType).forEach(([type, data]) => {
                const accuracy = data.total > 0 ? (data.correct / data.total) * 100 : 0;
                
                if (accuracy >= 80) {
                    // قوة
                    if (!stats.strengths.includes(type)) {
                        stats.strengths.push(type);
                    }
                    // إزالة من نقاط الضعف إذا كانت موجودة
                    const weaknessIndex = stats.weaknesses.indexOf(type);
                    if (weaknessIndex > -1) {
                        stats.weaknesses.splice(weaknessIndex, 1);
                    }
                } else if (accuracy <= 50) {
                    // ضعف
                    if (!stats.weaknesses.includes(type)) {
                        stats.weaknesses.push(type);
                    }
                }
            });
        }
        
        // الحفاظ على أقصى عدد من العناصر
        stats.strengths = stats.strengths.slice(0, 5);
        stats.weaknesses = stats.weaknesses.slice(0, 5);
    }

    getRecommendations(userId) {
        const session = this.getOrCreateSession(userId);
        const stats = session.stats;
        const recommendations = [];
        
        // توصيات بناءً على نقاط الضعف
        if (stats.weaknesses.length > 0) {
            recommendations.push({
                type: 'improvement',
                message: `ركز على تحسين مهاراتك في: ${stats.weaknesses.join('، ')}`,
                priority: 'high'
            });
        }
        
        // توصيات بناءً على التقدم
        if (stats.streak >= 3) {
            recommendations.push({
                type: 'encouragement',
                message: `أحسنت! لديك ${stats.streak} امتحانات ناجحة متتالية`,
                priority: 'medium'
            });
        }
        
        if (stats.averageScore < 60) {
            recommendations.push({
                type: 'suggestion',
                message: 'جرب امتحانات بمستوى صعوبة أقل لبناء الثقة',
                priority: 'high'
            });
        }
        
        if (stats.totalExams < 3) {
            recommendations.push({
                type: 'guidance',
                message: 'استمر في حل المزيد من الامتحانات لرؤية تحليل أداء دقيق',
                priority: 'medium'
            });
        }
        
        // توصية لزيادة المستوى
        const xpNeeded = stats.level * 100 - stats.xp;
        if (xpNeeded <= 50) {
            recommendations.push({
                type: 'level',
                message: `أنت على بعد ${xpNeeded} نقطة من المستوى ${stats.level + 1}`,
                priority: 'low'
            });
        }
        
        return recommendations.sort((a, b) => {
            const priorityOrder = { high: 0, medium: 1, low: 2 };
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        });
    }

    getProgressReport(userId) {
        const session = this.getOrCreateSession(userId);
        const stats = session.stats;
        
        const progress = {
            level: stats.level,
            xp: stats.xp,
            xpToNextLevel: stats.level * 100 - stats.xp,
            progressPercentage: Math.min(100, (stats.xp % 100)),
            streak: stats.streak,
            totalExams: stats.totalExams,
            averageScore: Math.round(stats.averageScore * 10) / 10,
            accuracy: stats.totalQuestions > 0 ? 
                Math.round((stats.correctAnswers / stats.totalQuestions) * 1000) / 10 : 0,
            totalTime: this.formatTime(stats.totalTime),
            strengths: stats.strengths,
            weaknesses: stats.weaknesses,
            recommendations: this.getRecommendations(userId)
        };
        
        return progress;
    }

    formatTime(ms) {
        const minutes = Math.floor(ms / 60000);
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        
        if (hours > 0) {
            return `${hours} ساعة و ${remainingMinutes} دقيقة`;
        }
        return `${minutes} دقيقة`;
    }

    cleanupInactiveSessions(maxAge = 24 * 60 * 60 * 1000) {
        const cutoffTime = Date.now() - maxAge;
        
        this.sessions.forEach((session, userId) => {
            if (session.stats.lastActive < cutoffTime) {
                // حفظ الإحصائيات النهائية قبل الحذف
                this.saveSessionStatistics(userId, session);
                this.sessions.delete(userId);
            }
        });
    }

    saveSessionStatistics(userId, session) {
        // يمكن حفظ الإحصائيات في قاعدة بيانات أو نظام تخزين
        console.log(`Saving statistics for user ${userId}:`, session.stats);
    }
}

// ====================
// 🤖 البوت الرئيسي
// ====================

const textAnalyzer = new SmartTextAnalyzer();
const examGenerator = new IntelligentExamGenerator();
const userManager = new UserSessionManager();

// جلسات الامتحانات النشطة
const activeExams = new Map();

class ActiveExam {
    constructor(userId, examData) {
        this.userId = userId;
        this.examId = examData.examId;
        this.questions = examData.questions;
        this.metadata = examData.metadata;
        this.startTime = Date.now();
        this.userAnswers = [];
        this.currentQuestion = 0;
        this.status = 'active';
        this.score = null;
        this.timeSpent = 0;
    }

    submitAnswer(answer, questionIndex = null) {
        const qIndex = questionIndex !== null ? questionIndex : this.currentQuestion;
        
        if (qIndex >= this.questions.length) {
            throw new Error('Question index out of bounds');
        }
        
        const question = this.questions[qIndex];
        const isCorrect = this.checkAnswer(question, answer);
        
        this.userAnswers[qIndex] = {
            question: question.text,
            userAnswer: answer,
            isCorrect,
            timeSpent: Date.now() - this.startTime,
            timestamp: Date.now()
        };
        
        if (questionIndex === null) {
            this.currentQuestion++;
        }
        
        return {
            isCorrect,
            correctAnswer: question.correctAnswer,
            explanation: question.explanation,
            nextQuestion: this.currentQuestion < this.questions.length ? 
                this.questions[this.currentQuestion] : null
        };
    }

    checkAnswer(question, userAnswer) {
        if (question.type === 'mcq' || question.type === 'definition' || 
            question.type === 'comparison' || question.type === 'causeEffect') {
            
            if (question.options) {
                // اختيار من متعدد
                const correctOption = question.correctAnswer;
                return userAnswer === correctOption;
            } else {
                // إجابة نصية - تحقق من التشابه
                return this.checkTextSimilarity(userAnswer, question.correctAnswer);
            }
        }
        
        // للأسئلة النصية الأخرى
        return this.checkTextSimilarity(userAnswer, question.correctAnswer);
    }

    checkTextSimilarity(answer1, answer2) {
        const normalize = (str) => {
            return str.toLowerCase()
                .replace(/[^\w\u0600-\u06FF\s]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
        };
        
        const norm1 = normalize(answer1);
        const norm2 = normalize(answer2);
        
        if (norm1 === norm2) return true;
        
        // تحقق من احتواء إحدى الإجابات للأخرى
        if (norm1.includes(norm2) || norm2.includes(norm1)) {
            return norm1.length > 0 && norm2.length > 0;
        }
        
        // حساب تشابه بسيط
        const words1 = norm1.split(' ');
        const words2 = norm2.split(' ');
        const commonWords = words1.filter(word => words2.includes(word));
        
        return commonWords.length >= Math.min(words1.length, words2.length) / 2;
    }

    finish() {
        this.status = 'completed';
        this.timeSpent = Date.now() - this.startTime;
        this.score = this.calculateScore();
        
        return this.generateResult();
    }

    calculateScore() {
        const correctCount = this.userAnswers.filter(a => a && a.isCorrect).length;
        return Math.round((correctCount / this.questions.length) * 100);
    }

    generateResult() {
        const result = {
            examId: this.examId,
            score: this.score,
            totalQuestions: this.questions.length,
            correctAnswers: this.userAnswers.filter(a => a && a.isCorrect).length,
            timeSpent: this.timeSpent,
            performance: this.analyzePerformance(),
            details: this.userAnswers,
            timestamp: Date.now(),
            metadata: this.metadata
        };
        
        return result;
    }

    analyzePerformance() {
        const performance = {
            byQuestionType: {},
            byDifficulty: {},
            timeAnalysis: {},
            recommendations: []
        };
        
        // تحليل حسب نوع السؤال
        this.questions.forEach((q, index) => {
            const answer = this.userAnswers[index];
            if (!answer) return;
            
            const type = q.type;
            if (!performance.byQuestionType[type]) {
                performance.byQuestionType[type] = { total: 0, correct: 0 };
            }
            performance.byQuestionType[type].total++;
            if (answer.isCorrect) performance.byQuestionType[type].correct++;
            
            // حسب الصعوبة
            const difficulty = q.difficulty || 'medium';
            if (!performance.byDifficulty[difficulty]) {
                performance.byDifficulty[difficulty] = { total: 0, correct: 0 };
            }
            performance.byDifficulty[difficulty].total++;
            if (answer.isCorrect) performance.byDifficulty[difficulty].correct++;
        });
        
        // تحليل الوقت
        const times = this.userAnswers.map(a => a ? a.timeSpent : 0);
        performance.timeAnalysis = {
            average: times.reduce((a, b) => a + b, 0) / times.length,
            min: Math.min(...times),
            max: Math.max(...times),
            total: this.timeSpent
        };
        
        // توليد توصيات
        performance.recommendations = this.generateRecommendations(performance);
        
        return performance;
    }

    generateRecommendations(performance) {
        const recommendations = [];
        
        // تحليل نقاط الضعف
        Object.entries(performance.byQuestionType).forEach(([type, data]) => {
            const accuracy = (data.correct / data.total) * 100;
            if (accuracy < 60) {
                recommendations.push(`تحتاج تحسين في أسئلة النوع: ${type} (دقة: ${accuracy.toFixed(1)}%)`);
            }
        });
        
        // تحليل الوقت
        const avgTime = performance.timeAnalysis.average;
        if (avgTime > 120000) { // أكثر من دقيقتين للسؤال
            recommendations.push('تحتاج إلى تحسين سرعة الإجابة');
        }
        
        // تحليل الصعوبة
        Object.entries(performance.byDifficulty).forEach(([difficulty, data]) => {
            const accuracy = (data.correct / data.total) * 100;
            if (difficulty === 'hard' && accuracy < 40) {
                recommendations.push('جرب مستوى صعوبة أقل لبناء الأساسيات');
            }
        });
        
        return recommendations.slice(0, 3);
    }
}

// ====================
// 🎯 معالجات الأوامر
// ====================

// القائمة الرئيسية
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const user = userManager.getOrCreateSession(userId);
    
    const welcomeMessage = `🎓 *مرحباً ${ctx.from.first_name}!* 🤖

*البوت الذكي للامتحانات والتعلم الذاتي*

✨ *المميزات المتاحة:*
• 🧠 تحليل نصوص ذكي متقدم
• 📝 توليد امتحانات مخصصة
• 📊 تحليل أداء مفصل
• 💾 تخزين نتائجك
• 📈 تتبع تقدمك التعليمي

🎯 *اختر المهمة التي تريدها:*`;

    await ctx.reply(welcomeMessage, 
        Markup.inlineKeyboard([
            [Markup.button.callback('🧠 امتحان ذكي', 'smart_exam')],
            [Markup.button.callback('📸 تحليل صورة', 'analyze_image')],
            [Markup.button.callback('📊 نتائجي', 'my_results'), Markup.button.callback('📈 إحصائياتي', 'my_stats')],
            [Markup.button.callback('⚙️ الإعدادات', 'settings'), Markup.button.callback('❓ المساعدة', 'help')]
        ])
    );
});

// معالجة الامتحان الذكي
bot.action('smart_exam', async (ctx) => {
    await ctx.answerCbQuery();
    
    const userId = ctx.from.id;
    const user = userManager.getOrCreateSession(userId);
    
    const examOptions = `
🧠 *الامتحان الذكي*

أرسل لي:
• 📝 نصاً دراسياً
• 📸 صورة تحتوي على نص
• 📄 ملف نصي

⚙️ *الإعدادات الحالية:*
• 📊 الصعوبة: ${user.preferences.difficulty}
• 🔢 عدد الأسئلة: ${user.preferences.questionCount}
• 🌐 اللغة: ${user.preferences.language === 'ar' ? 'العربية' : 'الإنجليزية'}

💡 *نصائح:*
• النص الأفضل يحتوي على 200-5000 كلمة
• يمكنك إرسال فصول كاملة من الكتب
• الصور يجب أن تكون واضحة وذات إضاءة جيدة
`;

    await ctx.reply(examOptions);
});

// معالجة النصوص
bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim();
    const userId = ctx.from.id;
    
    // الأوامر الخاصة
    const commands = {
        'تصحيح': finishExam,
        'توقف': cancelExam,
        'مساعدة': showHelp,
        'نتائجي': showResults,
        'إحصائياتي': showStats,
        'الإعدادات': showSettings,
        'تقدمي': showProgress
    };
    
    if (commands[text]) {
        return await commands[text](ctx, userId);
    }
    
    // إذا كان النص قصيراً
    if (text.length < 50) {
        return ctx.reply('📝 النص قصير جداً. أرسل نصاً أطول (أكثر من 50 حرفاً) لإنشاء امتحان ذكي منه.');
    }
    
    // بدء عملية إنشاء الامتحان
    await startExamCreation(ctx, userId, text);
});

// معالجة الصور (OCR)
bot.on('photo', async (ctx) => {
    const userId = ctx.from.id;
    const waitMsg = await ctx.reply('🔍 جاري تحليل الصورة واستخراج النص...');
    
    try {
        const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        const fileLink = await ctx.telegram.getFileLink(fileId);
        
        // استخدام Tesseract للتعرف على النص
        const { data: { text } } = await Tesseract.recognize(
            fileLink.href,
            'ara+eng',
            {
                logger: m => console.log(m),
                tessedit_pageseg_mode: '6',
                preserve_interword_spaces: '1',
                user_defined_dpi: '300',
                tessedit_char_whitelist: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZاأبتثجحخدذرزسشصضطظعغفقكلمنهويىءآأؤإئ.,;:!?()[]{}"\''
            }
        );
        
        await ctx.deleteMessage(waitMsg.message_id);
        
        if (!text || text.trim().length < 30) {
            return ctx.reply('❌ لم أستطع استخراج نص كافٍ من الصورة.\nتأكد من:\n• وضوح النص\n• إضاءة كافية\n• اتجاه الكتابة الصحيح');
        }
        
        // تنظيف النص
        const cleanedText = cleanExtractedText(text);
        
        await ctx.reply(`✅ تم استخراج ${cleanedText.length} حرفاً.\n💡 النص المستخرج:\n\n${cleanedText.substring(0, 300)}...`);
        
        // بدء إنشاء الامتحان
        await startExamCreation(ctx, userId, cleanedText, true);
        
    } catch (error) {
        await ctx.deleteMessage(waitMsg.message_id);
        console.error('OCR Error:', error);
        await ctx.reply('❌ حدث خطأ في تحليل الصورة. حاول مرة أخرى أو أرسل النص مباشرة.');
    }
});

// معالجة المستندات
bot.on('document', async (ctx) => {
    const document = ctx.message.document;
    const mimeType = document.mime_type;
    const fileName = document.file_name || '';
    
    // دعم الملفات النصية
    if (mimeType === 'text/plain' || fileName.endsWith('.txt')) {
        const waitMsg = await ctx.reply('📄 جاري قراءة الملف...');
        
        try {
            const fileLink = await ctx.telegram.getFileLink(document.file_id);
            const response = await axios.get(fileLink.href, { responseType: 'text' });
            const text = response.data;
            
            await ctx.deleteMessage(waitMsg.message_id);
            
            if (text.length < 100) {
                return ctx.reply('❌ الملف النصي قصير جداً. أرسل ملفاً يحتوي على نص أكثر.');
            }
            
            await ctx.reply(`✅ تم قراءة ${text.length} حرفاً من الملف.`);
            await startExamCreation(ctx, ctx.from.id, text, false, 'ملف نصي');
            
        } catch (error) {
            await ctx.deleteMessage(waitMsg.message_id);
            await ctx.reply('❌ حدث خطأ في قراءة الملف النصي.');
        }
    } else {
        await ctx.reply('⚠️ أدعم فقط الملفات النصية (.txt) حالياً.');
    }
});

// ====================
// 🛠️ الوظائف المساعدة
// ====================

async function startExamCreation(ctx, userId, text, fromImage = false, sourceType = 'نص') {
    const waitMsg = await ctx.reply('🧠 جاري تحليل النص وإنشاء امتحان مخصص...\n⏳ قد يستغرق بضع لحظات');
    
    try {
        const user = userManager.getOrCreateSession(userId);
        
        // تحليل النص
        const analysis = await textAnalyzer.analyzeText(text, userId);
        
        // حفظ التحليل
        await storage.storeData(userId, 'text_analysis', {
            textPreview: text.substring(0, 200) + '...',
            analysis: analysis,
            source: sourceType,
            timestamp: Date.now()
        });
        
        // توليد الامتحان
        const examData = await examGenerator.generateExam(text, userId, {
            difficulty: user.preferences.difficulty,
            count: user.preferences.questionCount,
            types: user.preferences.questionTypes
        });
        
        await ctx.deleteMessage(waitMsg.message_id);
        
        // عرض ملخص التحليل
        await showAnalysisSummary(ctx, analysis);
        
        // إنشاء امتحان نشط
        const activeExam = new ActiveExam(userId, examData);
        activeExams.set(`${userId}_${activeExam.examId}`, activeExam);
        
        // بدء الامتحان
        await startExam(ctx, userId, activeExam);
        
    } catch (error) {
        await ctx.deleteMessage(waitMsg.message_id);
        console.error('Exam creation error:', error);
        await ctx.reply('❌ حدث خطأ في إنشاء الامتحان. حاول مرة أخرى.');
    }
}

async function showAnalysisSummary(ctx, analysis) {
    const summary = `
📊 *ملخص التحليل الذكي*

📝 *المعلومات الأساسية:*
• عدد الكلمات: ${analysis.metadata.wordCount}
• عدد الجمل: ${analysis.metadata.sentenceCount}
• وقت القراءة: ${analysis.metadata.readingTime} دقيقة
• اللغة: ${analysis.metadata.language === 'arabic' ? 'العربية' : 'الإنجليزية'}

🔑 *الكلمات المفتاحية الرئيسية:*
${analysis.content.keywords.slice(0, 5).map((kw, i) => `${i+1}. ${kw.word} (${kw.importance.toFixed(1)}/10)`).join('\n')}

📚 *الموضوعات الرئيسية:*
${analysis.content.topics.slice(0, 3).map((t, i) => `${i+1}. ${t.name}`).join('\n')}

🎯 *مستوى الصعوبة:*
• ${analysis.educational.difficulty.level}
• ${analysis.educational.difficulty.description}

💡 *نصيحة:*
${analysis.recommendations && analysis.recommendations.length > 0 ? analysis.recommendations[0] : 'استعد للامتحان!'}
`;
    
    await ctx.reply(summary);
}

async function startExam(ctx, userId, activeExam) {
    const exam = activeExam;
    
    // إرسال تعليمات البدء
    await ctx.reply(`
🎯 *بدء الامتحان*

${exam.metadata.instructions.general}

${exam.metadata.instructions.tips.map(tip => `• ${tip}`).join('\n')}

السؤال 1 من ${exam.questions.length}
    `);
    
    // إرسال السؤال الأول
    await sendQuestion(ctx, exam, 0);
}

async function sendQuestion(ctx, exam, questionIndex) {
    const question = exam.questions[questionIndex];
    const questionNumber = questionIndex + 1;
    
    let message = `*السؤال ${questionNumber}:* ${question.text}\n\n`;
    
    if (question.options && question.options.length > 0) {
        question.options.forEach((option, index) => {
            const letter = String.fromCharCode(65 + index);
            message += `${letter}) ${option}\n`;
        });
        
        // إضافة أزرار الاختيار
        const buttons = question.options.map((option, index) => {
            const letter = String.fromCharCode(65 + index);
            return [Markup.button.callback(`اختر ${letter}`, `answer_${exam.examId}_${questionIndex}_${index}`)];
        });
        
        await ctx.reply(message, Markup.inlineKeyboard(buttons));
    } else {
        message += "✍️ *أرسل إجابتك في رسالة نصية*";
        await ctx.reply(message);
    }
}

// معالجة إجابات الاختيار من متعدد
bot.action(/answer_(.+)_(\d+)_(\d+)/, async (ctx) => {
    const [, examId, questionIndexStr, answerIndexStr] = ctx.match;
    const questionIndex = parseInt(questionIndexStr);
    const answerIndex = parseInt(answerIndexStr);
    const userId = ctx.from.id;
    const examKey = `${userId}_${examId}`;
    
    if (!activeExams.has(examKey)) {
        return ctx.answerCbQuery('❌ هذا الامتحان لم يعد نشطاً.', { show_alert: true });
    }
    
    const exam = activeExams.get(examKey);
    const question = exam.questions[questionIndex];
    
    if (!question.options) {
        return ctx.answerCbQuery('❌ هذا السؤال ليس من نوع الاختيار من متعدد.', { show_alert: true });
    }
    
    const answerText = question.options[answerIndex];
    const result = exam.submitAnswer(answerText, questionIndex);
    
    let response;
    if (result.isCorrect) {
        response = `✅ ${getRandomPraise()}`;
    } else {
        response = `❌ إجابة غير صحيحة.\n`;
        if (question.explanation) {
            response += `\n💡 ${question.explanation}`;
        }
    }
    
    await ctx.answerCbQuery(response, { show_alert: true });
    
    // التحقق إذا كان هناك المزيد من الأسئلة
    if (result.nextQuestion) {
        await sendQuestion(ctx, exam, exam.currentQuestion);
    } else {
        // انتهاء الامتحان
        await finishExamAutomatically(ctx, userId, exam);
    }
});

// معالجة الإجابات النصية
bot.on('message', async (ctx) => {
    if (!ctx.message.text) return;
    
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();
    
    // تجنب معالجة الأوامر مرة أخرى
    if (['تصحيح', 'توقف', 'مساعدة', 'نتائجي', 'إحصائياتي', 'الإعدادات', 'تقدمي'].includes(text)) {
        return;
    }
    
    // البحث عن امتحان نشط للمستخدم
    let activeExam = null;
    let examKey = null;
    
    for (const [key, exam] of activeExams.entries()) {
        if (key.startsWith(userId.toString()) && exam.status === 'active') {
            activeExam = exam;
            examKey = key;
            break;
        }
    }
    
    if (!activeExam) return;
    
    const questionIndex = activeExam.currentQuestion;
    const result = activeExam.submitAnswer(text, questionIndex);
    
    if (result.isCorrect) {
        await ctx.reply(`✅ ${getRandomPraise()}`);
    } else {
        await ctx.reply(`❌ إجابة غير صحيحة.\nالإجابة الصحيحة: ${result.correctAnswer}`);
    }
    
    // التحقق إذا كان هناك المزيد من الأسئلة
    if (result.nextQuestion) {
        await sendQuestion(ctx, activeExam, activeExam.currentQuestion);
    } else {
        // انتهاء الامتحان
        await finishExamAutomatically(ctx, userId, activeExam);
        activeExams.delete(examKey);
    }
});

async function finishExamAutomatically(ctx, userId, exam) {
    const result = exam.finish();
    
    // تحديث إحصائيات المستخدم
    userManager.updateStats(userId, result);
    
    // حفظ النتيجة
    await storage.storeData(userId, 'exam_result', result);
    
    // عرض النتائج
    await showExamResults(ctx, result);
}

async function showExamResults(ctx, result) {
    const report = `
📊 *نتيجة الامتحان*

🎯 *الدرجة:* ${result.score}%
✅ *الإجابات الصحيحة:* ${result.correctAnswers}/${result.totalQuestions}
⏱️ *الوقت المستغرق:* ${Math.round(result.timeSpent / 60000)} دقيقة
📅 *التاريخ:* ${new Date(result.timestamp).toLocaleString('ar-EG')}

🏆 *التقييم:* ${getAssessment(result.score)}

🔍 *تحليل الأداء:*
${Object.entries(result.performance.byQuestionType || {}).map(([type, data]) => {
    const accuracy = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
    return `• ${type}: ${data.correct}/${data.total} (${accuracy}%)`;
}).join('\n')}

💡 *توصيات:*
${result.performance.recommendations && result.performance.recommendations.length > 0 
    ? result.performance.recommendations.map((rec, i) => `${i+1}. ${rec}`).join('\n')
    : 'أحسنت! أداء ممتاز.'}
`;
    
    await ctx.reply(report);
    
    // خيارات متابعة
    await ctx.reply('🎯 *اختر الإجراء التالي:*',
        Markup.inlineKeyboard([
            [Markup.button.callback('💾 حفظ النتائج', 'save_results'), Markup.button.callback('🔄 امتحان جديد', 'new_exam')],
            [Markup.button.callback('📊 تحليل مفصل', 'detailed_analysis'), Markup.button.callback('📤 مشاركة', 'share_results')]
        ])
    );
}

// ====================
// 📊 وظائف العرض
// ====================

async function showResults(ctx, userId) {
    const waitMsg = await ctx.reply('🔍 جاري استرجاع نتائجك...');
    
    try {
        const results = await storage.retrieveData(userId, 'exam_result', 5);
        
        await ctx.deleteMessage(waitMsg.message_id);
        
        if (!results.success || results.data.length === 0) {
            return ctx.reply('📭 لا توجد نتائج سابقة مسجلة لك.\nابدأ بأول امتحان الآن!');
        }
        
        let historyMessage = `📚 *سجل امتحاناتك*\n\n`;
        
        results.data.forEach((result, index) => {
            const data = result.data;
            const date = new Date(data.timestamp).toLocaleDateString('ar-EG');
            const time = new Date(data.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
            
            historyMessage += `*${index + 1}. الامتحان ${data.examId ? data.examId.slice(-6) : ''}*\n`;
            historyMessage += `   📅 ${date} - ⏰ ${time}\n`;
            historyMessage += `   🎯 ${data.score}% (${data.correctAnswers}/${data.totalQuestions})\n`;
            historyMessage += `   ⏱️ ${Math.round(data.timeSpent / 60000)} دقيقة\n`;
            historyMessage += `   🏆 ${getAssessment(data.score)}\n\n`;
        });
        
        await ctx.reply(historyMessage);
        
    } catch (error) {
        await ctx.deleteMessage(waitMsg.message_id);
        await ctx.reply('❌ حدث خطأ في استرجاع النتائج.');
    }
}

async function showStats(ctx, userId) {
    const user = userManager.getOrCreateSession(userId);
    const progress = userManager.getProgressReport(userId);
    
    const statsMessage = `
📈 *إحصائياتك الشخصية*

👤 *المعلومات العامة:*
• 🎓 المستوى: ${progress.level}
• ⭐ النقاط: ${progress.xp} XP
• 📊 الامتحانات: ${progress.totalExams}
• 🎯 المتوسط: ${progress.averageScore}%
• 🎯 الدقة: ${progress.accuracy}%
• ⚡ التتابع: ${progress.streak}
• ⏱️ الوقت الكلي: ${progress.totalTime}

💪 *نقاط قوتك:*
${progress.strengths.length > 0 
    ? progress.strengths.map((s, i) => `${i+1}. ${s}`).join('\n')
    : 'لم يتم تحديد نقاط قوة بعد'}

🔧 *مجالات التحسين:*
${progress.weaknesses.length > 0 
    ? progress.weaknesses.map((w, i) => `${i+1}. ${w}`).join('\n')
    : 'لا توجد مجالات تحسين حالياً'}

💡 *توصيات:*
${progress.recommendations.map((rec, i) => `${i+1}. ${rec.message}`).join('\n')}
`;
    
    await ctx.reply(statsMessage);
}

// ====================
// 🎨 وظائف مساعدة
// ====================

function cleanExtractedText(text) {
    return text
        .replace(/\s+/g, ' ')
        .replace(/[|]/g, 'I')
        .replace(/[l]/g, 'I')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[^\u0600-\u06FF\u0750-\u077Fa-zA-Z0-9\s.,!?،؛:()\-]/g, '')
        .replace(/\n\s*\n/g, '\n\n')
        .trim();
}

function getRandomPraise() {
    const praises = [
        "أحسنت! 👏",
        "إجابة صحيحة! ✅",
        "ممتاز! 🌟",
        "دقة عالية! 🎯",
        "برافو! 🏆",
        "ذهبي! 🥇",
        "إجابة ذكية! 🧠",
        "مذهل! ✨",
        "رائع! 💎",
        "تفوق! 🚀"
    ];
    return praises[Math.floor(Math.random() * praises.length)];
}

function getAssessment(score) {
    if (score >= 95) return "متميز 🏆";
    if (score >= 85) return "ممتاز ⭐⭐⭐⭐";
    if (score >= 75) return "جيد جداً ⭐⭐⭐";
    if (score >= 65) return "جيد ⭐⭐";
    if (score >= 50) return "مقبول ⭐";
    return "يحتاج تحسين ⚠️";
}

async function finishExam(ctx, userId) {
    // البحث عن امتحان نشط
    let activeExam = null;
    let examKey = null;
    
    for (const [key, exam] of activeExams.entries()) {
        if (key.startsWith(userId.toString()) && exam.status === 'active') {
            activeExam = exam;
            examKey = key;
            break;
        }
    }
    
    if (!activeExam) {
        return ctx.reply('❌ لا يوجد امتحان نشط لتصحيحه.');
    }
    
    const result = activeExam.finish();
    activeExams.delete(examKey);
    
    // تحديث الإحصائيات
    userManager.updateStats(userId, result);
    
    // حفظ النتيجة
    await storage.storeData(userId, 'exam_result', result);
    
    // عرض النتائج
    await showExamResults(ctx, result);
}

async function cancelExam(ctx, userId) {
    // البحث عن امتحان نشط
    let examKey = null;
    
    for (const [key, exam] of activeExams.entries()) {
        if (key.startsWith(userId.toString()) && exam.status === 'active') {
            examKey = key;
            break;
        }
    }
    
    if (examKey) {
        activeExams.delete(examKey);
        await ctx.reply('❌ تم إلغاء الامتحان الحالي.');
    } else {
        await ctx.reply('❌ لا يوجد امتحان نشط لإلغائه.');
    }
}

async function showHelp(ctx) {
    const helpMessage = `
❓ *دليل استخدام البوت*

🎯 *الأوامر الرئيسية:*
• *ابدأ* - عرض القائمة الرئيسية
• *مساعدة* - عرض هذه الرسالة
• *نتائجي* - عرض النتائج السابقة
• *إحصائياتي* - عرض إحصائياتك
• *تصحيح* - إنهاء الامتحان الحالي وعرض النتائج
• *توقف* - إلغاء الامتحان الحالي

📝 *كيفية الاستخدام:*
1. أرسل نصاً طويلاً (أكثر من 50 كلمة)
2. انتظر قليلاً حتى يتم التحليل
3. ابدأ في الإجابة على الأسئلة
4. استخدم *تصحيح* عند الانتهاء

📸 *تحليل الصور:*
• يمكنك إرسال صور تحتوي على نص
• يجب أن تكون الصورة واضحة وجيدة الإضاءة
• يدعم النصوص العربية والإنجليزية

⚙️ *الإعدادات المتقدمة:*
• يمكن تغيير مستوى الصعوبة
• تحديد عدد الأسئلة
• اختيار أنواع الأسئلة

📞 *الدعم:*
للأسئلة أو المشاكل، تواصل مع المطور.
`;
    
    await ctx.reply(helpMessage);
}

async function showSettings(ctx, userId) {
    const user = userManager.getOrCreateSession(userId);
    
    const settingsMessage = `
⚙️ *الإعدادات الحالية*

📊 *مستوى الصعوبة:* ${user.preferences.difficulty}
🔢 *عدد الأسئلة:* ${user.preferences.questionCount}
🌐 *اللغة:* ${user.preferences.language === 'ar' ? 'العربية' : 'الإنجليزية'}
💡 *عرض التلميحات:* ${user.preferences.showHints ? 'نعم' : 'لا'}
💾 *الحفظ التلقائي:* ${user.preferences.autoSave ? 'نعم' : 'لا'}
🎯 *أنواع الأسئلة:* ${user.preferences.questionTypes === 'all' ? 'جميع الأنواع' : user.preferences.questionTypes}

🔧 *لتغيير الإعدادات:* أرسل التحديث المطلوب مثل:
"صعوبة: صعب"
"أسئلة: 15"
"لغة: en"
    `;
    
    await ctx.reply(settingsMessage);
}

async function showProgress(ctx, userId) {
    const progress = userManager.getProgressReport(userId);
    
    const progressMessage = `
🚀 *تقدمك التعليمي*

🎓 *المستوى الحالي:* ${progress.level}
⭐ *النقاط:* ${progress.xp} XP
📈 *التقدم للمستوى التالي:* ${progress.progressPercentage}%
⚡ *التتابع الناجح:* ${progress.streak} امتحانات

🏆 *الإنجازات القريبة:*
• المستوى ${progress.level + 1}: ${progress.xpToNextLevel} نقطة متبقية
${progress.streak >= 2 ? `• ${5 - progress.streak} امتحانات للوصول إلى 5 متتالية` : ''}

💪 *استمر في التعلم!*
    `;
    
    await ctx.reply(progressMessage);
}

// ====================
// 🚀 تشغيل البوت
// ====================

bot.launch({
    dropPendingUpdates: true,
    allowedUpdates: ['message', 'callback_query', 'inline_query']
})
.then(() => {
    console.log('🤖 البوت الذكي للامتحانات يعمل الآن...');
    console.log('📁 التخزين: نظام تخزين متقدم في Telegram');
    console.log('🧠 الذكاء: نظام تحليل وتوليد أسئلة ذكي');
    console.log('👥 المستخدمون:', userManager.sessions.size);
    
    // تنظيف الجلسات غير النشطة كل ساعة
    setInterval(() => {
        userManager.cleanupInactiveSessions();
        storage.cleanupOldData();
    }, 60 * 60 * 1000);
    
    // تنظيف الامتحانات النشطة القديمة
    setInterval(() => {
        const cutoffTime = Date.now() - (2 * 60 * 60 * 1000); // ساعتين
        activeExams.forEach((exam, key) => {
            if (exam.status === 'active' && exam.startTime < cutoffTime) {
                activeExams.delete(key);
            }
        });
    }, 30 * 60 * 1000);
})
.catch((error) => {
    console.error('❌ خطأ في تشغيل البوت:', error);
});

// معالجة إيقاف البوت
process.once('SIGINT', () => {
    console.log('🛑 إيقاف البوت...');
    bot.stop('SIGINT');
    process.exit(0);
});

process.once('SIGTERM', () => {
    console.log('🛑 إيقاف البوت...');
    bot.stop('SIGTERM');
    process.exit(0);
});

// ====================
// 📚 بيانات إضافية
// ====================

// درجات الصعوبة العربية
const difficultyNames = {
    easy: '🔰 مبتدئ',
    medium: '⭐ متوسط',
    hard: '🔥 متقدم',
    expert: '👨‍🏫 خبير'
};

// أسماء أنواع الأسئلة العربية
const questionTypeNames = {
    definition: 'تعريف',
    explanation: 'شرح',
    comparison: 'مقارنة',
    causeEffect: 'سبب ونتيجة',
    application: 'تطبيق',
    analysis: 'تحليل',
    evaluation: 'تقييم'
};
