const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 10000;

// السماح لموقعك الثابت بالاتصال (استبدل * برابط موقعك الفعلي لاحقاً)
app.use(cors({ origin: '*' }));
app.use(express.json());

// نقطة نهاية للاستدعاء من الواجهة الأمامية
app.post('/api/ai', async (req, res) => {
  const { prompt, context } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'prompt مطلوب' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GROQ_API_KEY غير مضبوط في متغيرات Render' });
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'أنت مساعد ذكي لموقع "رادار أسعار الحي" في السودان. تجيب بالعربية الفصحى المبسطة. تستخدم البيانات المقدمة فقط ولا تخترع أرقاماً.'
          },
          {
            role: 'user',
            content: context
              ? `بيانات الأسعار الحالية:\n${context}\n\nسؤال المستخدم: ${prompt}`
              : prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: 'Groq API error', detail: err });
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content || 'لم أتمكن من الإجابة.';
    res.json({ answer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// فحص صحي (مهم لـ Render)
app.get('/health', (req, res) => res.status(200).send('OK'));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`AI Proxy running on port ${PORT}`);
});
