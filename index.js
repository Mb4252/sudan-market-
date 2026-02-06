const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const http = require('http');
const Tesseract = require('tesseract.js');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');

// سيرفر لإبقاء البوت حياً على Render
http.createServer((req, res) => { res.end('All-in-One Bot is Fully Operational'); }).listen(process.env.PORT || 10000);

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// ====================
// 🗄️ نظام التخزين في Telegram
// ====================

class TelegramStorage {
    constructor() {
        this.channelId = process.env.STORAGE_CHANNEL_ID || '-100';
        this.adminId = process.env.ADMIN_ID || '';
        this.cache = new Map();
    }

    // تخزين البيانات في قناة Telegram
    async storeData(userId, dataType, data) {
        try {
            const timestamp = Date.now();
            const dataId = `${userId}_${dataType}_${timestamp}`;
            
            // تحويل البيانات إلى JSON
            const jsonData = JSON.stringify({
                id: dataId,
                userId: userId,
                type: dataType,
                timestamp: timestamp,
                data: data
            }, null, 2);

            // تخزين في الرسائل المحفوظة
            const message = await bot.telegram.sendMessage(
                this.channelId,
                `📦 ${dataType.toUpperCase()}_${timestamp}\n\n${jsonData}`
            );

            // حفظ المرجع في الذاكرة المؤقتة
            this.cache.set(dataId, {
                messageId: message.message_id,
                data: data
            });

            return {
                success: true,
                dataId: dataId,
                messageId: message.message_id
            };

        } catch (error) {
            console.error('Error storing data:', error);
            return { success: false, error: error.message };
        }
    }

    // استرجاع البيانات من Telegram
    async retrieveData(userId, dataType, limit = 10) {
        try {
            // محاولة الاسترجاع من الذاكرة المؤقتة أولاً
            const cachedResults = [];
            this.cache.forEach((value, key) => {
                if (key.startsWith(`${userId}_${dataType}`)) {
                    cachedResults.push({
                        dataId: key,
                        ...value
                    });
                }
            });

            if (cachedResults.length > 0) {
                return {
                    success: true,
                    data: cachedResults.slice(0, limit),
                    source: 'cache'
                };
            }

            // في الإنتاج الحقيقي، هنا يجب البحث في الرسائل المحفوظة
            // هذا مثال مبسط
            return {
                success: true,
                data: [],
                source: 'telegram',
                note: 'في الإنتاج الحقيقي، سيتم البحث في قناة التخزين'
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
            const timestamp = parseInt(key.split('_').pop());
            if (timestamp < cutoffTime) {
                this.cache.delete(key);
            }
        });
    }
}

// إنشاء نسخة من نظام التخزين
const storage = new TelegramStorage();

// ====================
// 🧠 نظام الذكاء الاصطناعي المحسن
// ====================

class AIExamGenerator {
    constructor() {
        this.questionPatterns = {
            definition: /(تعريف|مفهوم|ما هو|ما المقصود ب)(.+)/gi,
            explanation: /(اشرح|وضح|بين|كيف)(.+)/gi,
            comparison: /(ما الفرق بين|قارن بين|ما العلاقة بين)(.+)/gi,
            causeEffect: /(ما سبب|ما نتيجة|لماذا|كيف يؤدي)(.+)/gi
        };
    }

    // تحليل النص المتقدم
    async analyzeText(text, userId) {
        try {
            const analysis = {
                metadata: {
                    length: text.length,
                    wordCount: text.split(/\s+/).length,
                    sentenceCount: (text.match(/[.!?]+/g) || []).length,
                    language: this.detectLanguage(text)
                },
                content: {
                    keywords: this.extractKeywords(text),
                    entities: this.extractEntities(text),
                    concepts: this.extractConcepts(text),
                    questions: this.detectPotentialQuestions(text),
                    summary: this.generateSummary(text)
                },
                difficulty: {
                    level: this.assessDifficulty(text),
                    score: this.calculateComplexityScore(text),
                    recommendations: []
                },
                educational: {
                    topics: this.identifyTopics(text),
                    learningObjectives: this.generateLearningObjectives(text),
                    assessmentPoints: this.identifyAssessmentPoints(text)
                }
            };

            // تحسين بناءً على أداء المستخدم السابق
            const userHistory = await storage.retrieveData(userId, 'exam_history');
            if (userHistory.success && userHistory.data.length > 0) {
                analysis.difficulty.recommendations = this.getPersonalizedRecommendations(userHistory.data);
            }

            // حفظ تحليل النص
            await storage.storeData(userId, 'text_analysis', analysis);

            return analysis;

        } catch (error) {
            console.error('Error in text analysis:', error);
            throw error;
        }
    }

