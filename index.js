// ==================== [ 1. إعدادات البوت الذكي ] ====================
class SmartStudentBot {
    constructor() {
        this.initializeBot();
        this.setupEventListeners();
    }
    
    initializeBot() {
        console.log('🤖 البوت الذكي جاهز للعمل');
        this.checkForNewContent();
        this.setupNotifications();
    }
    
    setupEventListeners() {
        // الاستماع لتغييرات في قاعدة البيانات
        if (typeof firebase !== 'undefined') {
            this.listenForNewBooks();
            this.listenForNewLiveRooms();
            this.listenForQuizResults();
            this.listenForPayments();
        }
    }
    
    // ==================== [ 2. مراقبة المحتوى الجديد ] ====================
    listenForNewBooks() {
        const db = firebase.database();
        
        db.ref('books').orderByChild('addedDate').limitToLast(1).on('child_added', (snap) => {
            const book = snap.val();
            if (book && book.status === 'approved') {
                this.sendBookNotification(book);
            }
        });
    }
    
    listenForNewLiveRooms() {
        const db = firebase.database();
        
        db.ref('live_rooms').orderByChild('createdAt').limitToLast(1).on('child_added', (snap) => {
            const room = snap.val();
            if (room && room.status === 'active') {
                this.sendLiveRoomNotification(room);
            }
        });
    }
    
    // ==================== [ 3. إرسال الإشعارات ] ====================
    sendBookNotification(book) {
        const notification = {
            title: '📚 كتاب جديد متاح!',
            message: `تمت إضافة كتاب "${book.title}" في مادة ${book.subject}`,
            type: 'book',
            data: {
                bookId: Object.keys(firebase.database().ref('books').getKey())[0],
                subject: book.subject,
                grade: book.grade
            },
            timestamp: Date.now()
        };
        
        this.showNotification(notification);
        this.saveNotification(notification);
    }
    
    sendLiveRoomNotification(room) {
        const notification = {
            title: '🎥 بث مباشر جديد!',
            message: `غرفة بث مباشر: "${room.title}" مع ${room.teacherName}`,
            type: 'live',
            data: {
                roomId: room.id,
                teacherName: room.teacherName,
                price: room.price
            },
            timestamp: Date.now()
        };
        
        this.showNotification(notification);
        this.saveNotification(notification);
    }
    
    sendQuizNotification(quiz) {
        const notification = {
            title: '📝 نتيجة اختبار جديد!',
            message: `نتيجة اختبار ${quiz.subject}: ${quiz.percentage}%`,
            type: 'quiz',
            data: {
                quizId: quiz.id,
                subject: quiz.subject,
                score: quiz.score,
                percentage: quiz.percentage
            },
            timestamp: Date.now()
        };
        
        this.showNotification(notification);
        this.saveNotification(notification);
    }
    
    sendPaymentNotification(payment) {
        const notification = {
            title: '💳 إشعار دفع',
            message: `تم استلام دفع بقيمة ${payment.amount} ج.س`,
            type: 'payment',
            data: {
                paymentId: payment.id,
                amount: payment.amount,
                status: payment.status
            },
            timestamp: Date.now()
        };
        
        this.showNotification(notification);
        this.saveNotification(notification);
    }
    
