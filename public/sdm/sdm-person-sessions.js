// public/sdm/sdm-person-sessions.js
(function() {
    'use strict';

    // مفتاح التخزين المحلي
    const STORAGE_KEY = 'sdmPersonSessions';

    // متغيرات الحالة
    let currentPerson = null;
    let currentSession = null;

    // دالة لجلب جميع الجلسات المحفوظة
    function getAllSessions() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : {};
        } catch (error) {
            console.error('Error getting sessions:', error);
            return {};
        }
    }

    // دالة لحفظ الجلسة الحالية
    function saveCurrentSession() {
        if (!currentPerson || !currentSession) return;

        try {
            const sessions = getAllSessions();
            sessions[currentPerson] = currentSession;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
        } catch (error) {
            console.error('Error saving session:', error);
        }
    }

    // دالة لتحميل جلسة معينة
    function loadSession(person) {
        const sessions = getAllSessions();
        return sessions[person] || { messages: [], timestamp: new Date().toISOString() };
    }

    // دالة لتغيير الشخص الحالي
    function switchPerson(newPerson) {
        if (currentPerson) {
            saveCurrentSession();
        }

        currentPerson = newPerson;
        currentSession = loadSession(newPerson);

        // تحديث واجهة المستخدم
        updateChatUI();

        // حفظ الجلسة الجديدة
        saveCurrentSession();
    }

    // دالة لتحديث واجهة المحادثة
    function updateChatUI() {
        const chatContainer = document.getElementById('sdm-chat');
        if (chatContainer && currentSession) {
            chatContainer.innerHTML = currentSession.messages.map(msg => {
                return `<div class="message"><strong>${msg.sender}:</strong> ${msg.text}</div>`;
            }).join('');
        }
    }

    // دالة لإضافة رسالة
    function addMessage(sender, text) {
        if (!currentSession) return;

        currentSession.messages.push({
            sender,
            text,
            timestamp: new Date().toISOString()
        });

        updateChatUI();
        saveCurrentSession();
    }

    // ربط الدوال مع النافذة العالمية
    window.sdmPersonSessions = {
        switchPerson,
        addMessage,
        getCurrentPerson: () => currentPerson,
        getCurrentSession: () => currentSession
    };

    // تهيئة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', () => {
        try {
            // تحميل الجلسة الأولى إذا كانت موجودة
            const sessions = getAllSessions();
            const firstPerson = Object.keys(sessions)[0];
            if (firstPerson) {
                switchPerson(firstPerson);
            }
        } catch (error) {
            console.error('Initialization error:', error);
        }
    });
})();