    // استخراج الكلمات المفتاحية المتقدمة
    extractKeywords(text) {
        const words = text.toLowerCase().split(/\W+/);
        const stopWords = new Set(['the', 'and', 'من', 'في', 'على', 'إلى', 'أن', 'هذا', 'هذه']);
        
        const wordFreq = {};
        words.forEach(word => {
            if (word.length > 3 && !stopWords.has(word)) {
                wordFreq[word] = (wordFreq[word] || 0) + 1;
            }
        });

        // تطبيق TF-IDF مبسط
        const sortedKeywords = Object.entries(wordFreq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .map(([word, freq]) => ({
                word,
                frequency: freq,
                importance: this.calculateWordImportance(word, text)
            }));

        return sortedKeywords;
    }

    // استخراج الكيانات (أسماء، أماكن، تواريخ)
    extractEntities(text) {
        const entities = {
            people: [],
            places: [],
            dates: [],
            numbers: []
        };

        // اكتشاف الأسماء (نمط مبسط للعربية)
        const namePattern = /\b(?:السيد|الدكتور|الأستاذ|المهندس)?\s*[أ-ي]+\s+[أ-ي]+\b/g;
        entities.people = text.match(namePattern) || [];

        // اكتشاف الأماكن
        const placePattern = /\b(?:مدينة|قرية|منطقة|بلد)\s+[أ-ي]+\b/gi;
        entities.places = text.match(placePattern) || [];

        // اكتشاف التواريخ
        const datePattern = /\b\d{1,2}\/\d{1,2}\/\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/g;
        entities.dates = text.match(datePattern) || [];

        // اكتشاف الأرقام المهمة
        const numberPattern = /\b\d+(?:\.\d+)?\b/g;
        entities.numbers = text.match(numberPattern) || [];

        return entities;
    }

    // توليد أسئلة ذكية
    generateSmartQuestions(analysis, difficulty = 'medium', count = 10) {
        const questions = [];
        const questionTypes = this.getQuestionTypesByDifficulty(difficulty);

        // أسئلة التعريف
        if (questionTypes.includes('definition')) {
            analysis.content.keywords.slice(0, 5).forEach(keyword => {
                questions.push(this.createDefinitionQuestion(keyword.word, analysis));
            });
        }

        // أسئلة الشرح
        if (questionTypes.includes('explanation')) {
            analysis.content.concepts.slice(0, 3).forEach(concept => {
                questions.push(this.createExplanationQuestion(concept, analysis));
            });
        }

        // أسئلة المقارنة
        if (questionTypes.includes('comparison') && analysis.content.keywords.length >= 2) {
            for (let i = 0; i < Math.min(2, analysis.content.keywords.length - 1); i++) {
                questions.push(this.createComparisonQuestion(
                    analysis.content.keywords[i].word,
                    analysis.content.keywords[i + 1].word,
                    analysis
                ));
            }
        }

        // أسئلة السبب والنتيجة
        if (questionTypes.includes('cause_effect')) {
            analysis.content.concepts.slice(0, 2).forEach(concept => {
                questions.push(this.createCauseEffectQuestion(concept, analysis));
            });
        }

        // أسئلة الاختيار من متعدد المتقدمة
        if (questionTypes.includes('mcq_advanced')) {
            analysis.content.keywords.slice(0, 5).forEach(keyword => {
                questions.push(this.createAdvancedMCQ(keyword.word, analysis));
            });
        }

        // تقييم وفرز الأسئلة حسب الجودة
        const evaluatedQuestions = questions.map(q => ({
            ...q,
            quality: this.evaluateQuestionQuality(q, analysis)
        }));

        // ترتيب حسب الجودة واختيار الأفضل
        return evaluatedQuestions
            .sort((a, b) => b.quality - a.quality)
            .slice(0, count);
    }

    // إنشاء سؤال اختيار من متعدد متقدم
    createAdvancedMCQ(keyword, analysis) {
        const distractors = this.generateSmartDistractors(keyword, analysis);
        
        return {
            type: 'mcq_advanced',
            text: `ما هو التعريف الدقيق لمصطلح "${keyword}"؟`,
            options: [
                this.generateCorrectDefinition(keyword, analysis),
                ...distractors
            ],
            correctIndex: 0,
            explanation: this.generateExplanation(keyword, analysis),
            difficulty: 'hard',
            tags: [keyword, 'تعريف', 'مصطلح'],
            cognitiveLevel: 'analysis'
        };
    }

    // توليد مشتتات ذكية
    generateSmartDistractors(correctAnswer, analysis) {
        const distractors = [];
        
        // مشتت 1: تعريف خاطئ ولكن مقارب
        distractors.push(this.generatePlausibleWrongDefinition(correctAnswer));
        
        // مشتت 2: تعريف لمصطلح مشابه
        const similarKeywords = analysis.content.keywords
            .filter(k => k.word !== correctAnswer && k.word.length > 3)
            .slice(0, 2)
            .map(k => k.word);
        
        similarKeywords.forEach(keyword => {
            distractors.push(this.generateCorrectDefinition(keyword, analysis));
        });

        // مشتت 3: تعريف عام جداً
        distractors.push(`مصطلح يستخدم في ${analysis.educational.topics[0] || 'هذا المجال'}`);

        return this.shuffleArray(distractors).slice(0, 3);
    }

    // توليد شرح مفصل
    generateExplanation(keyword, analysis) {
        const explanations = [
            `مصطلح "${keyword}" يشير إلى ${this.getConceptDescription(keyword)}`,
            `يستخدم "${keyword}" في سياق ${analysis.educational.topics[0] || 'المجال'} لوصف ${this.getFunctionDescription(keyword)}`,
            `الأهمية: ${this.getImportanceDescription(keyword)}`,
            `العلاقة: ${this.getRelationshipDescription(keyword, analysis)}`
        ];

        return explanations.join('\n\n');
    }

    // تقييم جودة السؤال
    evaluateQuestionQuality(question, analysis) {
        let score = 5; // درجة أساسية

        // تقييم الوضوح
        if (question.text.length > 20 && question.text.length < 150) score += 2;
        
        // تقييم الخيارات
        if (question.options && question.options.length >= 4) {
            const uniqueOptions = new Set(question.options.map(o => o.substring(0, 50)));
            if (uniqueOptions.size === question.options.length) score += 2;
        }

        // تقييم الصلة بالموضوع
        if (this.isRelevantToAnalysis(question, analysis)) score += 3;

        // تقييم مستوى التفكير
        if (question.cognitiveLevel === 'analysis' || question.cognitiveLevel === 'evaluation') score += 2;

        return Math.min(10, score);
    }

    // مساعدات متنوعة
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    calculateWordImportance(word, text) {
        // حساب مبسط لأهمية الكلمة
        const totalWords = text.split(/\s+/).length;
        const wordFrequency = (text.match(new RegExp(word, 'gi')) || []).length;
        const frequencyScore = (wordFrequency / totalWords) * 100;
        
        // كلمات أطول تكون عادة أكثر أهمية
        const lengthScore = Math.min(word.length / 10, 1);
        
        return (frequencyScore * 0.7) + (lengthScore * 0.3);
    }

    getQuestionTypesByDifficulty(difficulty) {
        const types = {
            easy: ['definition', 'mcq_basic', 'true_false'],
            medium: ['definition', 'explanation', 'mcq_advanced', 'fill_blank'],
            hard: ['comparison', 'cause_effect', 'essay', 'analysis'],
            expert: ['synthesis', 'evaluation', 'critical_thinking', 'research']
        };
        return types[difficulty] || types.medium;
    }

    // دالات وهمية للتوضيح (يجب تطويرها)
    detectLanguage(text) { return 'arabic'; }
    extractConcepts(text) { return []; }
    detectPotentialQuestions(text) { return []; }
    generateSummary(text) { return ''; }
    assessDifficulty(text) { return 'medium'; }
    calculateComplexityScore(text) { return 5; }
    identifyTopics(text) { return []; }
    generateLearningObjectives(text) { return []; }
    identifyAssessmentPoints(text) { return []; }
    getPersonalizedRecommendations(history) { return []; }
    getConceptDescription(keyword) { return '...'; }
    getFunctionDescription(keyword) { return '...'; }
    getImportanceDescription(keyword) { return '...'; }
    getRelationshipDescription(keyword, analysis) { return '...'; }
    isRelevantToAnalysis(question, analysis) { return true; }
    generateCorrectDefinition(keyword, analysis) { return `تعريف ${keyword}`; }
    generatePlausibleWrongDefinition(keyword) { return `تعريف خاطئ لـ${keyword}`; }
    createDefinitionQuestion(keyword, analysis) { return {}; }
    createExplanationQuestion(concept, analysis) { return {}; }
    createComparisonQuestion(word1, word2, analysis) { return {}; }
    createCauseEffectQuestion(concept, analysis) { return {}; }
}

// ====================
// 🤖 البوت الرئيسي المحسن
// ====================

// إنشاء مثيل من مولد الامتحانات
const aiGenerator = new AIExamGenerator();

// مصفوفات البيانات المحسنة
const azkar = [
    "سبحان الله وبحمده سبحان الله العظيم 🌟",
    "اللهم بك أصبحنا وبك أمسينا وبك نحيا وبك نموت وإليك النشور ☀️",
    "لا إله إلا الله وحده لا شريك له، له الملك وله الحمد وهو على كل شيء قدير 🕋",
    "حسبي الله ونعم الوكيل في كل أموري 🤲",
    "اللهم إني أعوذ بك من الهم والحزن والعجز والكسل والبخل والجبن وضلع الدين وغلبة الرجال 🛡️"
];

const praises = [
    "مذهل! إجابة دقيقة جداً 🎯",
    "أحسنت! تفكيرك منطقي ومنظم 💡",
    "رائع! هذه إجابة شاملة ومتكاملة 🌟",
    "إبداع! لقد فكرت خارج الصندوق 🚀",
    "دقة عالية! ملاحظاتك في محلها 💎"
];

// جلسات المستخدمين المحسنة
const userSessions = new Map();

class UserSession {
    constructor(userId) {
        this.userId = userId;
        this.currentExam = null;
        this.preferences = {
            difficulty: 'medium',
            questionCount: 10,
            timeLimit: null,
            showHints: true,
            language: 'ar'
        };
        this.stats = {
            totalExams: 0,
            averageScore: 0,
            strengths: [],
            weaknesses: [],
            lastActive: Date.now()
        };
        this.cache = {
            recentTexts: [],
            recentImages: [],
            recentResults: []
        };
    }

