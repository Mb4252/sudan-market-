// sdm-chat-sender-64.js

// دالة لقراءة الرسائل المحفوظة
function getSavedMessages() {
  try {
    const messages = localStorage.getItem('sdmChatMessages');
    return messages ? JSON.parse(messages) : [];
  } catch (e) {
    console.error('Error reading messages:', e);
    return [];
  }
}

// دالة لحفظ رسالة جديدة
function saveMessage(message) {
  try {
    const messages = getSavedMessages();
    messages.push(message);
    localStorage.setItem('sdmChatMessages', JSON.stringify(messages));
    return true;
  } catch (e) {
    console.error('Error saving message:', e);
    return false;
  }
}

// دالة لإضافة رسالة إلى الدردشة
function addMessageToChat(message, isUser) {
  const chatContainer = document.getElementById('sdm-chat');
  if (!chatContainer) return;

  const messageElement = document.createElement('div');
  messageElement.className = isUser ? 'user-message' : 'sdm-message';
  messageElement.textContent = message;

  chatContainer.appendChild(messageElement);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// دالة لرد فوري من SDM
function getSDMResponse(message) {
  // محاكاة رد فوري
  const responses = [
    "شكراً لرسالتك! سنرد عليك قريباً.",
    "تم استلام رسالتك بنجاح.",
    "شكراً على تواصلك معنا."
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}

// دالة لإرسال رسالة
function sendMessage() {
  const nameInput = document.getElementById('sdm-name');
  const messageInput = document.getElementById('sdm-message');

  if (!nameInput || !messageInput) return;

  const name = nameInput.value.trim();
  const message = messageInput.value.trim();

  if (!name || !message) return;

  try {
    // إضافة الرسالة إلى الدردشة
    addMessageToChat(`${name}: ${message}`, true);

    // حفظ الرسالة
    saveMessage({ name, message, timestamp: new Date().toISOString() });

    // محاكاة رد فوري من SDM
    const sdmResponse = getSDMResponse(message);
    addMessageToChat(`SDM: ${sdmResponse}`, false);

    // مسح حقل الرسالة
    messageInput.value = '';
  } catch (e) {
    console.error('Error sending message:', e);
  }
}

// تهيئة الدردشة عند تحميل الصفحة
function initializeChat() {
  try {
    // تحميل الرسائل المحفوظة
    const messages = getSavedMessages();
    messages.forEach(msg => {
      addMessageToChat(`${msg.name}: ${msg.message}`, true);
    });

    // إضافة معالج للزر
    const sendButton = document.getElementById('sdm-send-btn');
    if (sendButton) {
      sendButton.addEventListener('click', sendMessage);
    }
  } catch (e) {
    console.error('Error initializing chat:', e);
  }
}

// تشغيل التهيئة عند تحميل الصفحة
window.addEventListener('DOMContentLoaded', initializeChat);