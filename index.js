const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { Telegraf } = require('telegraf');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

// إعدادات الوسائط
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// إعداد multer للرفع
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

// إعداد Telegram Bot
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN';
const CHANNEL_ID = process.env.CHANNEL_ID || '-1001234567890';

let bot;
try {
    bot = new Telegraf(BOT_TOKEN);
    console.log('✅ Telegram Bot initialized');
} catch (error) {
    console.log('⚠️ Telegram Bot not configured');
}

// نظام التخزين في Telegram
class TelegramStorage {
    async storeFile(file, metadata = {}) {
        try {
            if (!bot) {
                throw new Error('Telegram bot not configured');
            }

            // تخزين الملف في Telegram
            const message = await bot.telegram.sendDocument(
                CHANNEL_ID,
                { source: file.buffer, filename: file.originalname },
                {
                    caption: JSON.stringify({
                        type: 'file',
                        metadata: metadata,
                        timestamp: new Date().toISOString()
                    }, null, 2)
                }
            );

            return {
                success: true,
                messageId: message.message_id,
                fileId: message.document?.file_id,
                metadata: metadata
            };
        } catch (error) {
            console.error('Telegram storage error:', error);
            return { success: false, error: error.message };
        }
    }

    async storeText(text, metadata = {}) {
        try {
            if (!bot) {
                throw new Error('Telegram bot not configured');
            }

            const message = await bot.telegram.sendMessage(
                CHANNEL_ID,
                `📝 ${metadata.title || 'نص'}\n\n${text}\n\n---\n${JSON.stringify(metadata, null, 2)}`
            );

            return {
                success: true,
                messageId: message.message_id,
                metadata: metadata
            };
        } catch (error) {
            console.error('Telegram text storage error:', error);
            return { success: false, error: error.message };
        }
    }
}

const telegramStorage = new TelegramStorage();