    async startNewExam(text, sourceType = 'text') {
        const examId = `${this.userId}_${Date.now()}`;
        
        this.currentExam = {
            id: examId,
            source: text.substring(0, 200) + '...',
            sourceType: sourceType,
            startTime: Date.now(),
            questions: [],
            userAnswers: [],
            status: 'generating',
            metadata: {}
        };

        // تحليل النص باستخدام الذكاء الاصطناعي
        const analysis = await aiGenerator.analyzeText(text, this.userId);
        
        // توليد الأسئلة
        const questions = aiGenerator.generateSmartQuestions(
            analysis,
            this.preferences.difficulty,
            this.preferences.questionCount
        );

        this.currentExam.questions = questions;
        this.currentExam.metadata.analysis = analysis;
        this.currentExam.status = 'active';

        // حفظ بيانات الامتحان في التخزين
        await storage.storeData(this.userId, 'exam_data', {
            examId: examId,
            analysis: analysis,
            questions: questions.map(q => ({
                text: q.text,
                type: q.type,
                difficulty: q.difficulty
            }))
        });

        return this.currentExam;
    }

    submitAnswer(questionIndex, answer) {
        if (!this.currentExam || this.currentExam.status !== 'active') {
            throw new Error('No active exam');
        }

        const question = this.currentExam.questions[questionIndex];
        const isCorrect = this.checkAnswer(question, answer);

        this.currentExam.userAnswers[questionIndex] = {
            question: question.text,
            userAnswer: answer,
            isCorrect: isCorrect,
            timeSpent: Date.now() - this.currentExam.startTime,
            timestamp: Date.now()
        };

        return {
            isCorrect,
            correctAnswer: question.correctAnswer || question.options?.[question.correctIndex],
            explanation: question.explanation
        };
    }

    checkAnswer(question, userAnswer) {
        // منطق التحقق من الإجابة
        if (question.type === 'mcq_advanced' || question.type === 'mcq_basic') {
            return userAnswer === question.correctIndex;
        } else if (question.type === 'true_false') {
            return userAnswer === question.correctAnswer;
        } else {
            // للمقارنة مع الإجابات النصية
            return this.similarityCheck(userAnswer, question.correctAnswer);
        }
    }

    similarityCheck(answer1, answer2) {
        // تحقق مبسط من التشابه
        const normalize = (str) => str.toLowerCase().replace(/\s+/g, ' ').trim();
        const norm1 = normalize(answer1);
        const norm2 = normalize(answer2);
        
        return norm1 === norm2 || norm1.includes(norm2) || norm2.includes(norm1);
    }

    async finishExam() {
        if (!this.currentExam || this.currentExam.status !== 'active') {
            throw new Error('No active exam');
        }

        // حساب النتيجة
        const score = this.calculateScore();
        
        // تحليل الأداء
        const performanceAnalysis = this.analyzePerformance();

        const result = {
            examId: this.currentExam.id,
            score: score,
            totalQuestions: this.currentExam.questions.length,
            correctAnswers: this.currentExam.userAnswers.filter(a => a.isCorrect).length,
            timeSpent: Date.now() - this.currentExam.startTime,
            performance: performanceAnalysis,
            details: this.currentExam.userAnswers,
            timestamp: Date.now()
        };

        // تحديث الإحصائيات
        this.updateStats(result);

        // حفظ النتيجة في التخزين
        await storage.storeData(this.userId, 'exam_result', result);

        // مسح الامتحان الحالي
        this.currentExam.status = 'completed';
        const completedExam = this.currentExam;
        this.currentExam = null;

        return {
            result: result,
            exam: completedExam
        };
    }

    calculateScore() {
        const correctCount = this.currentExam.userAnswers.filter(a => a.isCorrect).length;
        const total = this.currentExam.questions.length;
        return Math.round((correctCount / total) * 100);
    }

    analyzePerformance() {
        const analysis = {
            byQuestionType: {},
            byDifficulty: {},
            timeAnalysis: {},
            recommendations: []
        };

        // تحليل حسب نوع السؤال
        this.currentExam.questions.forEach((q, index) => {
            const userAnswer = this.currentExam.userAnswers[index];
            if (!userAnswer) return;

            const type = q.type;
            if (!analysis.byQuestionType[type]) {
                analysis.byQuestionType[type] = { total: 0, correct: 0 };
            }
            analysis.byQuestionType[type].total++;
            if (userAnswer.isCorrect) analysis.byQuestionType[type].correct++;
        });

        // تحليل حسب الوقت
        const times = this.currentExam.userAnswers.map(a => a.timeSpent);
        analysis.timeAnalysis = {
            average: times.reduce((a, b) => a + b, 0) / times.length,
            min: Math.min(...times),
            max: Math.max(...times)
        };

        // توليد توصيات
        analysis.recommendations = this.generateRecommendations(analysis);

        return analysis;
    }

