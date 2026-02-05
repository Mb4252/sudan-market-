const express = require('express');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const admin = require('firebase-admin');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');
const moment = require('moment');
const { OpenAI } = require('openai'); // سنستخدم OpenAI Client لأن DeepSeek متوافق معه
const socketIO = require('socket.io');
const { Telegraf } = require('telegraf');
const http = require('http');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const port = process.env.PORT || 10000;
const BOT_URL = process.env.BOT_URL || 'https://sdm-security-bot.onrender.com';

// ==================== [ تهيئة المفاتيح ] ====================
let CONFIG = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '',
    TELEGRAM_ADMIN_CHAT_ID: process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHAT_ID || '',
    TELEGRAM_NOTIFICATIONS_CHAT_ID: process.env.TELEGRAM_NOTIFICATIONS_CHAT_ID || process.env.TELEGRAM_CHAT_ID || '',
    TELEGRAM_STORAGE_CHANNEL: process.env.TELEGRAM_STORAGE_CHANNEL || process.env.TELEGRAM_CHAT_ID || '',
    FIREBASE_JSON: process.env.FIREBASE_ADMIN_JSON ? JSON.parse(process.env.FIREBASE_ADMIN_JSON) : {},
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '', // تغيير من OPENAI_API_KEY إلى DEEPSEEK_API_KEY
    ADMIN_ID: process.env.ADMIN_ID || '',
    ADMIN_BANK_ACCOUNT: "4426148",
    ADMIN_NAME: "محمد عبدالمعطي علي",
    WEEKLY_SUBSCRIPTION: 7000,
    TEACHER_MONTHLY_FEE: 30000,
    FREE_TRIAL_DAYS: 1,
    FREE_TEACHER_MONTHS: 1,
    MAX_DAILY_QUESTIONS: 100,
    STORAGE_MODE: "TELEGRAM_AND_SERVER",
    MAX_FILE_SIZE: 50 * 1024 * 1024,
    AUTO_DELETE_LOCAL_AFTER_UPLOAD: false
};

// ==================== [ تهيئة بوت Telegram ] ====================
// ... [نفس الكود السابق لتهيئة Telegram bot] ...

// ==================== [ تهيئة DeepSeek API ] ====================
let deepseekClient = null;
if (CONFIG.DEEPSEEK_API_KEY) {
    try {
        // استخدام OpenAI client مع DeepSeek API
        deepseekClient = new OpenAI({
            apiKey: CONFIG.DEEPSEEK_API_KEY,
            baseURL: 'https://api.deepseek.com/v1' // تغيير baseURL إلى DeepSeek
        });
        console.log('✅ DeepSeek API initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize DeepSeek API:', error.message);
    }
} else {
    console.log('⚠️ DeepSeek API Key not provided - AI features disabled');
}

// ... [بقية الكود يبقى كما هو حتى قسم دوال AI] ...

// ==================== [ نقاط نهاية الذكاء الاصطناعي المحدثة ] ====================

// 1. إنشاء اختبار ذكي باستخدام DeepSeek
app.post('/api/ai/generate-quiz', async (req, res) => {
    try {
        const { subject, grade, questionCount = 10, questionTypes = ['mcq'], difficulty = 'medium' } = req.body;
        
        if (!subject || !grade) {
            return res.status(400).json({ 
                success: false, 
                error: 'المادة والصف الدراسي مطلوبان',
                baseUrl: BOT_URL
            });
        }
        
        // إذا كان DeepSeek غير مفعل، نستخدم أسئلة وهمية
        if (!deepseekClient) {
            const mockQuiz = generateMockQuiz(subject, grade, questionCount, questionTypes, difficulty);
            return res.json({
                success: true,
                baseUrl: BOT_URL,
                quiz: mockQuiz,
                instructions: 'أجب على جميع الأسئلة في الوقت المحدد',
                timeLimit: 1800,
                note: 'Mock quiz (DeepSeek not configured)'
            });
        }
        
        // استخدام DeepSeek لإنشاء اختبار حقيقي
        const quiz = await generateDeepSeekQuiz(subject, grade, questionCount, questionTypes, difficulty);
        
        res.json({
            success: true,
            baseUrl: BOT_URL,
            quiz: quiz,
            instructions: 'أجب على جميع الأسئلة في الوقت المحدد',
            timeLimit: 1800,
            aiProvider: 'DeepSeek'
        });
        
    } catch (error) {
        console.error('Error generating quiz:', error);
        // في حالة الخطأ، نعود للأسئلة الوهمية
        const mockQuiz = generateMockQuiz(
            req.body.subject || 'عام', 
            req.body.grade || 'عام', 
            10, 
            ['mcq'],
            req.body.difficulty || 'medium'
        );
        res.json({
            success: true,
            baseUrl: BOT_URL,
            quiz: mockQuiz,
            instructions: 'أجب على جميع الأسئلة في الوقت المحدد',
            timeLimit: 1800,
            note: 'Fallback to mock quiz',
            aiProvider: 'Mock'
        });
    }
});

