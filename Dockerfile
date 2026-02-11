# 1. استخدام نسخة Node.js الرسمية
FROM node:20-slim

# 2. إنشاء مجلد العمل
WORKDIR /app

# 3. نسخ ملفات التعريف وتثبيت المكتبات
COPY package*.json ./
RUN npm install

# 4. نسخ باقي الملفات (بما فيها مجلد public)
COPY . .

# 5. ضبط المنفذ الافتراضي لـ Koyeb
ENV PORT=8000
EXPOSE 8000

# 6. أمر التشغيل النهائي
CMD ["node", "index.js"]