    generateRecommendations(analysis) {
        const recs = [];
        
        // تحليل نقاط القوة والضعف
        Object.entries(analysis.byQuestionType).forEach(([type, data]) => {
            const accuracy = (data.correct / data.total) * 100;
            if (accuracy < 60) {
                recs.push(`تحتاج تحسين في أسئلة النوع: ${type} (دقة: ${accuracy.toFixed(1)}%)`);
            } else if (accuracy > 85) {
                recs.push(`ممتاز في أسئلة النوع: ${type} (دقة: ${accuracy.toFixed(1)}%)`);
            }
        });

        // توصيات الوقت
        if (analysis.timeAnalysis.average > 60000) { // أكثر من دقيقة للسؤال
            recs.push('تحتاج إلى تحسين سرعة الإجابة');
        }

        return recs;
    }

    updateStats(result) {
        this.stats.totalExams++;
        
        // تحديث متوسط النقاط
        this.stats.averageScore = 
            ((this.stats.averageScore * (this.stats.totalExams - 1)) + result.score) / this.stats.totalExams;

        // تحديث نقاط القوة والضعف
        result.performance.recommendations.forEach(rec => {
            if (rec.includes('ممتاز')) {
                const strength = rec.split('في أسئلة النوع: ')[1];
                if (strength && !this.stats.strengths.includes(strength)) {
                    this.stats.strengths.push(strength);
                }
            } else if (rec.includes('تحتاج تحسين')) {
                const weakness = rec.split('في أسئلة النوع: ')[1];
                if (weakness && !this.stats.weaknesses.includes(weakness)) {
                    this.stats.weaknesses.push(weakness);
                }
            }
        });

        this.stats.lastActive = Date.now();
    }
}

// ====================
// 🎯 معالجات الأوامر الرئيسية
// ====================

// القائمة الرئيسية المحسنة
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    
    // إنشاء جلسة جديدة للمستخدم
    if (!userSessions.has(userId)) {
        userSessions.set(userId, new UserSession(userId));
    }

    const session = userSessions.get(userId);
    
    const welcomeMessage = `أهلاً بك ${ctx.from.first_name}! 🎓✨

🤖 **البوت الذكي للامتحانات - النسخة المتقدمة**

*مميزات جديدة:*
• 🧠 ذكاء اصطناعي محسن للتحليل
• 📊 تخزين كامل في Telegram
• 🎯 أسئلة ذكية ومتدرجة الصعوبة
• 📈 تحليل أداء مفصل
• 💾 حفظ النتائج بشكل دائم

اختر الخدمة التي تريدها:`;

    await ctx.reply(welcomeMessage, 
        Markup.inlineKeyboard([
            [Markup.button.callback('🧠 امتحان ذكي متقدم', 'smart_exam'), Markup.button.callback('📸 تحليل صورة', 'analyze_image')],
            [Markup.button.callback('📚 امتحان سريع', 'quick_quiz'), Markup.button.callback('📖 تحليل كتاب', 'book_analyzer')],
            [Markup.button.callback('📊 نتائجي السابقة', 'my_results'), Markup.button.callback('📈 إحصائياتي', 'my_stats')],
            [Markup.button.callback('⚙️ الإعدادات', 'settings'), Markup.button.callback('ℹ️ المساعدة', 'help')]
        ])
    );
});

// معالجة الامتحان الذكي
bot.action('smart_exam', async (ctx) => {
    await ctx.answerCbQuery();
    
    const session = getOrCreateSession(ctx.from.id);
    
    await ctx.reply(`🧠 **الامتحان الذكي المتقدم**\n\n` +
                   `📝 أرسل لي:\n` +
                   `• نصاً طويلاً (أكثر من 200 حرف)\n` +
                   `• صورة تحتوي على نص\n` +
                   `• ملف نصي (.txt)\n\n` +
                   `✨ سأقوم بـ:\n` +
                   `1. تحليل النص باستخدام الذكاء الاصطناعي\n` +
                   `2. تحديد المفاهيم الرئيسية\n` +
                   `3. إنشاء أسئلة ذكية تتناسب مع مستواك\n` +
                   `4. حفظ النتائج في سجلك الشخصي\n\n` +
                   `⚙️ الإعدادات الحالية:\n` +
                   `• الصعوبة: ${getDifficultyName(session.preferences.difficulty)}\n` +
                   `• عدد الأسئلة: ${session.preferences.questionCount}\n` +
                   `• اللغة: ${session.preferences.language === 'ar' ? 'العربية' : 'الإنجليزية'}`);
});

// معالجة النصوص الطويلة
bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim();
    const userId = ctx.from.id;
    const session = getOrCreateSession(userId);

    // الأوامر الخاصة
    if (text === 'تصحيح') {
        return await finishCurrentExam(ctx, session);
    }
    
    if (text === 'توقف') {
        return await cancelCurrentExam(ctx, session);
    }
    
    if (text === 'مساعدة' || text === 'help') {
        return await showHelp(ctx);
    }
    
    if (text === 'نتائجي') {
        return await showMyResults(ctx, session);
    }
    
    if (text === 'إحصائياتي') {
        return await showMyStats(ctx, session);
    }

    // إذا كان النص قصيراً جداً
    if (text.length < 50) {
        return ctx.reply('📝 النص قصير جداً. أرسل نصاً أطول (أكثر من 50 حرفاً) لإنشاء امتحان ذكي منه.');
    }

    // بدء امتحان ذكي
    await startSmartExam(ctx, session, text);
});

// معالجة الصور (OCR محسن)
bot.on('photo', async (ctx) => {
    const userId = ctx.from.id;
    const session = getOrCreateSession(userId);
    
    const waitMsg = await ctx.reply('🔍 جاري تحليل الصورة باستخدام الذكاء الاصطناعي...');
    
    try {
        const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        const fileLink = await ctx.telegram.getFileLink(fileId);
        
        // استخدام Tesseract مع إعدادات محسنة للعربية
        const { data: { text } } = await Tesseract.recognize(
            fileLink.href,
            'ara+eng',
            {
                logger: m => console.log(m),
                tessedit_pageseg_mode: '6', // نمط التعرف على الصفحة
                preserve_interword_spaces: '1',
                user_defined_dpi: '300'
            }
        );
        
        await ctx.deleteMessage(waitMsg.message_id);
        
        if (!text || text.trim().length < 30) {
            return ctx.reply('❌ لم أستطع استخراج نص كافٍ من الصورة.\n' +
                           'تأكد من:\n' +
                           '• وضوح النص في الصورة\n' +
                           '• إضاءة كافية\n' +
                           '• اتجاه الكتابة صحيح\n' +
                           '• حجم خط مناسب');
        }
        
        // تنظيف النص المستخرج
        const cleanedText = cleanOCRText(text);
        
        await ctx.reply(`✅ تم استخراج ${cleanedText.length} حرفاً من الصورة.\n` +
                       `📊 جودة الاستخراج: ${assessOCRQuality(cleanedText)}/10\n\n` +
                       `💡 *نصيحة:* تأكد من دقة النص المستخرج قبل المتابعة.`);
        
        // بدء الامتحان بالنص المستخرج
        await startSmartExam(ctx, session, cleanedText, true);
        
    } catch (error) {
        await ctx.deleteMessage(waitMsg.message_id);
        console.error('OCR Error:', error);
        await ctx.reply('❌ حدث خطأ في تحليل الصورة. حاول مرة أخرى أو أرسل نصاً مباشرة.');
    }
});