// 2. مساعد AI للأسئلة العامة
app.post('/api/ai/ask', async (req, res) => {
    try {
        const { question, userId, subject, grade } = req.body;
        
        if (!question) {
            return res.status(400).json({ 
                success: false, 
                error: 'السؤال مطلوب',
                baseUrl: BOT_URL
            });
        }
        
        // التحقق من الحد اليومي
        const canAsk = await checkDailyLimit(userId);
        if (!canAsk.allowed) {
            return res.status(429).json({
                success: false,
                error: `تجاوزت الحد اليومي. يتبقى ${canAsk.remaining} سؤال اليوم`,
                baseUrl: BOT_URL
            });
        }
        
        let response;
        
        if (deepseekClient) {
            // استخدام DeepSeek للإجابة
            response = await askDeepSeek(question, subject, grade);
        } else {
            // استخدام رد افتراضي
            response = {
                answer: "أنا مساعد DeepSeek التعليمي. حالياً أنا في وضع التجربة. يمكنني الإجابة على أسئلتك التعليمية في مختلف المجالات.",
                isEducational: true,
                subject: subject || 'عام',
                grade: grade || 'جميع المراحل',
                source: 'mock'
            };
        }
        
        // تحديث الاستخدام اليومي
        if (userId) {
            await updateDailyUsage(userId);
        }
        
        res.json({
            success: true,
            baseUrl: BOT_URL,
            question: question,
            answer: response.answer,
            metadata: {
                subject: response.subject,
                grade: response.grade,
                isEducational: response.isEducational,
                aiProvider: deepseekClient ? 'DeepSeek' : 'Mock',
                remainingQuestions: canAsk.remaining - 1,
                timestamp: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('Error in AI ask:', error);
        res.status(500).json({ 
            success: false, 
            error: 'حدث خطأ في معالجة السؤال',
            baseUrl: BOT_URL
        });
    }
});

// 3. شرح مفهوم تعليمي
app.post('/api/ai/explain', async (req, res) => {
    try {
        const { concept, level = 'intermediate', language = 'ar' } = req.body;
        
        if (!concept) {
            return res.status(400).json({ 
                success: false, 
                error: 'المفهوم المطلوب شرحه مطلوب',
                baseUrl: BOT_URL
            });
        }
        
        let explanation;
        
        if (deepseekClient) {
            explanation = await explainWithDeepSeek(concept, level, language);
        } else {
            explanation = {
                concept: concept,
                explanation: `شرح مبسط لمفهوم ${concept}: هذا مفهوم تعليمي مهم. يمكنني تقديم شرح مفصل عنه عندما يكون نظام الذكاء الاصطناعي نشطاً.`,
                examples: [
                    `مثال 1 على ${concept}`,
                    `مثال 2 على ${concept}`
                ],
                keyPoints: [
                    `النقطة الأساسية 1 حول ${concept}`,
                    `النقطة الأساسية 2 حول ${concept}`
                ],
                level: level,
                language: language,
                source: 'mock'
            };
        }
        
        res.json({
            success: true,
            baseUrl: BOT_URL,
            explanation: explanation,
            aiProvider: deepseekClient ? 'DeepSeek' : 'Mock'
        });
        
    } catch (error) {
        console.error('Error explaining concept:', error);
        res.status(500).json({ 
            success: false, 
            error: 'حدث خطأ في شرح المفهوم',
            baseUrl: BOT_URL
        });
    }
});

// 4. حل مسألة رياضية
app.post('/api/ai/solve-math', async (req, res) => {
    try {
        const { problem, steps = true, grade = 'high school' } = req.body;
        
        if (!problem) {
            return res.status(400).json({ 
                success: false, 
                error: 'المسألة الرياضية مطلوبة',
                baseUrl: BOT_URL
            });
        }
        
        let solution;
        
        if (deepseekClient) {
            solution = await solveMathWithDeepSeek(problem, steps, grade);
        } else {
            solution = {
                problem: problem,
                solution: `حل المسألة الرياضية: ${problem}. الحل سيكون متاحاً عند تفعيل نظام الذكاء الاصطناعي.`,
                steps: steps ? [
                    'الخطوة 1: فهم المعطيات',
                    'الخطوة 2: تطبيق القانون المناسب',
                    'الخطوة 3: إجراء الحسابات',
                    'الخطوة 4: التحقق من النتيجة'
                ] : [],
                grade: grade,
                subject: 'رياضيات',
                source: 'mock'
            };
        }
        
        res.json({
            success: true,
            baseUrl: BOT_URL,
            problem: problem,
            solution: solution,
            aiProvider: deepseekClient ? 'DeepSeek' : 'Mock'
        });
        
    } catch (error) {
        console.error('Error solving math problem:', error);
        res.status(500).json({ 
            success: false, 
            error: 'حدث خطأ في حل المسألة',
            baseUrl: BOT_URL
        });
    }
});

// 5. تلخيص نص تعليمي
app.post('/api/ai/summarize', async (req, res) => {
    try {
        const { text, length = 'medium', language = 'ar' } = req.body;
        
        if (!text || text.length < 10) {
            return res.status(400).json({ 
                success: false, 
                error: 'النص المطلوب تلخيصه قصير جداً',
                baseUrl: BOT_URL
            });
        }
        
        let summary;
        
        if (deepseekClient) {
            summary = await summarizeWithDeepSeek(text, length, language);
        } else {
            summary = {
                originalLength: text.length,
                summary: `ملخص النص: هذا نص تعليمي يحتاج إلى تلخيص. يمكنني تقديم ملخص مفصل عندما يكون نظام الذكاء الاصطناعي نشطاً.`,
                keyPoints: [
                    'النقطة الرئيسية 1',
                    'النقطة الرئيسية 2',
                    'النقطة الرئيسية 3'
                ],
                length: length,
                language: language,
                source: 'mock'
            };
        }
        
        res.json({
            success: true,
            baseUrl: BOT_URL,
            originalText: text.substring(0, 100) + '...',
            summary: summary,
            aiProvider: deepseekClient ? 'DeepSeek' : 'Mock'
        });
        
    } catch (error) {
        console.error('Error summarizing text:', error);
        res.status(500).json({ 
            success: false, 
            error: 'حدث خطأ في تلخيص النص',
            baseUrl: BOT_URL
        });
    }
});

// ==================== [ دوال DeepSeek المساعدة ] ====================

async function generateDeepSeekQuiz(subject, grade, questionCount, questionTypes, difficulty = 'medium') {
    try {
        const prompt = `أنت مساعد تعليمي متخصص في إنشاء اختبارات تعليمية باللغة العربية.
        
        المهمة: أنشئ اختباراً تعليمياً يتكون من ${questionCount} سؤالاً.
        
        التفاصيل:
        - المادة: ${subject}
        - الصف الدراسي: ${grade}
        - مستوى الصعوبة: ${difficulty}
        - أنواع الأسئلة: ${questionTypes.join(', ')}
        
        المتطلبات:
        1. جميع الأسئلة باللغة العربية الفصحى
        2. الأسئلة مناسبة للمستوى التعليمي المحدد
        3. لكل سؤال اختيارات متعددة (4 خيارات لكل سؤال)
        4. حدد الإجابة الصحيحة
        5. قدم شرحاً مختصراً لكل إجابة
        
        أرجو الرد بتنسيق JSON فقط بالهيكل التالي:
        {
            "quizTitle": "عنوان الاختبار",
            "subject": "${subject}",
            "grade": "${grade}",
            "difficulty": "${difficulty}",
            "questions": [
                {
                    "question": "نص السؤال",
                    "type": "mcq",
                    "options": ["الخيار 1", "الخيار 2", "الخيار 3", "الخيار 4"],
                    "correctAnswer": 0,
                    "explanation": "شرح الإجابة الصحيحة"
                }
            ]
        }`;
        
        const response = await deepseekClient.chat.completions.create({
            model: "deepseek-chat",
            messages: [
                { 
                    role: "system", 
                    content: "أنت مساعد تعليمي عربي متخصص في إنشاء اختبارات تعليمية دقيقة ومناسبة للمستوى التعليمي. تجيب دائماً بتنسيق JSON فقط." 
                },
                { role: "user", content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 3000,
            response_format: { type: "json_object" }
        });
        
        const quizContent = JSON.parse(response.choices[0].message.content);
        
        return {
            quizId: `quiz_deepseek_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
            title: quizContent.quizTitle || `اختبار ${subject} - الصف ${grade}`,
            subject: quizContent.subject || subject,
            grade: quizContent.grade || grade,
            difficulty: quizContent.difficulty || difficulty,
            questions: quizContent.questions || [],
            totalQuestions: questionCount,
            timeLimit: 1800,
            createdAt: Date.now(),
            source: 'deepseek',
            aiModel: 'deepseek-chat'
        };
        
    } catch (error) {
        console.error('DeepSeek quiz generation error:', error);
        // العودة للأسئلة الوهمية
        return generateMockQuiz(subject, grade, questionCount, questionTypes, difficulty);
    }
}

async function askDeepSeek(question, subject, grade) {
    try {
        const context = subject && grade ? 
            `السؤال في مادة ${subject} للصف ${grade}.` : 
            'هذا سؤال تعليمي عام.';
        
        const prompt = `أنت مساعد تعليمي عربي ذكي في منصة تعليمية.
        
        ${context}
        
        السؤال: ${question}
        
        المطلوب:
        1. قدم إجابة تعليمية واضحة ودقيقة
        2. إذا كان السؤال يحتاج خطوات، قدمها مرتبة
        3. إذا كان هناك مفاهيم مهمة، اشرحها
        4. استخدم اللغة العربية الفصحى المناسبة للطلاب
        5. كن مفيداً وتعليمياً
        
        أجب بشكل مباشر ومفيد.`;
        
        const response = await deepseekClient.chat.completions.create({
            model: "deepseek-chat",
            messages: [
                { 
                    role: "system", 
                    content: "أنت مساعد تعليمي عربي ذكي في منصة تعليمية. هدفك مساعدة الطلاب في فهم المواد التعليمية وإجابة أسئلتهم بدقة ووضوح." 
                },
                { role: "user", content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 1500
        });
        
        return {
            answer: response.choices[0].message.content,
            isEducational: true,
            subject: subject || 'عام',
            grade: grade || 'جميع المراحل',
            source: 'deepseek'
        };
        
    } catch (error) {
        console.error('DeepSeek ask error:', error);
        throw error;
    }
}

async function explainWithDeepSeek(concept, level, language) {
    try {
        const prompt = `أنت مساعد تعليمي عربي متخصص في شرح المفاهيم.
        
        المفهوم: ${concept}
        المستوى: ${level}
        اللغة: ${language}
        
        قدم شرحاً تعليمياً يتضمن:
        1. تعريف المفهوم
        2. أمثلة توضيحية
        3. النقاط الرئيسية
        4. أهمية المفهوم
        
        كن واضحاً ومناسباً للمستوى المحدد.`;
        
        const response = await deepseekClient.chat.completions.create({
            model: "deepseek-chat",
            messages: [
                { 
                    role: "system", 
                    content: "أنت خبير تعليمي عربي في شرح المفاهيم العلمية والأدبية. تشرح بطريقة مبسطة ومنظمة." 
                },
                { role: "user", content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 2000
        });
        
        const content = response.choices[0].message.content;
        
        return {
            concept: concept,
            explanation: content,
            examples: extractExamples(content),
            keyPoints: extractKeyPoints(content),
            level: level,
            language: language,
            source: 'deepseek'
        };
        
    } catch (error) {
        console.error('DeepSeek explain error:', error);
        throw error;
    }
}

async function solveMathWithDeepSeek(problem, steps, grade) {
    try {
        const prompt = `أنت مساعد رياضيات عربي متخصص في حل المسائل.
        
        المسألة: ${problem}
        الصف: ${grade}
        عرض الخطوات: ${steps ? 'نعم' : 'لا'}
        
        ${steps ? 'قدم الحل مع عرض جميع الخطوات التفصيلية.' : 'قدم الحل النهائي فقط.'}
        
        تأكد من:
        1. الحل الرياضي الصحيح
        2. الوضوح في الشرح
        3. المناسبة للمستوى التعليمي`;
        
        const response = await deepseekClient.chat.completions.create({
            model: "deepseek-chat",
            messages: [
                { 
                    role: "system", 
                    content: "أنت أستاذ رياضيات عربي متخصص في حل المسائل الرياضية بجميع مستويات الصعوبة." 
                },
                { role: "user", content: prompt }
            ],
            temperature: 0.3, // درجة حرارة منخفضة للحلول الرياضية الدقيقة
            max_tokens: 2000
        });
        
        const content = response.choices[0].message.content;
        
        return {
            problem: problem,
            solution: content,
            steps: steps ? extractSteps(content) : [],
            grade: grade,
            subject: 'رياضيات',
            source: 'deepseek'
        };
        
    } catch (error) {
        console.error('DeepSeek math solve error:', error);
        throw error;
    }
}

async function summarizeWithDeepSeek(text, length, language) {
    try {
        const lengthMap = {
            'short': 'ملخص مختصر جداً (2-3 جمل)',
            'medium': 'ملخص متوسط (فقرتين)',
            'long': 'ملخص مفصل (عدة فقرات)'
        };
        
        const prompt = `أنت مساعد تعليمي عربي متخصص في تلخيص النصوص.
        
        النص: ${text.substring(0, 4000)} // تقييد الطول
        
        المطلوب: ${lengthMap[length] || lengthMap.medium}
        
        قدم:
        1. الملخَّص الرئيسي
        2. النقاط الرئيسية
        3. الاستنتاجات المهمة
        
        حافظ على الدقة التعليمية.`;
        
        const response = await deepseekClient.chat.completions.create({
            model: "deepseek-chat",
            messages: [
                { 
                    role: "system", 
                    content: "أنت مختص في تلخيص النصوص التعليمية العربية مع الحفاظ على المضمون العلمي والدقة." 
                },
                { role: "user", content: prompt }
            ],
            temperature: 0.5,
            max_tokens: 1000
        });
        
        const content = response.choices[0].message.content;
        
        return {
            originalLength: text.length,
            summary: content,
            keyPoints: extractKeyPoints(content),
            length: length,
            language: language,
            source: 'deepseek'
        };
        
    } catch (error) {
        console.error('DeepSeek summarize error:', error);
        throw error;
    }
}

// ==================== [ دوال مساعدة للتحليل ] ====================

function extractExamples(text) {
    const examplePatterns = [
        /مثال[:\s]\s*(.*?)(?=\n|$)/gi,
        /على سبيل المثال[:\s]\s*(.*?)(?=\n|$)/gi,
        /مثلاً[:\s]\s*(.*?)(?=\n|$)/gi
    ];
    
    const examples = [];
    
    for (const pattern of examplePatterns) {
        const matches = [...text.matchAll(pattern)];
        matches.forEach(match => {
            if (match[1] && match[1].trim()) {
                examples.push(match[1].trim());
            }
        });
    }
    
    return examples.slice(0, 3); // الحد الأقصى 3 أمثلة
}

function extractKeyPoints(text) {
    const keyPointPatterns = [
        /\d+\.\s*(.*?)(?=\n|$)/g, // 1. النقطة
        /-\s*(.*?)(?=\n|$)/g,    // - النقطة
        /•\s*(.*?)(?=\n|$)/g,    // • النقطة
        /أولاً[:\s]\s*(.*?)(?=\n|$)/gi,
        /ثانياً[:\s]\s*(.*?)(?=\n|$)/gi,
        /ثالثاً[:\s]\s*(.*?)(?=\n|$)/gi
    ];
    
    const keyPoints = new Set();
    
    for (const pattern of keyPointPatterns) {
        const matches = [...text.matchAll(pattern)];
        matches.forEach(match => {
            if (match[1] && match[1].trim()) {
                keyPoints.add(match[1].trim());
            }
        });
    }
    
    // إذا لم نجد نقاط مرقمة، نقسم النص إلى جمل
    if (keyPoints.size === 0) {
        const sentences = text.split(/[.!؟]\s+/).filter(s => s.length > 10);
        sentences.slice(0, 5).forEach(sentence => {
            keyPoints.add(sentence.trim());
        });
    }
    
    return Array.from(keyPoints).slice(0, 5); // الحد الأقصى 5 نقاط
}

function extractSteps(text) {
    const stepPatterns = [
        /الخطوة\s+\d+[:\s]\s*(.*?)(?=\n|$)/gi,
        /خطوة\s+\d+[:\s]\s*(.*?)(?=\n|$)/gi,
        /\d+[\.\)]\s*(.*?)(?=\n|$)/g
    ];
    
    const steps = [];
    
    for (const pattern of stepPatterns) {
        const matches = [...text.matchAll(pattern)];
        matches.forEach(match => {
            if (match[1] && match[1].trim()) {
                steps.push(match[1].trim());
            }
        });
    }
    
    return steps.length > 0 ? steps : ['الخطوات غير محددة بوضوح في النص'];
}

// ==================== [ إدارة الاستخدام اليومي ] ====================

async function checkDailyLimit(userId) {
    if (!userId) {
        return { allowed: true, remaining: CONFIG.MAX_DAILY_QUESTIONS };
    }
    
    if (!isFirebaseInitialized) {
        return { allowed: true, remaining: CONFIG.MAX_DAILY_QUESTIONS };
    }
    
    try {
        const db = admin.database();
        const today = new Date().toISOString().split('T')[0];
        const dailyKey = `ai_questions_${userId}_${today}`;
        
        const snapshot = await db.ref(`ai_usage/${dailyKey}`).once('value');
        const dailyUsage = snapshot.val() || { count: 0 };
        
        const remaining = Math.max(0, CONFIG.MAX_DAILY_QUESTIONS - dailyUsage.count);
        
        return {
            allowed: remaining > 0,
            remaining: remaining,
            usedToday: dailyUsage.count,
            limit: CONFIG.MAX_DAILY_QUESTIONS
        };
        
    } catch (error) {
        console.error('Error checking daily limit:', error);
        return { allowed: true, remaining: CONFIG.MAX_DAILY_QUESTIONS };
    }
}

async function updateDailyUsage(userId) {
    if (!userId || !isFirebaseInitialized) return;
    
    try {
        const db = admin.database();
        const today = new Date().toISOString().split('T')[0];
        const dailyKey = `ai_questions_${userId}_${today}`;
        
        const snapshot = await db.ref(`ai_usage/${dailyKey}`).once('value');
        const dailyUsage = snapshot.val() || { count: 0, userId: userId };
        
        await db.ref(`ai_usage/${dailyKey}`).set({
            count: dailyUsage.count + 1,
            lastUsed: Date.now(),
            userId: userId
        });
        
    } catch (error) {
        console.error('Error updating daily usage:', error);
    }
}

// ==================== [ تحديث صفحة البداية ] ====================

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Smart Education Platform with DeepSeek</title>
            <meta charset="UTF-8">
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
                .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
                .status { padding: 15px; margin: 10px 0; border-radius: 5px; }
                .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
                .warning { background: #fff3cd; color: #856404; border: 1px solid #ffeaa7; }
                .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
                .endpoint { background: #f8f9fa; padding: 10px; margin: 5px 0; border-left: 4px solid #3498db; }
                code { background: #e9ecef; padding: 2px 5px; border-radius: 3px; }
                a { color: #3498db; text-decoration: none; }
                a:hover { text-decoration: underline; }
                .ai-feature { background: #e8f4fc; padding: 10px; margin: 10px 0; border-radius: 5px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🤖 Smart Education Platform with DeepSeek AI</h1>
                <p><strong>Version 4.0.0</strong> - DeepSeek AI Integration</p>
                <p><strong>Base URL:</strong> ${BOT_URL}</p>
                
                <div class="status ${deepseekClient ? 'success' : 'warning'}">
                    <strong>DeepSeek AI:</strong> ${deepseekClient ? '✅ Connected' : '⚠️ Mock Mode'}
                </div>
                
                <div class="status ${telegramBot ? 'success' : 'error'}">
                    <strong>Telegram Storage:</strong> ${telegramBot ? '✅ Connected' : '❌ Disconnected'}
                </div>
                
                <h2>🧠 DeepSeek AI Features</h2>
                
                <div class="ai-feature">
                    <h3>📝 Quiz Generation</h3>
                    <p>Generate intelligent quizzes using DeepSeek AI</p>
                    <code>POST ${BOT_URL}/api/ai/generate-quiz</code>
                </div>
                
                <div class="ai-feature">
                    <h3>❓ Ask Questions</h3>
                    <p>Ask any educational question to DeepSeek AI</p>
                    <code>POST ${BOT_URL}/api/ai/ask</code>
                </div>
                
                <div class="ai-feature">
                    <h3>📚 Explain Concepts</h3>
                    <p>Get detailed explanations of educational concepts</p>
                    <code>POST ${BOT_URL}/api/ai/explain</code>
                </div>
                
                <div class="ai-feature">
                    <h3>🔢 Solve Math Problems</h3>
                    <p>Step-by-step math problem solving</p>
                    <code>POST ${BOT_URL}/api/ai/solve-math</code>
                </div>
                
                <div class="ai-feature">
                    <h3>📄 Text Summarization</h3>
                    <p>Summarize educational texts</p>
                    <code>POST ${BOT_URL}/api/ai/summarize</code>
                </div>
                
                <h2>📊 Daily Limits</h2>
                <p>Each user can ask up to <strong>${CONFIG.MAX_DAILY_QUESTIONS} questions</strong> per day.</p>
                
                <h2>🔗 API Endpoints</h2>
                
                <div class="endpoint">
                    <code>GET ${BOT_URL}/api/test</code> - System status
                </div>
                
                <div class="endpoint">
                    <code>POST ${BOT_URL}/api/ai/ask</code> - Ask DeepSeek AI
                </div>
                
                <div class="endpoint">
                    <code>POST ${BOT_URL}/api/ai/explain</code> - Explain concepts
                </div>
                
                <div class="endpoint">
                    <code>POST ${BOT_URL}/api/ai/solve-math</code> - Solve math problems
                </div>
                
                <div class="endpoint">
                    <code>POST ${BOT_URL}/api/ai/summarize</code> - Summarize text
                </div>
                
                <div class="endpoint">
                    <code>GET ${BOT_URL}/api/books</code> - Get educational books
                </div>
                
                <h2>📚 Test DeepSeek</h2>
                <p>Try these example questions:</p>
                <ul>
                    <li>"ما هو قانون نيوتن الأول؟"</li>
                    <li>"اشرح عملية البناء الضوئي"</li>
                    <li:"حل المعادلة: 2س + 5 = 15"</li>
                    <li>"لخّص أهمية الثورة الصناعية"</li>
                </ul>
                
                <p><strong>AI Provider:</strong> DeepSeek Chat</p>
                <p><strong>Language:</strong> Arabic (Primary)</p>
                <p><strong>Mode:</strong> ${deepseekClient ? 'Real AI' : 'Mock Mode'}</p>
            </div>
        </body>
        </html>
    `);
});

// ==================== [ تحديث رسالة بدء التشغيل ] ====================
server.listen(port, '0.0.0.0', () => {
    console.log(`
    🚀 Smart Education Platform Server v4.0
    🔗 Running on port: ${port}
    📡 Local: http://localhost:${port}
    🌐 Public: ${BOT_URL}
    
    🧠 DEEPSEEK AI SYSTEM:
    • Status: ${deepseekClient ? '✅ Connected' : '⚠️ Mock Mode'}
    • Model: deepseek-chat
    • Daily Limit: ${CONFIG.MAX_DAILY_QUESTIONS} questions/user
    • Features: Quiz, Q&A, Explanations, Math, Summarization
    
    📊 STORAGE SYSTEM:
    • Telegram: ${telegramBot ? '✅ Active' : '❌ Disabled'}
    • Local Server: ✅ Active
    • Firebase: ${isFirebaseInitialized ? '✅ Metadata only' : '❌ Disabled'}
    
    🎯 AI ENDPOINTS:
    • Ask Question: POST ${BOT_URL}/api/ai/ask
    • Generate Quiz: POST ${BOT_URL}/api/ai/generate-quiz
    • Explain Concept: POST ${BOT_URL}/api/ai/explain
    • Solve Math: POST ${BOT_URL}/api/ai/solve-math
    • Summarize Text: POST ${BOT_URL}/api/ai/summarize
    
    📚 Total Books: ${getAllEducationalBooks().length}
    
    🔗 Health Check: ${BOT_URL}/health
    🎯 API Test: ${BOT_URL}/api/test
    `);
});