// API لتخزين الملفات
app.post('/api/telegram/store', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'لم يتم رفع أي ملف' });
        }

        const metadata = req.body.metadata ? JSON.parse(req.body.metadata) : {};
        metadata.userId = req.body.userId;

        const result = await telegramStorage.storeFile(req.file, metadata);

        if (result.success) {
            res.json(result);
        } else {
            res.status(500).json(result);
        }
    } catch (error) {
        console.error('Store API error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API لتخزين النصوص
app.post('/api/telegram/store-text', async (req, res) => {
    try {
        const { text, type, metadata, userId } = req.body;

        if (!text) {
            return res.status(400).json({ success: false, error: 'النص مطلوب' });
        }

        const fullMetadata = {
            ...metadata,
            type: type || 'text',
            userId: userId,
            timestamp: new Date().toISOString()
        };

        const result = await telegramStorage.storeText(text, fullMetadata);

        if (result.success) {
            res.json(result);
        } else {
            res.status(500).json(result);
        }
    } catch (error) {
        console.error('Store text API error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API للذكاء الاصطناعي
app.post('/api/ai/generate-quiz', async (req, res) => {
    try {
        const { subject, difficulty, count, userId } = req.body;

        // إنشاء اختبار ذكي
        const quiz = generateSmartQuiz(subject, difficulty, count);

        // تخزين النتيجة
        if (userId) {
            await telegramStorage.storeText(
                `تم إنشاء اختبار ${subject} - مستوى ${difficulty} - ${count} سؤال`,
                {
                    type: 'quiz_generated',
                    subject: subject,
                    difficulty: difficulty,
                    questionCount: count,
                    userId: userId,
                    quizId: quiz.id
                }
            );
        }

        res.json({
            success: true,
            quiz: quiz
        });
    } catch (error) {
        console.error('Generate quiz API error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

function generateSmartQuiz(subject, difficulty, count) {
    const questions = [];
    const difficultyLevels = {
        easy: { min: 1, max: 10, operators: ['+', '-'] },
        medium: { min: 10, max: 50, operators: ['+', '-', '×'] },
        hard: { min: 50, max: 100, operators: ['+', '-', '×', '÷'] }
    };

    const level = difficultyLevels[difficulty] || difficultyLevels.medium;

    for (let i = 1; i <= count; i++) {
        const num1 = Math.floor(Math.random() * (level.max - level.min + 1)) + level.min;
        const num2 = Math.floor(Math.random() * (level.max - level.min + 1)) + level.min;
        const operator = level.operators[Math.floor(Math.random() * level.operators.length)];

        let question, answer;
        
        switch(operator) {
            case '+':
                question = `ما هو ناتج ${num1} + ${num2}؟`;
                answer = num1 + num2;
                break;
            case '-':
                question = `ما هو ناتج ${num1} - ${num2}؟`;
                answer = num1 - num2;
                break;
            case '×':
                question = `ما هو ناتج ${num1} × ${num2}؟`;
                answer = num1 * num2;
                break;
            case '÷':
                const divisor = num2 !== 0 ? num2 : 1;
                question = `ما هو ناتج ${num1 * divisor} ÷ ${divisor}؟`;
                answer = num1;
                break;
        }

        questions.push({
            id: `q${i}`,
            question: question,
            options: generateOptions(answer, level),
            correctAnswer: 0,
            explanation: `${num1} ${operator} ${num2} = ${answer}`,
            difficulty: difficulty,
            subject: subject
        });
    }

    return {
        id: `quiz_${Date.now()}`,
        title: `اختبار ${subject} - مستوى ${difficulty}`,
        subject: subject,
        difficulty: difficulty,
        questions: questions,
        totalQuestions: count,
        estimatedTime: count * 60,
        generatedAt: new Date().toISOString()
    };
}

function generateOptions(correctAnswer, level) {
    const options = [correctAnswer.toString()];
    
    for (let i = 1; i < 4; i++) {
        let wrongAnswer;
        do {
            const offset = Math.floor(Math.random() * 10) + 1;
            const sign = Math.random() > 0.5 ? 1 : -1;
            wrongAnswer = correctAnswer + (offset * sign);
        } while (options.includes(wrongAnswer.toString()) || wrongAnswer < 0);
        
        options.push(wrongAnswer.toString());
    }
    
    // خلط الخيارات
    return shuffleArray(options);
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// API لتحليل النصوص
app.post('/api/ai/analyze', async (req, res) => {
    try {
        const { text } = req.body;

        if (!text || text.length < 10) {
            return res.status(400).json({ 
                success: false, 
                error: 'النص قصير جداً' 
            });
        }

        const analysis = analyzeText(text);

        res.json({
            success: true,
            analysis: analysis
        });
    } catch (error) {
        console.error('Text analysis API error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

function analyzeText(text) {
    const words = text.split(/\s+/).filter(word => word.length > 0);
    const sentences = text.split(/[.!?]+/).filter(sentence => sentence.trim().length > 0);
    const paragraphs = text.split(/\n\s*\n/).filter(para => para.trim().length > 0);

    // استخراج الكلمات المفتاحية
    const stopWords = new Set(['في', 'من', 'إلى', 'على', 'عن', 'أن', 'إن', 'أن', 'هذا', 'هذه', 'ذلك', 'هؤلاء']);
    const wordFreq = {};
    
    words.forEach(word => {
        const cleanWord = word.toLowerCase().replace(/[^\w\u0600-\u06FF]/g, '');
        if (cleanWord.length > 2 && !stopWords.has(cleanWord)) {
            wordFreq[cleanWord] = (wordFreq[cleanWord] || 0) + 1;
        }
    });

    const keywords = Object.entries(wordFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([word, freq]) => ({ word, frequency: freq }));

    // توليد الملخص
    let summary = '';
    if (sentences.length <= 3) {
        summary = text;
    } else {
        summary = sentences.slice(0, 3).join('. ') + '...';
    }

    return {
        metadata: {
            wordCount: words.length,
            sentenceCount: sentences.length,
            paragraphCount: paragraphs.length,
            readingTime: Math.ceil(words.length / 200),
            language: detectLanguage(text)
        },
        keywords: keywords,
        summary: summary
    };
}

function detectLanguage(text) {
    const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
    const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
    
    return arabicChars > englishChars ? 'arabic' : 'english';
}

// API لمعالجة الصور
app.post('/api/ai/process-image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'لم يتم رفع أي صورة' });
        }

        // محاكاة معالجة الصورة
        const result = {
            success: true,
            processed: true,
            message: 'تم معالجة الصورة بنجاح',
            metadata: {
                fileName: req.file.originalname,
                fileSize: req.file.size,
                mimeType: req.file.mimetype,
                dimensions: 'Unknown (simulated)'
            }
        };

        res.json(result);
    } catch (error) {
        console.error('Image processing API error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API لاسترجاع الملفات
app.get('/api/telegram/retrieve', async (req, res) => {
    try {
        const { userId, type, limit } = req.query;

        // محاكاة استرجاع الملفات
        const files = Array.from({ length: Math.min(limit || 5, 10) }, (_, i) => ({
            id: `file_${i}`,
            fileName: `مثال_ملف_${i}.pdf`,
            fileType: 'application/pdf',
            fileSize: Math.floor(Math.random() * 10000000) + 1000000,
            uploadDate: new Date(Date.now() - i * 86400000).toISOString(),
            telegramMessageId: Math.floor(Math.random() * 1000000),
            storageType: 'telegram'
        }));

        res.json({
            success: true,
            files: files,
            total: files.length
        });
    } catch (error) {
        console.error('Retrieve API error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// الصفحة الرئيسية
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Smart Education Platform</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                h1 { color: #3b82f6; }
                .status { background: #10b981; color: white; padding: 10px 20px; border-radius: 10px; display: inline-block; }
            </style>
        </head>
        <body>
            <h1>🚀 منصة التعليم الذكي المتكاملة</h1>
            <p>نظام ذكي للتعليم والتخزين الآمن</p>
            <div class="status">✅ النظام يعمل بشكل طبيعي</div>
            <p style="margin-top: 30px;">API Endpoints:</p>
            <ul style="text-align: left; display: inline-block;">
                <li>POST /api/telegram/store - رفع الملفات</li>
                <li>POST /api/telegram/store-text - تخزين النصوص</li>
                <li>POST /api/ai/generate-quiz - إنشاء اختبار ذكي</li>
                <li>POST /api/ai/analyze - تحليل النصوص</li>
                <li>GET /api/telegram/retrieve - استرجاع الملفات</li>
            </ul>
        </body>
        </html>
    `);
});

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📚 Smart Education Platform v4.0`);
    console.log(`🔗 API Base URL: http://localhost:${PORT}`);
});