// معالجة المستندات
bot.on('document', async (ctx) => {
    const document = ctx.message.document;
    const mimeType = document.mime_type;
    const fileName = document.file_name || '';
    
    // دعم ملفات نصية فقط حالياً
    if (mimeType === 'text/plain' || fileName.endsWith('.txt')) {
        const waitMsg = await ctx.reply('📄 جاري قراءة الملف النصي...');
        
        try {
            const fileLink = await ctx.telegram.getFileLink(document.file_id);
            const response = await axios.get(fileLink.href);
            const text = response.data;
            
            await ctx.deleteMessage(waitMsg.message_id);
            
            if (text.length < 100) {
                return ctx.reply('❌ الملف النصي قصير جداً. أرسل ملفاً يحتوي على نص أكثر');
            }
            
            const session = getOrCreateSession(ctx.from.id);
            await startSmartExam(ctx, session, text, false, 'ملف نصي');
            
        } catch (error) {
            await ctx.deleteMessage(waitMsg.message_id);
            await ctx.reply('❌ حدث خطأ في قراءة الملف النصي');
        }
    } else {
        await ctx.reply('⚠️ أدعم فقط الملفات النصية (.txt) حالياً');
    }
});

// ====================
// 🛠️ الوظائف المساعدة
// ====================

function getOrCreateSession(userId) {
    if (!userSessions.has(userId)) {
        userSessions.set(userId, new UserSession(userId));
    }
    return userSessions.get(userId);
}

async function startSmartExam(ctx, session, text, fromImage = false, sourceType = 'نص') {
    const waitMsg = await ctx.reply('🧠 جاري التحليل الذكي للنص وإنشاء امتحان مخصص...\n\n' +
                                   '⏳ قد يستغرق هذا بضع لحظات');
    
    try {
        const exam = await session.startNewExam(text, fromImage ? 'صورة' : sourceType);
        
        await ctx.deleteMessage(waitMsg.message_id);
        
        // عرض ملخص التحليل
        const analysis = exam.metadata.analysis;
        const summary = await generateAnalysisSummary(analysis);
        
        await ctx.reply(summary);
        
        // إرسال الأسئلة
        await sendQuestions(ctx, exam.questions, session);
        
    } catch (error) {
        await ctx.deleteMessage(waitMsg.message_id);
        console.error('Exam generation error:', error);
        await ctx.reply('❌ حدث خطأ في إنشاء الامتحان. حاول مرة أخرى.');
    }
}

async function sendQuestions(ctx, questions, session) {
    const batchSize = 3; // إرسال 3 أسئلة في كل مرة
    
    for (let i = 0; i < questions.length; i += batchSize) {
        const batch = questions.slice(i, i + batchSize);
        
        for (let j = 0; j < batch.length; j++) {
            const question = batch[j];
            const questionNum = i + j + 1;
            
            await sendQuestionWithOptions(ctx, question, questionNum, session);
            
            // تأخير بين الأسئلة
            if (j < batch.length - 1) {
                await sleep(1500);
            }
        }
        
        // تأخير بين الدفعات
        if (i + batchSize < questions.length) {
            await ctx.reply('⏸️ انتقل للأسئلة التالية...');
            await sleep(2000);
        }
    }
    
    // إضافة أزرار التحكم النهائية
    await ctx.reply('🎯 **انتهت جميع الأسئلة**\n\n' +
                   'اختر الإجراء التالي:',
        Markup.inlineKeyboard([
            [Markup.button.callback('📊 تصحيح النتائج', 'correct_exam'), Markup.button.callback('💾 حفظ النتائج', 'save_results')],
            [Markup.button.callback('🔄 امتحان جديد', 'new_exam'), Markup.button.callback('📤 تصدير النتائج', 'export_results')]
        ])
    );
}

async function sendQuestionWithOptions(ctx, question, number, session) {
    let message = `**السؤال ${number}: ${getQuestionTypeName(question.type)}**\n\n`;
    message += `${question.text}\n`;
    
    if (question.options && question.options.length > 0) {
        question.options.forEach((option, index) => {
            const letter = String.fromCharCode(65 + index);
            message += `\n${letter}) ${option}`;
        });
    }
    
    // إضافة تلميحات إذا كانت مفعلة في الإعدادات
    if (session.preferences.showHints && question.hint) {
        message += `\n\n💡 *تلميح:* ${question.hint}`;
    }
    
    // إضافة الوقت المقترح
    const timeSuggestions = {
        easy: '30-60 ثانية',
        medium: '1-2 دقيقة',
        hard: '2-3 دقائق',
        expert: '3-5 دقائق'
    };
    
    message += `\n\n⏱️ *الوقت المقترح:* ${timeSuggestions[question.difficulty] || '1-2 دقيقة'}`;
    
    // إضافة أزرار للاختيار من متعدد
    if (question.type.includes('mcq')) {
        const buttons = question.options.map((option, index) => {
            const letter = String.fromCharCode(65 + index);
            return [Markup.button.callback(`${letter}`, `answer_${number}_${index}`)];
        });
        
        await ctx.reply(message, Markup.inlineKeyboard(buttons));
    } else {
        await ctx.reply(message + '\n\n✍️ *أرسل إجابتك في رسالة نصية*');
    }
}