    // ==================== [ 4. عرض الإشعارات ] ====================
    showNotification(notification) {
        if (!('Notification' in window)) {
            console.log('هذا المتصفح لا يدعم إشعارات الويب');
            return;
        }
        
        if (Notification.permission === 'granted') {
            this.createBrowserNotification(notification);
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    this.createBrowserNotification(notification);
                }
            });
        }
        
        // عرض إشعار في الواجهة
        this.showInAppNotification(notification);
    }
    
    createBrowserNotification(notification) {
        const options = {
            body: notification.message,
            icon: 'https://cdn-icons-png.flaticon.com/512/4711/4711987.png',
            badge: 'https://cdn-icons-png.flaticon.com/512/4711/4711987.png',
            tag: 'smart_edu_bot',
            requireInteraction: true,
            actions: [
                {
                    action: 'view',
                    title: 'عرض'
                },
                {
                    action: 'dismiss',
                    title: 'تجاهل'
                }
            ]
        };
        
        const notif = new Notification(notification.title, options);
        
        notif.onclick = () => {
            window.focus();
            this.handleNotificationClick(notification);
            notif.close();
        };
        
        setTimeout(() => notif.close(), 10000);
    }
    
    showInAppNotification(notification) {
        // إنشاء عنصر الإشعار في الواجهة
        const notificationElement = document.createElement('div');
        notificationElement.className = 'bot-notification';
        notificationElement.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px 20px;
            border-radius: 10px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: 10000;
            max-width: 300px;
            animation: slideIn 0.3s ease;
            cursor: pointer;
        `;
        
        notificationElement.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <i class="fas fa-robot" style="font-size: 20px;"></i>
                <div>
                    <div style="font-weight: bold; font-size: 14px;">${notification.title}</div>
                    <div style="font-size: 12px; opacity: 0.9;">${notification.message}</div>
                </div>
                <button onclick="this.parentElement.parentElement.remove()" 
                        style="background: none; border: none; color: white; cursor: pointer; margin-right: auto;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        document.body.appendChild(notificationElement);
        
        notificationElement.onclick = () => {
            this.handleNotificationClick(notification);
            notificationElement.remove();
        };
        
        setTimeout(() => {
            if (notificationElement.parentNode) {
                notificationElement.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => notificationElement.remove(), 300);
            }
        }, 5000);
    }
    
    // ==================== [ 5. معالجة الإشعارات ] ====================
    handleNotificationClick(notification) {
        switch(notification.type) {
            case 'book':
                if (typeof nav === 'function') {
                    nav('book_detail', notification.data.bookId);
                }
                break;
                
            case 'live':
                if (typeof nav === 'function') {
                    nav('live');
                }
                break;
                
            case 'quiz':
                if (typeof showQuizResults === 'function') {
                    showQuizResults(notification.data.quizId);
                }
                break;
                
            case 'payment':
                if (typeof nav === 'function') {
                    nav('profile');
                }
                break;
        }
    }
    
    // ==================== [ 6. حفظ الإشعارات ] ====================
    saveNotification(notification) {
        if (typeof firebase === 'undefined') return;
        
        const db = firebase.database();
        const userId = firebase.auth().currentUser ? firebase.auth().currentUser.uid : 'anonymous';
        
        db.ref(`bot_notifications/${userId}/${Date.now()}`).set({
            ...notification,
            read: false
        });
    }
    
    // ==================== [ 7. إنشاء اختبارات ذكية ] ====================
    async generateSmartQuiz(subject, chapter, difficulty = 'medium', count = 10) {
        console.log(`🤖 جاري إنشاء اختبار في ${subject} - الفصل ${chapter}`);
        
        // محاكاة إنشاء أسئلة ذكية
        const questions = [];
        const questionTypes = [
            'اختيار من متعدد',
            'صح أم خطأ', 
            'ملء الفراغات',
            'التوصيل',
            'ترتيب'
        ];
        
        for (let i = 1; i <= count; i++) {
            const type = questionTypes[Math.floor(Math.random() * questionTypes.length)];
            const question = this.generateQuestion(subject, chapter, type, difficulty, i);
            questions.push(question);
        }
        
        return {
            id: `quiz_${Date.now()}`,
            subject: subject,
            chapter: chapter,
            difficulty: difficulty,
            questions: questions,
            generatedAt: Date.now(),
            estimatedTime: count * 1.5 // دقائق
        };
    }
    
    generateQuestion(subject, chapter, type, difficulty, number) {
        const difficulties = {
            easy: { options: 3, complexity: 'بسيط' },
            medium: { options: 4, complexity: 'متوسط' },
            hard: { options: 5, complexity: 'صعب' }
        };
        
        const diff = difficulties[difficulty] || difficulties.medium;
        
        let question, options, correctAnswer, explanation;
        
        switch(type) {
            case 'اختيار من متعدد':
                question = `سؤال ${number}: ما هو مفهوم "${subject}" في الفصل ${chapter} الذي يتعلق بـ${this.getRandomTopic(subject)}؟`;
                options = this.generateOptions(subject, diff.options);
                correctAnswer = Math.floor(Math.random() * diff.options);
                explanation = `الإجابة الصحيحة تتعلق بـ${this.getExplanation(subject)}`;
                break;
                
            case 'صح أم خطأ':
                question = `سؤال ${number}: الجملة التالية صحيحة أم خاطئة: "${this.generateStatement(subject, chapter)}"`;
                options = ['صح', 'خطأ'];
                correctAnswer = Math.random() > 0.5 ? 0 : 1;
                explanation = correctAnswer === 0 ? 'هذه الجملة صحيحة' : 'هذه الجملة خاطئة';
                break;
                
            case 'ملء الفراغات':
                question = `سؤال ${number}: أكمل الفراغ: "${this.generateFillInBlank(subject, chapter)}"`;
                options = this.generateFillOptions(subject, diff.options);
                correctAnswer = 0;
                explanation = 'الإجابة الصحيحة تكمل الجملة بشكل صحيح';
                break;
                
            case 'التوصيل':
                question = `سؤال ${number}: قم بتوصيل المفاهيم التالية بشكل صحيح:`;
                options = this.generateMatchingOptions(subject, diff.options);
                correctAnswer = this.generateMatchingAnswer(options);
                explanation = 'التوصيل الصحيح يربط المفاهيم المناسبة معاً';
                break;
                
            case 'ترتيب':
                question = `سؤال ${number}: رتب الخطوات التالية بالترتيب الصحيح:`;
                options = this.generateOrderingOptions(subject, diff.options);
                correctAnswer = this.generateOrderingAnswer(options);
                explanation = 'الترتيب الصحيح يعكس التسلسل المنطقي';
                break;
        }
        
        return {
            question: question,
            options: options,
            correctAnswer: correctAnswer,
            type: type,
            difficulty: difficulty,
            explanation: explanation,
            points: this.calculatePoints(difficulty)
        };
    }
    
    // ==================== [ 8. دوال مساعدة للأسئلة ] ====================
    getRandomTopic(subject) {
        const topics = {
            'الرياضيات': ['الجبر', 'الهندسة', 'الإحصاء', 'الحساب'],
            'العلوم': ['الكيمياء', 'الفيزياء', 'الأحياء', 'الأرض'],
            'اللغة العربية': ['النحو', 'الصرف', 'الأدب', 'البلاغة'],
            'اللغة الإنجليزية': ['القواعد', 'المفردات', 'القراءة', 'الكتابة'],
            'الاجتماعيات': ['التاريخ', 'الجغرافيا', 'الاقتصاد', 'السياسة'],
            'التربية الإسلامية': ['الفقه', 'التفسير', 'الحديث', 'السيرة']
        };
        
        return topics[subject] ? topics[subject][Math.floor(Math.random() * topics[subject].length)] : 'الموضوع';
    }
    
    generateOptions(subject, count) {
        const options = [];
        const correct = this.getCorrectOption(subject);
        options.push(correct);
        
        for (let i = 1; i < count; i++) {
            options.push(this.getWrongOption(subject));
        }
        
        // خلط الخيارات
        return this.shuffleArray(options);
    }
    
    getCorrectOption(subject) {
        const correctOptions = {
            'الرياضيات': '42',
            'العلوم': 'الخلية',
            'اللغة العربية': 'الفاعل',
            'اللغة الإنجليزية': 'Present Simple',
            'الاجتماعيات': 'الاستقلال',
            'التربية الإسلامية': 'الصلاة'
        };
        
        return correctOptions[subject] || 'الإجابة الصحيحة';
    }
    
    getWrongOption(subject) {
        const wrongOptions = [
            'إجابة خاطئة 1',
            'إجابة خاطئة 2', 
            'إجابة خاطئة 3',
            'إجابة خاطئة 4',
            'إجابة خاطئة 5'
        ];
        
        return wrongOptions[Math.floor(Math.random() * wrongOptions.length)];
    }
    
    generateStatement(subject, chapter) {
        const statements = {
            true: [
                `مفهوم ${this.getRandomTopic(subject)} مهم في ${subject}`,
                `الفصل ${chapter} يشرح أساسيات ${subject}`,
                `يمكن تطبيق ${subject} في الحياة اليومية`
            ],
            false: [
                `مفهوم ${this.getRandomTopic(subject)} غير موجود في ${subject}`,
                `الفصل ${chapter} لا علاقة له بـ${subject}`,
                `${subject} لا يمكن تطبيقه عملياً`
            ]
        };
        
        const isTrue = Math.random() > 0.5;
        const category = isTrue ? 'true' : 'false';
        const list = statements[category];
        
        return list[Math.floor(Math.random() * list.length)];
    }
    
    generateFillInBlank(subject, chapter) {
        const blanks = {
            'الرياضيات': `معادلة الدرجة الثانية تحتوي على ______`,
            'العلوم': `عملية البناء الضوئي تنتج ______`,
            'اللغة العربية': `الجملة الفعلية تبدأ بـ ______`,
            'اللغة الإنجليزية': `Past Simple يستخدم لـ ______`,
            'الاجتماعيات': `أهمية موقع مصر الجغرافي تكمن في ______`,
            'التربية الإسلامية': `أركان الإسلام تبدأ بـ ______`
        };
        
        return blanks[subject] || `مفهوم ${subject} في الفصل ${chapter} يشير إلى ______`;
    }
    
    generateFillOptions(subject, count) {
        const options = [this.getCorrectOption(subject)];
        
        for (let i = 1; i < count; i++) {
            options.push(this.getWrongOption(subject));
        }
        
        return this.shuffleArray(options);
    }
    
    generateMatchingOptions(subject, count) {
        const pairs = [];
        const concepts = ['المفهوم الأول', 'المفهوم الثاني', 'المفهوم الثالث', 'المفهوم الرابع'];
        const definitions = ['التعريف الأول', 'التعريف الثاني', 'التعريف الثالث', 'التعريف الرابع'];
        
        for (let i = 0; i < Math.min(count, 4); i++) {
            pairs.push({
                concept: concepts[i],
                definition: definitions[i]
            });
        }
        
        return {
            concepts: concepts.slice(0, count),
            definitions: this.shuffleArray(definitions.slice(0, count))
        };
    }
    
    generateMatchingAnswer(options) {
        const answer = [];
        options.concepts.forEach((concept, index) => {
            answer.push(index); // الترتيب الصحيح
        });
        return answer;
    }
    
    generateOrderingOptions(subject, count) {
        const steps = [];
        for (let i = 1; i <= count; i++) {
            steps.push(`الخطوة ${i}: ${this.getRandomTopic(subject)}`);
        }
        return this.shuffleArray(steps);
    }
    
    generateOrderingAnswer(options) {
        const answer = [];
        for (let i = 0; i < options.length; i++) {
            answer.push(i);
        }
        return this.shuffleArray(answer);
    }
    
    getExplanation(subject) {
        const explanations = {
            'الرياضيات': 'القاعدة الأساسية في الحساب',
            'العلوم': 'النظرية العلمية المقبولة',
            'اللغة العربية': 'القاعدة النحوية الصحيحة',
            'اللغة الإنجليزية': 'القاعدة النحوية الإنجليزية',
            'الاجتماعيات': 'الحقائق التاريخية الموثقة',
            'التربية الإسلامية': 'الأحكام الشرعية الثابتة'
        };
        
        return explanations[subject] || 'المعلومة الصحيحة في المنهج الدراسي';
    }
    
    calculatePoints(difficulty) {
        const points = {
            easy: 1,
            medium: 2,
            hard: 3
        };
        return points[difficulty] || 1;
    }
    
    // ==================== [ 9. دوال مساعدة ] ====================
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
    
    checkForNewContent() {
        // التحقق من المحتوى الجديد كل 5 دقائق
        setInterval(() => {
            this.checkNewBooks();
            this.checkNewLiveRooms();
        }, 300000);
    }
    
    async checkNewBooks() {
        if (typeof firebase === 'undefined') return;
        
        const db = firebase.database();
        const lastCheck = localStorage.getItem('lastBookCheck') || 0;
        
        const snapshot = await db.ref('books')
            .orderByChild('addedDate')
            .startAt(parseInt(lastCheck) + 1)
            .once('value');
        
        if (snapshot.exists()) {
            localStorage.setItem('lastBookCheck', Date.now());
            // إرسال إشعارات للكتب الجديدة
        }
    }
    
    async checkNewLiveRooms() {
        if (typeof firebase === 'undefined') return;
        
        const db = firebase.database();
        const lastCheck = localStorage.getItem('lastLiveRoomCheck') || 0;
        
        const snapshot = await db.ref('live_rooms')
            .orderByChild('createdAt')
            .startAt(parseInt(lastCheck) + 1)
            .once('value');
        
        if (snapshot.exists()) {
            localStorage.setItem('lastLiveRoomCheck', Date.now());
            // إرسال إشعارات للغرف الجديدة
        }
    }
    
    setupNotifications() {
        // إضافة أنماط CSS للبوت
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
            
            .bot-notification {
                font-family: 'Tajawal', sans-serif;
                direction: rtl;
            }
            
            .bot-fab {
                position: fixed;
                bottom: 80px;
                left: 20px;
                width: 60px;
                height: 60px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 24px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                cursor: pointer;
                z-index: 9999;
                animation: pulse 2s infinite;
            }
            
            @keyframes pulse {
                0% { box-shadow: 0 0 0 0 rgba(102, 126, 234, 0.7); }
                70% { box-shadow: 0 0 0 10px rgba(102, 126, 234, 0); }
                100% { box-shadow: 0 0 0 0 rgba(102, 126, 234, 0); }
            }
            
            .bot-panel {
                position: fixed;
                bottom: 150px;
                left: 20px;
                width: 300px;
                background: var(--bg-card);
                border-radius: 15px;
                padding: 20px;
                box-shadow: var(--shadow);
                border: 1px solid var(--border);
                z-index: 9998;
                display: none;
            }
            
            .bot-panel.show {
                display: block;
                animation: slideInUp 0.3s ease;
            }
            
            @keyframes slideInUp {
                from { transform: translateY(20px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
        
        // إضافة زر البوت العائم
        this.createFloatingButton();
    }
    
    createFloatingButton() {
        const fab = document.createElement('div');
        fab.className = 'bot-fab';
        fab.innerHTML = '<i class="fas fa-robot"></i>';
        fab.title = 'المساعد الذكي';
        
        fab.onclick = () => {
            this.toggleBotPanel();
        };
        
        document.body.appendChild(fab);
        
        // إنشاء لوحة البوت
        this.createBotPanel();
    }
    
    createBotPanel() {
        const panel = document.createElement('div');
        panel.className = 'bot-panel';
        panel.innerHTML = `
            <div style="text-align: right; margin-bottom: 15px;">
                <h4 style="color: var(--neon-blue); margin: 0 0 10px 0;">
                    <i class="fas fa-robot"></i> المساعد الذكي
                </h4>
                <p style="color: var(--text-sec); font-size: 12px; margin: 0;">
                    كيف يمكنني مساعدتك اليوم؟
                </p>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <button class="btn-main" onclick="smartBot.generateQuickQuiz()" style="font-size: 12px; padding: 10px;">
                    <i class="fas fa-question-circle"></i> اختبار سريع
                </button>
                
                <button class="btn-secondary" onclick="smartBot.showStudyPlan()" style="font-size: 12px; padding: 10px;">
                    <i class="fas fa-calendar"></i> خطة دراسة
                </button>
                
                <button class="btn-secondary" onclick="smartBot.showNotifications()" style="font-size: 12px; padding: 10px;">
                    <i class="fas fa-bell"></i> الإشعارات
                </button>
                
                <button class="btn-secondary" onclick="smartBot.hidePanel()" style="font-size: 12px; padding: 10px;">
                    <i class="fas fa-times"></i> إغلاق
                </button>
            </div>
            
            <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--border);">
                <div style="font-size: 11px; color: var(--text-sec);">
                    <i class="fas fa-info-circle"></i> البوت يعمل تلقائياً لإشعارك بالمحتوى الجديد
                </div>
            </div>
        `;
        
        document.body.appendChild(panel);
        this.botPanel = panel;
    }
    
    toggleBotPanel() {
        this.botPanel.classList.toggle('show');
    }
    
    hidePanel() {
        this.botPanel.classList.remove('show');
    }
    
    // ==================== [ 10. ميزات إضافية للبوت ] ====================
    async generateQuickQuiz() {
        const subjects = ['الرياضيات', 'العلوم', 'اللغة العربية'];
        const subject = subjects[Math.floor(Math.random() * subjects.length)];
        
        const quiz = await this.generateSmartQuiz(subject, '1', 'medium', 5);
        
        if (typeof showQuizModal === 'function') {
            showQuizModal(quiz);
        } else {
            this.showQuizInPanel(quiz);
        }
        
        this.hidePanel();
    }
    
    showQuizInPanel(quiz) {
        const panel = document.createElement('div');
        panel.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 90%;
            max-width: 500px;
            background: var(--bg-card);
            border-radius: 15px;
            padding: 20px;
            box-shadow: var(--shadow);
            border: 2px solid var(--purple);
            z-index: 10001;
            max-height: 80vh;
            overflow-y: auto;
        `;
        
        let questionsHtml = '';
        quiz.questions.forEach((q, index) => {
            questionsHtml += `
                <div style="margin-bottom: 15px; padding: 15px; background: rgba(0,0,0,0.2); border-radius: 10px;">
                    <div style="font-weight: bold; color: var(--text-main); margin-bottom: 10px;">
                        ${q.question}
                    </div>
                    ${q.options.map((opt, optIndex) => `
                        <div style="padding: 8px; margin: 5px 0; background: rgba(255,255,255,0.05); border-radius: 5px;">
                            ${String.fromCharCode(1632 + optIndex + 1)}. ${opt}
                        </div>
                    `).join('')}
                </div>
            `;
        });
        
        panel.innerHTML = `
            <div style="text-align: right;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h4 style="color: var(--purple); margin: 0;">
                        <i class="fas fa-robot"></i> اختبار سريع
                    </h4>
                    <button onclick="this.parentElement.parentElement.parentElement.remove()" 
                            style="background: none; border: none; color: var(--text-sec); cursor: pointer; font-size: 20px;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div style="color: var(--text-sec); font-size: 14px; margin-bottom: 15px;">
                    <i class="fas fa-book"></i> ${quiz.subject} - الفصل ${quiz.chapter}
                </div>
                
                <div id="quiz-questions">
                    ${questionsHtml}
                </div>
                
                <button class="btn-main" onclick="smartBot.submitQuickQuiz()" style="margin-top: 20px;">
                    <i class="fas fa-check"></i> إنهاء الاختبار
                </button>
            </div>
        `;
        
        document.body.appendChild(panel);
        this.currentQuiz = quiz;
        this.quizPanel = panel;
    }
    
    submitQuickQuiz() {
        if (this.quizPanel) {
            this.quizPanel.remove();
        }
        
        const score = Math.floor(Math.random() * 100);
        const message = score >= 70 ? 'ممتاز! 👏' : score >= 50 ? 'جيد جداً! 👍' : 'حاول مرة أخرى! 💪';
        
        this.showNotification({
            title: '🎉 نتيجة الاختبار السريع',
            message: `${message} حصلت على ${score}%`,
            type: 'quiz'
        });
    }
    
    showStudyPlan() {
        const plan = this.generateStudyPlan();
        
        const panel = document.createElement('div');
        panel.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 90%;
            max-width: 500px;
            background: var(--bg-card);
            border-radius: 15px;
            padding: 20px;
            box-shadow: var(--shadow);
            border: 2px solid var(--accent);
            z-index: 10001;
            max-height: 80vh;
            overflow-y: auto;
        `;
        
        let planHtml = '';
        plan.days.forEach(day => {
            planHtml += `
                <div style="margin-bottom: 15px; padding: 15px; background: rgba(245, 158, 11, 0.1); border-radius: 10px;">
                    <div style="font-weight: bold; color: var(--accent); margin-bottom: 10px;">
                        <i class="fas fa-calendar-day"></i> ${day.day}
                    </div>
                    <ul style="margin: 0; padding-right: 20px; color: var(--text-main);">
                        ${day.tasks.map(task => `<li>${task}</li>`).join('')}
                    </ul>
                </div>
            `;
        });
        
        panel.innerHTML = `
            <div style="text-align: right;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h4 style="color: var(--accent); margin: 0;">
                        <i class="fas fa-calendar-alt"></i> خطة الدراسة الأسبوعية
                    </h4>
                    <button onclick="this.parentElement.parentElement.parentElement.remove()" 
                            style="background: none; border: none; color: var(--text-sec); cursor: pointer; font-size: 20px;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div style="color: var(--text-sec); font-size: 14px; margin-bottom: 15px;">
                    <i class="fas fa-user-graduate"></i> مخصصة لمستواك الدراسي
                </div>
                
                ${planHtml}
                
                <button class="btn-main" onclick="this.parentElement.parentElement.parentElement.remove()" style="margin-top: 20px;">
                    <i class="fas fa-check"></i> فهمت
                </button>
            </div>
        `;
        
        document.body.appendChild(panel);
        this.hidePanel();
    }
    
    generateStudyPlan() {
        const days = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
        const subjects = ['الرياضيات', 'العلوم', 'اللغة العربية', 'اللغة الإنجليزية', 'الاجتماعيات'];
        
        const plan = {
            week: `الأسبوع ${Math.floor(Math.random() * 10) + 1}`,
            days: []
        };
        
        days.forEach(day => {
            const daySubjects = this.shuffleArray([...subjects]).slice(0, 3);
            const tasks = daySubjects.map(subject => 
                `مراجعة ${subject} - ${this.getRandomTopic(subject)}`
            );
            
            tasks.push('حل 5 تمارين من الكتاب');
            tasks.push('مراجعة الاختبارات السابقة');
            
            plan.days.push({
                day: day,
                tasks: tasks
            });
        });
        
        return plan;
    }
    
    showNotifications() {
        this.hidePanel();
        
        this.showNotification({
            title: '📋 إشعارات البوت',
            message: 'عرض جميع الإشعارات في لوحة الإشعارات الرئيسية',
            type: 'system'
        });
        
        if (typeof nav === 'function') {
            nav('home');
        }
    }
    
    // ==================== [ 11. مراقبة نتائج الاختبارات ] ====================
    listenForQuizResults() {
        if (typeof firebase === 'undefined' || !firebase.auth().currentUser) return;
        
        const db = firebase.database();
        const userId = firebase.auth().currentUser.uid;
        
        db.ref(`ai_quizzes/${userId}`).orderByChild('submittedAt').limitToLast(1).on('child_added', (snap) => {
            const quiz = snap.val();
            if (quiz && quiz.completed) {
                this.sendQuizNotification(quiz);
            }
        });
    }
    
    // ==================== [ 12. مراقبة المدفوعات ] ====================
    listenForPayments() {
        if (typeof firebase === 'undefined' || !firebase.auth().currentUser) return;
        
        const db = firebase.database();
        const userId = firebase.auth().currentUser.uid;
        
        // مراقبة مدفوعات الاشتراكات
        db.ref(`subscription_payments/${userId}`).orderByChild('timestamp').limitToLast(1).on('child_added', (snap) => {
            const payment = snap.val();
            if (payment) {
                this.sendPaymentNotification(payment);
            }
        });
        
        // مراقبة مدفوعات غرف البث
        db.ref(`room_payments`).orderByChild('userId').equalTo(userId).limitToLast(1).on('child_added', (snap) => {
            const payment = snap.val();
            if (payment) {
                this.sendPaymentNotification(payment);
            }
        });
    }
}

// ==================== [ 13. تهيئة البوت ] ====================
let smartBot;

document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        smartBot = new SmartStudentBot();
        console.log('✅ البوت الذكي تم تحميله بنجاح');
        
        // جعل البوت متاحاً عالمياً
        window.smartBot = smartBot;
        
        // تعريف الدوال المساعدة
        window.showQuizModal = function(quiz) {
            if (typeof nav === 'function') {
                nav('ai_assistant');
            }
        };
        
        window.showQuizResults = function(quizId) {
            if (typeof nav === 'function') {
                nav('ai_assistant');
            }
        };
        
    }, 2000);
});

// ==================== [ 14. دعم الإشعارات في المتصفح ] ====================
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(error => {
        console.log('❌ فشل تسجيل Service Worker:', error);
    });
}

// ==================== [ 15. إدارة الذاكرة والأداء ] ====================
setInterval(() => {
    // تنظيف الإشعارات القديمة
    const notifications = document.querySelectorAll('.bot-notification');
    if (notifications.length > 5) {
        for (let i = 5; i < notifications.length; i++) {
            notifications[i].remove();
        }
    }
}, 60000);

console.log('🤖 ملف البوت الذكي تم تحميله');