// معالجة الإجابات التفاعلية
bot.action(/answer_(\d+)_(\d+)/, async (ctx) => {
    const userId = ctx.from.id;
    const session = userSessions.get(userId);
    
    if (!session || !session.currentExam || session.currentExam.status !== 'active') {
        return ctx.answerCbQuery('❌ لا يوجد امتحان نشط!', { show_alert: true });
    }
    
    const questionNum = parseInt(ctx.match[1]) - 1;
    const answerIndex = parseInt(ctx.match[2]);
    
    try {
        const result = session.submitAnswer(questionNum, answerIndex);
        
        const response = result.isCorrect 
            ? `✅ ${getRandomPraise()}`
            : `❌ ليس صحيحاً. ${result.explanation ? `\n📚 ${result.explanation}` : ''}`;
        
        await ctx.answerCbQuery(response, { show_alert: true });
        
        // تحديث التقدم
        await updateProgressMessage(ctx, session, questionNum + 1);
        
    } catch (error) {
        await ctx.answerCbQuery('❌ حدث خطأ في معالجة الإجابة', { show_alert: true });
    }
});

// معالجة الإجابات النصية
bot.on('message', async (ctx) => {
    // تجنب معالجة رسائل الأوامر مرة أخرى
    if (ctx.message.text && ['تصحيح', 'توقف', 'مساعدة', 'نتائجي', 'إحصائياتي'].includes(ctx.message.text)) {
        return;
    }
    
    // إذا كانت رسالة نصية عادية وكان هناك امتحان نشط
    const userId = ctx.from.id;
    const session = userSessions.get(userId);
    
    if (session && session.currentExam && session.currentExam.status === 'active' && ctx.message.text) {
        // افترض أنها إجابة على السؤال الحالي
        const currentQuestionIndex = session.currentExam.userAnswers.length;
        
        if (currentQuestionIndex < session.currentExam.questions.length) {
            const result = session.submitAnswer(currentQuestionIndex, ctx.message.text);
            
            const response = result.isCorrect 
                ? `✅ ${getRandomPraise()}`
                : `❌ ليس صحيحاً تماماً.\nالإجابة الدقيقة: ${result.correctAnswer}\n${result.explanation ? `\n📚 ${result.explanation}` : ''}`;
            
            await ctx.reply(response);
            
            // تحديث التقدم
            await updateProgressMessage(ctx, session, currentQuestionIndex + 1);
        }
    }
});

async function updateProgressMessage(ctx, session, currentQuestion) {
    const totalQuestions = session.currentExam.questions.length;
    const progress = Math.round((currentQuestion / totalQuestions) * 100);
    
    // إنشاء شريط التقدم
    const progressBar = createProgressBar(progress, 20);
    
    const progressMsg = `📊 **تقدم الامتحان**\n\n` +
                       `${progressBar} ${progress}%\n\n` +
                       `✅ ${currentQuestion}/${totalQuestions} أسئلة\n` +
                       `⏱️ ${Math.round((Date.now() - session.currentExam.startTime) / 60000)} دقيقة`;
    
    // إرسال تحديث التقدم كل 3 أسئلة
    if (currentQuestion % 3 === 0 || currentQuestion === totalQuestions) {
        await ctx.reply(progressMsg);
    }
}

async function finishCurrentExam(ctx, session) {
    if (!session.currentExam || session.currentExam.status !== 'active') {
        return ctx.reply('❌ لا يوجد امتحان نشط لتصحيحه');
    }
    
    const waitMsg = await ctx.reply('📊 جاري تصحيح الإجابات وتحليل النتائج...');
    
    try {
        const result = await session.finishExam();
        
        await ctx.deleteMessage(waitMsg.message_id);
        
        // عرض النتائج التفصيلية
        await showDetailedResults(ctx, result);
        
    } catch (error) {
        await ctx.deleteMessage(waitMsg.message_id);
        await ctx.reply('❌ حدث خطأ في تصحيح الامتحان');
    }
}

async function showDetailedResults(ctx, result) {
    const { result: examResult, exam } = result;
    
    // التقرير الرئيسي
    const mainReport = `📈 **تقرير الامتحان التفصيلي**\n\n` +
                      `🎯 **النتيجة:** ${examResult.score}%\n` +
                      `✅ **الإجابات الصحيحة:** ${examResult.correctAnswers}/${examResult.totalQuestions}\n` +
                      `⏱️ **الوقت المستغرق:** ${Math.round(examResult.timeSpent / 60000)} دقيقة\n` +
                      `📅 **التاريخ:** ${new Date(examResult.timestamp).toLocaleString('ar-EG')}\n\n` +
                      `🏆 **التقييم:** ${getAssessment(examResult.score)}\n\n` +
                      `📊 **تحليل الأداء:**`;
    
    await ctx.reply(mainReport);
    
    // تحليل حسب نوع السؤال
    let typeAnalysis = `🔍 **التحليل حسب نوع السؤال:**\n\n`;
    Object.entries(examResult.performance.byQuestionType).forEach(([type, data]) => {
        const accuracy = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
        typeAnalysis += `• ${getQuestionTypeName(type)}: ${data.correct}/${data.total} (${accuracy}%)\n`;
    });
    
    await ctx.reply(typeAnalysis);
    
    // التوصيات
    if (examResult.performance.recommendations.length > 0) {
        let recommendations = `💡 **توصيات للتحسين:**\n\n`;
        examResult.performance.recommendations.forEach((rec, index) => {
            recommendations += `${index + 1}. ${rec}\n`;
        });
        
        await ctx.reply(recommendations);
    }
    
    // الإجابات الصحيحة
    let correctAnswers = `📋 **الإجابات الصحيحة:**\n\n`;
    exam.questions.forEach((q, index) => {
        const userAnswer = examResult.details[index];
        correctAnswers += `${index + 1}. ${q.text}\n`;
        correctAnswers += `   ✅ ${q.correctAnswer || q.options?.[q.correctIndex]}\n`;
        if (userAnswer) {
            correctAnswers += `   ${userAnswer.isCorrect ? '✔️' : '❌'} إجابتك: ${userAnswer.userAnswer}\n`;
        }
        correctAnswers += '\n';
    });
    
    // تقسيم الرسالة إذا كانت طويلة
    const chunks = splitMessage(correctAnswers, 4000);
    for (const chunk of chunks) {
        await ctx.reply(chunk);
    }
    
    // خيارات متابعة
    await ctx.reply('🎯 **اختر الإجراء التالي:**',
        Markup.inlineKeyboard([
            [Markup.button.callback('💾 حفظ في سجلي', 'save_to_profile'), Markup.button.callback('📤 مشاركة النتائج', 'share_results')],
            [Markup.button.callback('🔄 امتحان جديد', 'new_exam_after_result'), Markup.button.callback('📊 المزيد من التحليل', 'more_analysis')]
        ])
    );
}

// ====================
// 📊 وظائف العرض والتخزين
// ====================

async function showMyResults(ctx, session) {
    const waitMsg = await ctx.reply('🔍 جاري استرجاع نتائجك السابقة...');
    
    try {
        const results = await storage.retrieveData(session.userId, 'exam_result', 10);
        
        await ctx.deleteMessage(waitMsg.message_id);
        
        if (!results.success || results.data.length === 0) {
            return ctx.reply('📭 لا توجد نتائج سابقة مسجلة لك.\nابدأ بأول امتحان الآن!');
        }
        
        let historyMessage = `📚 **سجل امتحاناتك**\n\n`;
        
        results.data.forEach((result, index) => {
            const data = result.data;
            const date = new Date(data.timestamp).toLocaleDateString('ar-EG');
            const time = new Date(data.timestamp).toLocaleTimeString('ar-EG');
            
            historyMessage += `**${index + 1}. الامتحان ${result.dataId.split('_').pop().slice(-6)}**\n`;
            historyMessage += `   📅 ${date} - ⏰ ${time}\n`;
            historyMessage += `   🎯 ${data.score}% (${data.correctAnswers}/${data.totalQuestions})\n`;
            historyMessage += `   ⏱️ ${Math.round(data.timeSpent / 60000)} دقيقة\n`;
            historyMessage += `   🏆 ${getAssessment(data.score)}\n\n`;
        });
        
        // إضافة الإحصائيات
        const stats = session.stats;
        historyMessage += `📊 **إحصائيات عامة:**\n`;
        historyMessage += `   • إجمالي الامتحانات: ${stats.totalExams}\n`;
        historyMessage += `   • المتوسط العام: ${stats.averageScore.toFixed(1)}%\n`;
        historyMessage += `   • آخر نشاط: ${new Date(stats.lastActive).toLocaleString('ar-EG')}\n`;
        
        if (stats.strengths.length > 0) {
            historyMessage += `   • نقاط القوة: ${stats.strengths.join(', ')}\n`;
        }
        
        if (stats.weaknesses.length > 0) {
            historyMessage += `   • نقاط الضعف: ${stats.weaknesses.join(', ')}\n`;
        }
        
        await ctx.reply(historyMessage);
        
        // عرض رسم بياني مبسط للإنجاز
        const achievements = generateAchievementsChart(results.data);
        if (achievements) {
            await ctx.reply(achievements);
        }
        
    } catch (error) {
        await ctx.deleteMessage(waitMsg.message_id);
        console.error('Error retrieving results:', error);
        await ctx.reply('❌ حدث خطأ في استرجاع النتائج');
    }
}

async function showMyStats(ctx, session) {
    const stats = session.stats;
    
    let statsMessage = `📈 **إحصائياتك الشخصية**\n\n`;
    
    statsMessage += `👤 **المعلومات العامة:**\n`;
    statsMessage += `   • إجمالي الامتحانات: ${stats.totalExams}\n`;
    statsMessage += `   • المتوسط العام: ${stats.averageScore.toFixed(1)}%\n`;
    statsMessage += `   • آخر نشاط: ${timeAgo(stats.lastActive)}\n\n`;
    
    if (stats.strengths.length > 0) {
        statsMessage += `💪 **نقاط قوتك:**\n`;
        stats.strengths.forEach((strength, index) => {
            statsMessage += `   ${index + 1}. ${strength}\n`;
        });
        statsMessage += `\n`;
    }
    
    if (stats.weaknesses.length > 0) {
        statsMessage += `🔧 **مجالات التحسين:**\n`;
        stats.weaknesses.forEach((weakness, index) => {
            statsMessage += `   ${index + 1}. ${weakness}\n`;
        });
        statsMessage += `\n`;
    }
    
    // تقدم التعلم
    statsMessage += `🚀 **تقدم التعلم:**\n`;
    const progressLevel = Math.min(Math.floor(stats.totalExams / 5), 10);
    statsMessage += `   • مستوى التقدم: ${progressLevel}/10\n`;
    statsMessage += `   • ${getProgressMessage(progressLevel)}\n`;
    
    // الأهداف المقترحة
    statsMessage += `\n🎯 **الأهداف المقترحة:**\n`;
    const suggestedGoals = suggestGoals(stats);
    suggestedGoals.forEach((goal, index) => {
        statsMessage += `   ${index + 1}. ${goal}\n`;
    });
    
    await ctx.reply(statsMessage);
    
    // إضافة زر لتفاصيل أكثر
    await ctx.reply('📊 **لمزيد من التفاصيل:**',
        Markup.inlineKeyboard([
            [Markup.button.callback('📈 رسم بياني للتقدم', 'progress_chart'), Markup.button.callback('🏆 إنجازاتي', 'my_achievements')],
            [Markup.button.callback('🎯 وضع أهداف جديدة', 'set_goals'), Markup.button.callback('🔄 تحديث الإحصائيات', 'refresh_stats')]
        ])
    );
}

// ====================
// 🎨 وظائف مساعدة إضافية
// ====================

function getDifficultyName(level) {
    const names = {
        easy: '🔰 مبتدئ',
        medium: '⭐ متوسط',
        hard: '🔥 متقدم',
        expert: '👨‍🏫 خبير',
        auto: '🎯 تلقائي'
    };
    return names[level] || '⭐ متوسط';
}

function getQuestionTypeName(type) {
    const names = {
        'mcq_basic': 'اختيار من متعدد (مبتدئ)',
        'mcq_advanced': 'اختيار من متعدد (متقدم)',
        'true_false': 'صح أم خطأ',
        'fill_blank': 'ملء الفراغ',
        'definition': 'تعريف',
        'explanation': 'شرح',
        'comparison': 'مقارنة',
        'essay': 'مقال',
        'analysis': 'تحليل',
        'critical_thinking': 'تفكير نقدي'
    };
    return names[type] || type;
}

function getRandomPraise() {
    const praises = [
        "إجابة ممتازة! 👏",
        "دقة عالية في التفكير! 💎",
        "أحسنت! هذا صحيح تماماً 🎯",
        "إجابة ذكية ومبتكرة! 🧠",
        "رائع! لقد فهمت الفكرة تماماً 🌟",
        "إجابة شاملة ومتكاملة! 📚",
        "برافو! هذه الإجابة تستحق التقدير 🏆",
        "إجابة مدروسة بعناية! 💡",
        "ممتاز! لقد تجاوزت التوقعات 🚀",
        "إجابة دقيقة ومفصلة! ✅"
    ];
    return praises[Math.floor(Math.random() * praises.length)];
}

function getAssessment(score) {
    if (score >= 95) return "متميز 🏆 (مستوى خبير)";
    if (score >= 85) return "ممتاز ⭐⭐⭐⭐ (مستوى متقدم)";
    if (score >= 75) return "جيد جداً ⭐⭐⭐ (مستوى فوق المتوسط)";
    if (score >= 65) return "جيد ⭐⭐ (مستوى متوسط)";
    if (score >= 50) return "مقبول ⭐ (يحتاج تحسين)";
    return "ضعيف ⚠️ (يحتاج مراجعة شاملة)";
}

function cleanOCRText(text) {
    // تنظيف النص المستخرج من OCR
    return text
        .replace(/\s+/g, ' ')
        .replace(/[|]/g, 'I')
        .replace(/[l]/g, 'I')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[^\u0600-\u06FF\u0750-\u077Fa-zA-Z0-9\s.,!?،؛:()-]/g, '')
        .trim();
}

function assessOCRQuality(text) {
    // تقييم جودة النص المستخرج
    const lines = text.split('\n');
    const avgLineLength = lines.reduce((sum, line) => sum + line.length, 0) / lines.length;
    const wordCount = text.split(/\s+/).length;
    
    let score = 5;
    
    if (avgLineLength > 20 && avgLineLength < 80) score += 2;
    if (wordCount > 50) score += 2;
    
    // نسبة الحروف العربية
    const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
    const arabicRatio = arabicChars / text.length;
    if (arabicRatio > 0.7) score += 1;
    
    return Math.min(10, score);
}

function createProgressBar(progress, length = 20) {
    const filled = Math.round((progress / 100) * length);
    const empty = length - filled;
    
    const filledChar = '█';
    const emptyChar = '░';
    
    return filledChar.repeat(filled) + emptyChar.repeat(empty);
}

function splitMessage(text, maxLength) {
    const chunks = [];
    let currentChunk = '';
    
    const lines = text.split('\n');
    
    for (const line of lines) {
        if (currentChunk.length + line.length + 1 <= maxLength) {
            currentChunk += line + '\n';
        } else {
            if (currentChunk) chunks.push(currentChunk);
            currentChunk = line + '\n';
        }
    }
    
    if (currentChunk) chunks.push(currentChunk);
    
    return chunks;
}

function timeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'الآن';
    if (minutes < 60) return `منذ ${minutes} دقيقة`;
    if (hours < 24) return `منذ ${hours} ساعة`;
    if (days < 7) return `منذ ${days} يوم`;
    
    return new Date(timestamp).toLocaleDateString('ar-EG');
}

function getProgressMessage(level) {
    const messages = [
        "مبتدئ - واصل التعلم!",
        "متعلم نشط - استمر في التقدم",
        "متوسط المستوى - أنت على الطريق الصحيح",
        "فوق المتوسط - أداء جيد",
        "متقدم - مهارات ممتازة",
        "خبير - مستوى رائع",
        "متميز - إنجاز استثنائي"
    ];
    
    return messages[Math.min(level, messages.length - 1)];
}

function suggestGoals(stats) {
    const goals = [];
    
    if (stats.totalExams < 5) {
        goals.push("أكمل 5 امتحانات لترى تقدمك بوضوح");
    }
    
    if (stats.averageScore < 70) {
        goals.push("احرز متوسط 70% في الامتحانات القادمة");
    }
    
    if (stats.weaknesses.length > 0) {
        goals.push(`ركز على تحسين: ${stats.weaknesses[0]}`);
    }
    
    if (stats.totalExams >= 10 && stats.averageScore >= 80) {
        goals.push("جرب مستوى الصعوبة المتقدم");
    }
    
    goals.push("شارك نتائجك مع أصدقائك للمنافسة");
    
    return goals.slice(0, 3);
}

async function generateAnalysisSummary(analysis) {
    let summary = `📊 **ملخص التحليل الذكي**\n\n`;
    
    summary += `📝 **المعلومات الأساسية:**\n`;
    summary += `• عدد الكلمات: ${analysis.metadata.wordCount}\n`;
    summary += `• عدد الجمل: ${analysis.metadata.sentenceCount}\n`;
    summary += `• اللغة: ${analysis.metadata.language === 'arabic' ? 'العربية' : 'الإنجليزية'}\n\n`;
    
    summary += `🔑 **الكلمات المفتاحية الرئيسية:**\n`;
    analysis.content.keywords.slice(0, 5).forEach((kw, index) => {
        summary += `${index + 1}. ${kw.word} (أهمية: ${kw.importance.toFixed(1)}/10)\n`;
    });
    
    summary += `\n🎯 **المفاهيم المكتشفة:**\n`;
    if (analysis.content.concepts && analysis.content.concepts.length > 0) {
        analysis.content.concepts.slice(0, 3).forEach((concept, index) => {
            summary += `${index + 1}. ${concept}\n`;
        });
    } else {
        summary += `تم اكتشاف ${analysis.content.keywords.length} مصطلحاً مهماً\n`;
    }
    
    summary += `\n📈 **مستوى الصعوبة:**\n`;
    summary += `• التقييم: ${analysis.difficulty.level}\n`;
    summary += `• الدرجة: ${analysis.difficulty.score}/10\n`;
    
    if (analysis.difficulty.recommendations.length > 0) {
        summary += `\n💡 **توصيات مخصصة:**\n`;
        analysis.difficulty.recommendations.forEach((rec, index) => {
            summary += `${index + 1}. ${rec}\n`;
        });
    }
    
    return summary;
}

// ====================
// 🚀 تشغيل البوت
// ====================

bot.launch({
    dropPendingUpdates: true,
    allowedUpdates: ['message', 'callback_query']
})
.then(() => {
    console.log('🤖 البوت الذكي للامتحانات يعمل الآن...');
    console.log('📁 التخزين: يتم حفظ جميع البيانات في Telegram');
    console.log('🧠 الذكاء: نظام ذكي متقدم للتحليل وتوليد الأسئلة');
    console.log('👥 المستخدمون النشطون:', userSessions.size);
})
.catch((error) => {
    console.error('❌ خطأ في تشغيل البوت:', error);
});

// تنظيف الجلسات القديمة كل ساعة
setInterval(() => {
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 ساعة
    userSessions.forEach((session, userId) => {
        if (session.stats.lastActive < cutoffTime) {
            userSessions.delete(userId);
        }
    });
}, 60 * 60 * 1000);

// معالجة إغلاق البوت
process.once('SIGINT', () => {
    console.log('🛑 إيقاف البوت...');
    bot.stop('SIGINT');
    
    // حفظ الجلسات قبل الإغلاق
    console.log('💾 حفظ الجلسات الحالية...');
    // يمكن إضافة منطق لحفظ الجلسات هنا
    process.exit(0);
});

process.once('SIGTERM', () => {
    console.log('🛑 إيقاف البوت...');
    bot.stop('SIGTERM');
    process.exit(0);
});
