/* =====================================================================
 * SUDAN MARKET — AUTONOMOUS MULTI-AGENT AUTOPILOT (v3.2 - Resilient)
 * إصلاحات: Groq نماذج حية، قطع Mistral، 429 OpenRouter، حفظ آمن
 * ===================================================================== */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const CANONICAL_PAGES_URL = "https://mb4252.github.io/sudan-market-/";
const CANONICAL_RENDER_URL = "https://sudan-market-2.onrender.com";
const MEMORY_FILE = "ai-memory.json";
const MAX_MEMORY_ITEMS = 40;

// ---------- utilities ----------
function failWithReason(reason) {
  console.error("❌ AI STATUS: FAILED");
  console.error("سبب الفشل:", reason);
  process.exit(1);
}

function sanitizeUrl(rawUrl, fallbackUrl = "") {
  let u = String(rawUrl || "").trim();
  const md = u.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (md) u = (md[2] || md[1] || "").trim();
  u = u.replace(/^<|>$/g, "").trim();
  return u || fallbackUrl;
}

function loadMemory() {
  try {
    if (!fs.existsSync(MEMORY_FILE)) return { history: [], ideas: [], knownIssues: [], disabledModels: {}, openRouterBlockedUntil: 0 };
    const raw = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
    return {
      history: Array.isArray(raw.history) ? raw.history : [],
      ideas: Array.isArray(raw.ideas) ? raw.ideas : [],
      knownIssues: Array.isArray(raw.knownIssues) ? raw.knownIssues : [],
      disabledModels: raw.disabledModels && typeof raw.disabledModels === "object" ? raw.disabledModels : {},
      openRouterBlockedUntil: Number(raw.openRouterBlockedUntil || 0)
    };
  } catch {
    return { history: [], ideas: [], knownIssues: [], disabledModels: {}, openRouterBlockedUntil: 0 };
  }
}

function saveMemory(mem) {
  mem.history = mem.history.slice(-MAX_MEMORY_ITEMS);
  mem.ideas = [...new Set(mem.ideas)].slice(-MAX_MEMORY_ITEMS);
  mem.knownIssues = [...new Set(mem.knownIssues)].slice(-MAX_MEMORY_ITEMS);
  // تنظيف disabledModels المنتهية (أكثر من 24 ساعة)
  const now = Date.now();
  for (const k of Object.keys(mem.disabledModels)) {
    if (mem.disabledModels[k] < now) delete mem.disabledModels[k];
  }
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(mem, null, 2), "utf8");
}

// ---------- project scan ----------
function collectProjectFiles(dir = ".", depth = 0, out = []) {
  if (depth > 3) return out;
  const ignore = new Set(["node_modules", ".git", ".github"]);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignore.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name).replace(/\\/g, "/");
    if (entry.isDirectory()) collectProjectFiles(fullPath, depth + 1, out);
    else if (/\.(js|html|css|json|webmanifest|md)$/i.test(entry.name)) {
      const raw = fs.readFileSync(fullPath, "utf8");
      const content = raw.length > 2400 ? raw.slice(0, 2400) + "\n/* ...مقتطع... */" : raw;
      out.push({ fullPath, raw, content });
    }
  }
  return out;
}

// ---------- validators ----------
function validateGeneratedFiles(filesMap) {
  const errors = [];
  if (!filesMap || typeof filesMap !== "object") return ["كائن files مفقود."];
  const htmlEntry = filesMap["index.html"];
  const htmlIds = new Set();
  if (typeof htmlEntry === "string") {
    for (const m of htmlEntry.matchAll(/\bid=["'\'']([^"'\'']+)["'\'']/g)) htmlIds.add(m[1]);
  }
  for (const [rawPath, content] of Object.entries(filesMap)) {
    const p = String(rawPath).replace(/^\/+/, "").trim();
    if (!p || p.includes("..") || typeof content !== "string" || !content.trim()) {
      errors.push(`مسار/محتوى غير صالح: ${rawPath}`);
      continue;
    }
    if (p.endsWith(".json")) {
      try { JSON.parse(content); } catch (e) { errors.push(`JSON خطأ في ${p}: ${e.message}`); }
    } else if (p.endsWith(".js") && !p.endsWith("sw.js")) {
      try { new vm.Script(content, { filename: p }); }
      catch (e) { errors.push(`JS خطأ في ${p}: ${e.message}`); }
    }
  }
  if (typeof htmlEntry === "string") {
    for (const [p, content] of Object.entries(filesMap)) {
      if (!p.endsWith(".js") || typeof content !== "string") continue;
      const refs = [...content.matchAll(/getElementById\(["'\'']([^"'\'']+)["'\'']\)/g)].map(m => m[1]);
      const missing = [...new Set(refs.filter(id => !htmlIds.has(id)))];
      if (missing.length) errors.push(`معرّفات DOM مفقودة مستدعاة في ${p}: ${missing.join(", ")}`);
    }
  }
  return errors;
}

// ---------- live probes ----------
async function probeLiveEndpoints(pagesUrl, renderUrl) {
  const lines = [];
  const cleanPages = sanitizeUrl(pagesUrl, CANONICAL_PAGES_URL);
  const cleanRender = sanitizeUrl(renderUrl, CANONICAL_RENDER_URL).replace(/\/+$/, "");
  try {
    const res = await fetch(cleanPages, { signal: AbortSignal.timeout(12000) });
    const html = await res.text();
    const srcs = [...html.matchAll(/<script[^>]+src=["'\'']([^"'\'']+)["'\'']/gi)].map(m => m[1]);
    const bad = srcs.some(s => /^\/(?!sudan-market-)/.test(s));
    lines.push(`GitHub Pages (${cleanPages}): HTTP ${res.status} | ${srcs.length} سكربت`);
    if (bad) lines.push("⚠️ مسار مطلق يبدأ بـ / قد ينكسر — استخدم ./");
  } catch (e) { lines.push(`تعذر فحص Pages: ${e.message}`); }
  try {
    const h = await fetch(`${cleanRender}/health`, { signal: AbortSignal.timeout(15000) });
    const t = await h.text();
    lines.push(`Render /health (${cleanRender}): HTTP ${h.status} | ${t.slice(0, 120)}`);
  } catch (e) {
    lines.push(`Render /health غير مستجيب (${e.message}) — يجب أن يعمل محلياً فوراً دون انتظاره.`);
  }
  return lines.join("\n");
}

// ---------- static diagnostics ----------
function runSelfDiagnostics(filesList, pagesUrl, renderUrl) {
  const issues = [];
  const htmlFile = filesList.find(f => f.fullPath === "index.html");
  const jsFiles = filesList.filter(f => f.fullPath.endsWith(".js") && f.fullPath !== "server.js" && !f.fullPath.endsWith("sw.js"));
  if (!htmlFile) return "ملف index.html مفقود في الجذر.";
  const htmlIds = new Set([...htmlFile.raw.matchAll(/\bid=["'\'']([^"'\'']+)["'\'']/g)].map(m => m[1]));
  const allJs = jsFiles.map(f => f.raw).join("\n");
  const combined = allJs + "\n" + htmlFile.raw;

  if (/YOUR-SERVICE|example\.onrender\.com/i.test(combined)) issues.push(`رابط Render وهمي — يجب استبداله بـ ${renderUrl}`);
  if (/location\.host/.test(allJs) && !/sudan-market-2\.onrender\.com/.test(allJs)) issues.push(`location.host مستخدم للـ WS بدل ${renderUrl}`);
  if (!/sudan-market-2\.onrender\.com/.test(combined)) issues.push(`رابط Render ${renderUrl} غير مضمّن بوضوح.`);

  const refs = [...allJs.matchAll(/getElementById\(["'\'']([^"'\'']+)["'\'']\)/g)].map(m => m[1]);
  const missing = [...new Set(refs.filter(id => !htmlIds.has(id)))];
  if (missing.length) issues.push(`DOM مفقود في index.html: ${missing.join(", ")}`);

  if (!/localStorage/.test(allJs)) issues.push("localStorage غير مفعّل — يجب أن يعمل النشر محلياً فوراً.");
  if (!/window\.addEventListener\(["'\'']error["'\'']|onunhandledrejection/.test(combined))
    issues.push("لا يوجد ملتقط أخطاء عام (window.onerror/unhandledrejection).");
  if (!/serviceWorker/.test(combined)) issues.push("Service Worker غير مسجّل — الموقع ليس Offline-First.");
  if (!/WebSocket|wss:\/\//.test(combined)) issues.push("لا يوجد قناة WebSocket للبث المباشر عبر Render.");

  const advanced = [
    ["محرك استخراج كيانات (Extractor)", /extract|parseFreeText|entityExtract|nlp/i],
    ["مؤشر تذبذب الأسعار", /volatility|تذبذب|variance/i],
    ["كشف شذوذ الأسعار", /anomaly|outlier|شذوذ/i],
    ["تنبؤ السعر", /forecast|predict|تنبؤ|trend/i],
    ["سجل إضافات (Plugin Registry)", /registerPlugin|pluginRegistry|plugins\//i],
    ["مؤشر ثقة للمنشور", /confidence|ثقة/i]
  ];
  for (const [name, re] of advanced) {
    if (!re.test(combined)) issues.push(`ميزة متقدمة مفقودة: ${name}`);
  }
  return issues.length ? issues.map((x, i) => `${i + 1}. ${x}`).join("\n") : "لا مشاكل بنيوية — ركّز على التوسيع والابتكار.";
}

// ---------- provider layer ----------
async function getGroqModelsOrdered(apiKey, disabledModels) {
  const preferred = ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "llama-3.1-8b-instant", "openai/gpt-oss-20b", "gemma2-9b-it", "mixtral-8x7b-32768"];
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) return preferred.filter(m => !(disabledModels[m] > Date.now()));
    const data = await res.json();
    const now = Date.now();
    const available = (data.data || [])
      .map(m => m.id)
      .filter(id => id && !/whisper|tts|guard|embed|allam|orpheus/i.test(id))
      .filter(id => !(disabledModels[id] > now)); // استبعد المعطّلة
    // رتّب: المفضلة أولاً إن وُجدت، ثم الباقي
    const ordered = [];
    for (const p of preferred) if (available.includes(p) && !ordered.includes(p)) ordered.push(p);
    for (const id of available) if (!ordered.includes(id)) ordered.push(id);
    return ordered.length ? ordered : preferred.filter(m => !(disabledModels[m] > now));
  } catch {
    return preferred.filter(m => !(disabledModels[m] > Date.now()));
  }
}

function tryRepairJson(candidate) {
  let s = String(candidate || "").trim();
  const fb = s.indexOf("{"); if (fb > 0) s = s.slice(fb);
  const lb = s.lastIndexOf("}"); if (lb !== -1) s = s.slice(0, lb + 1);
  let inStr = false, esc = false, open = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === "\"") { inStr = !inStr; continue; }
    if (!inStr) { if (c === "{") open++; else if (c === "}") open = Math.max(0, open - 1); }
  }
  if (esc) s = s.slice(0, -1);
  if (inStr) s += "\"";
  while (open-- > 0) s += "}";
  return JSON.parse(s);
}

function extractJsonObject(text) {
  const cleaned = String(text || "").replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  try { return JSON.parse(cleaned); } catch {
    const a = cleaned.indexOf("{"), b = cleaned.lastIndexOf("}");
    if (a !== -1 && b > a) { try { return JSON.parse(cleaned.slice(a, b + 1)); } catch { return tryRepairJson(cleaned); } }
    return tryRepairJson(cleaned);
  }
}

async function callChatCompletion(url, headers, body) {
  const res = await fetch(sanitizeUrl(url), { method: "POST", headers, body: JSON.stringify(body) });
  const txt = await res.text();
  let data;
  try { data = JSON.parse(txt); } catch {
    const e = new Error(`رد غير JSON (HTTP ${res.status}): ${txt.slice(0, 300)}`); e.status = res.status; throw e;
  }
  if (!res.ok || data.error) {
    const msg = data?.error?.message || JSON.stringify(data?.error || txt).slice(0, 300);
    const e = new Error(`HTTP ${res.status}: ${msg}`); e.status = res.status; throw e;
  }
  return data;
}

// ✅ إصلاح 3: فحص اكتمال الرد — إذا لم ينتهِ بـ } فهذا يعني قطع
function isTruncatedResponse(text) {
  const t = String(text || "").trim();
  if (!t.endsWith("}")) return true;
  // فحص توازن الأقواس
  let depth = 0, inStr = false, esc = false;
  for (const c of t) {
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === "\"") { inStr = !inStr; continue; }
    if (!inStr) { if (c === "{") depth++; else if (c === "}") depth--; }
  }
  return depth !== 0;
}

function buildProviders(primaryKey, openRouterKey, mistralKey, memory) {
  const list = []; const seen = new Set();
  const now = Date.now();

  const wrap = (id, label, runner) => {
    list.push({
      id, label,
      runText: async (sys, usr, max = 700) => ({ text: await runner(sys, usr, max, false), detail: label }),
      runJson: async (sys, usr, max = 8000) => {
        const raw = await runner(sys, usr, max, true);
        if (isTruncatedResponse(raw)) {
          const e = new Error(`رد ${label} مقطوع (لم ينتهِ بـ } أو غير متوازن)`);
          throw e;
        }
        return { parsed: extractJsonObject(raw), detail: label };
      }
    });
  };

  // ✅ إصلاح 2: Mistral أولاً وبـ max_tokens أقصى
  if (mistralKey && !seen.has(mistralKey)) {
    seen.add(mistralKey);
    wrap("mistral", "Mistral", async (sys, usr, max, jsonMode) => {
      const models = ["codestral-latest", "mistral-small-latest", "open-mistral-nemo"];
      let lastErr;
      for (const m of models) {
        if (memory.disabledModels[m] > now) { console.warn(`⏭️ تخطي ${m} (معطّل مؤقتاً)`); continue; }
        try {
          const body = {
            model: m,
            messages: [{ role: "system", content: sys }, { role: "user", content: usr }],
            max_tokens: Math.min(max, 8192),  // ✅ 8192 كحد أقصى
            temperature: 0.6
          };
          if (jsonMode && m !== "codestral-latest") body.response_format = { type: "json_object" };
          const d = await callChatCompletion(
            "https://api.mistral.ai/v1/chat/completions",
            { "Content-Type": "application/json", Authorization: `Bearer ${mistralKey}` },
            body
          );
          const out = d?.choices?.[0]?.message?.content || "";
          if (out.trim()) return out;
        } catch (e) {
          lastErr = e;
          if (e.status === 404) { memory.disabledModels[m] = now + 24 * 3600 * 1000; }
        }
      }
      throw lastErr || new Error("Mistral failed");
    });
  }

  // ✅ إصلاح 1: Groq — قائمة ديناميكية + استبعاد المعطّل
  for (const key of [primaryKey, openRouterKey].map(k => (k || "").trim()).filter(Boolean)) {
    if (seen.has(key)) continue; seen.add(key);
    if (key.startsWith("gsk_")) {
      wrap("groq", "Groq", async (sys, usr, max, jsonMode) => {
        const models = await getGroqModelsOrdered(key, memory.disabledModels);
        let lastErr;
        for (const m of models) {
          try {
            const body = {
              model: m,
              messages: [{ role: "system", content: sys }, { role: "user", content: usr }],
              max_tokens: Math.min(max, 8192),
              temperature: 0.6
            };
            if (jsonMode) body.response_format = { type: "json_object" };
            const d = await callChatCompletion(
              "https://api.groq.com/openai/v1/chat/completions",
              { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
              body
            );
            const out = d?.choices?.[0]?.message?.content || "";
            if (out.trim()) return out;
          } catch (e) {
            lastErr = e;
            // ✅ إذا 404 (نموذج غير موجود) → عطّله 24 ساعة
            if (e.status === 404 || /does not exist|not have access/i.test(e.message)) {
              console.warn(`⛔ تعطيل ${m} لمدة 24 ساعة (غير متاح)`);
              memory.disabledModels[m] = now + 24 * 3600 * 1000;
              continue;
            }
            if (e.status === 429) continue;
          }
        }
        throw lastErr || new Error("Groq failed");
      });
    } else if (key.startsWith("sk-or-")) {
      // ✅ إصلاح 3: احترام حظر OpenRouter اليومي
      wrap("openrouter", "OpenRouter", async (sys, usr, max) => {
        if (memory.openRouterBlockedUntil > now) {
          const hours = Math.ceil((memory.openRouterBlockedUntil - now) / 3600000);
          throw new Error(`OpenRouter محظور مؤقتاً لمدة ~${hours} ساعة (429 سابق)`);
        }
        try {
          const d = await callChatCompletion("https://openrouter.ai/api/v1/chat/completions", {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
            "HTTP-Referer": CANONICAL_PAGES_URL,
            "X-Title": "sudan-market-autopilot"
          }, {
            model: "openrouter/free",
            messages: [{ role: "system", content: sys }, { role: "user", content: usr }],
            max_tokens: Math.min(max, 8192),
            temperature: 0.6
          });
          const out = d?.choices?.[0]?.message?.content || "";
          if (!out.trim()) throw new Error("OpenRouter empty");
          return out;
        } catch (e) {
          if (e.status === 429) {
            memory.openRouterBlockedUntil = now + 12 * 3600 * 1000;
            console.warn("⛔ OpenRouter محظور لمدة 12 ساعة (429)");
          }
          throw e;
        }
      });
    }
  }

  // ✅ ترتيب الأولوية: Mistral أولاً (سخي)، ثم Groq، ثم OpenRouter
  const priority = { mistral: 1, groq: 2, openrouter: 3 };
  list.sort((a, b) => (priority[a.id] || 9) - (priority[b.id] || 9));
  return list;
}

// ===================== MAIN =====================
async function run() {
  const primaryKey = (process.env.AI_API_KEY || "").trim();
  const openRouterKey = (process.env.OPENROUTER_API_KEY || "").trim();
  const mistralKey = (process.env.MISTRAL_API_KEY || "").trim();
  const pagesUrl = sanitizeUrl(process.env.PAGES_URL, CANONICAL_PAGES_URL);
  const renderUrl = sanitizeUrl(process.env.RENDER_URL, CANONICAL_RENDER_URL);
  const memory = loadMemory();
  const providers = buildProviders(primaryKey, openRouterKey, mistralKey, memory);
  if (!providers.length) failWithReason("لا يوجد أي مفتاح API صالح في Secrets.");

  console.log("📋 المزودون المتاحون بالترتيب:", providers.map(p => p.label).join(" → "));

  const filesList = collectProjectFiles(".");
  const staticReport = runSelfDiagnostics(filesList, pagesUrl, renderUrl);
  const liveReport = await probeLiveEndpoints(pagesUrl, renderUrl);
  const diagnosticReport = `${staticReport}\n\n--- فحص الموقع الحي ---\n${liveReport}`;
  console.log("🩺 التشخيص:\n" + diagnosticReport);

  // ✅ إصلاح 4: أرسل فقط الملفات ذات الصلة (وليس كل شيء)
  const relevantFiles = filesList.filter(f => {
    if (f.fullPath === "index.html") return true;
    if (f.fullPath.startsWith("public/")) return true;
    if (f.fullPath === "server.js") return true;
    if (f.fullPath === "ai-memory.json") return false;
    return false;
  });
  const currentFiles = relevantFiles.map(f => `--- ${f.fullPath} ---\n${f.content}`).join("\n\n").slice(0, 5000);

  const memoryContext = [
    `آخر ${memory.history.length} دورة:`,
    memory.history.slice(-6).map(h => `• ${h.ts}: ${h.summary}`).join("\n") || "(لا يوجد)",
    "",
    "أفكار سابقة:",
    memory.ideas.slice(-8).map(i => `• ${i}`).join("\n") || "(لا يوجد)",
    "",
    "مشاكل معروفة:",
    memory.knownIssues.slice(-8).map(i => `• ${i}`).join("\n") || "(لا يوجد)",
    "",
    `نماذج معطّلة (تجنبها):`,
    Object.keys(memory.disabledModels).length ? Object.keys(memory.disabledModels).join(", ") : "(لا يوجد)"
  ].join("\n");

  const manifesto = [
    `GitHub Pages: ${pagesUrl}`,
    `Render Bridge: ${renderUrl} (wss + /health)`,
    "",
    "🎯 الفلسفة: مختبر سوق ذكي، لا لوحة تقليدية.",
    "",
    "📐 البنية الإلزامية:",
    "1) Reactive Store + Plugin Registry يكتشف public/plugins/*.js.",
    "2) Offline-First: Service Worker + Sync Queue.",
    "3) Local-First: كل نشر يُحفظ في localStorage فوراً ثم يُبثّ عبر WebSocket.",
    "",
    "🧪 ميزات مطلوبة (أضف واحدة جديدة على الأقل كل دورة):",
    "• محرك NLP عربي محلي: extractEntities(text) → {item, price, place, unit, confidence}.",
    "• مؤشر تذبذب (Volatility Index) لآخر 7 أيام.",
    "• كشف شذوذ (Anomaly z-score).",
    "• تنبؤ خطي بسيط لسعر الغد.",
    "• خريطة حرارة نصية للمدن السودانية.",
    "• مقارنة ذكية: أرخص 3 بائعين + نسبة التوفير.",
    "• مؤشر ثقة (Confidence 0-100).",
    "• نبض السوق (Market Pulse SVG).",
    "• مساعد صوتي (Web Speech API + fallback).",
    "• Developer Console داخل الموقع.",
    "",
    "🛡️ الصلابة:",
    "• window.onerror + unhandledrejection إلزامي.",
    "• كل ملف JS صالح الصياغة.",
    "• كل JSON صالح.",
    "• لا روابط مطلقة /."
  ].join("\n");

  let agreedPlan = "";
  let activeExecutor = null;
  const planner = providers[0];
  const critic = providers[1] || providers[0];

  console.log(`🤝 حوار معماري: [${planner.label}] ↔ [${critic.label}]`);
  try {
    const prop = await planner.runText(
      "أنت مهندس معماري مبتكر. صمّم خطة تطوير جريئة وغير تقليدية لموقع سوق سوداني، مع التركيز على ميزة واحدة جديدة خارج الصندوق.",
      `📊 التشخيص:\n${diagnosticReport}\n\n🧠 الذاكرة:\n${memoryContext}\n\n📜 الميثاق:\n${manifesto}\n\n📂 الملفات:\n${currentFiles}`,
      900
    );
    console.log(`💡 مقترح ${planner.label} جاهز.`);
    try {
      const rev = await critic.runText(
        "أنت الناقد الهندسي. راجع الخطة، اكتشف نقاط الضعف، ثم اكتب [اتفقنا] متبوعاً بخطة نهائية معدّلة.",
        `المقترح:\n${prop.text}\n\nالتشخيص:\n${diagnosticReport}\n\nالذاكرة:\n${memoryContext}\n\nالميثاق:\n${manifesto}`,
        900
      );
      agreedPlan = rev.text;
      activeExecutor = critic;
      console.log(`✅ اتفاق عبر ${critic.label}.`);
    } catch (e) {
      agreedPlan = `[اتفاق مباشر]\n${prop.text}`;
      activeExecutor = planner;
      console.warn(`⚠️ الناقد تعذر (${e.message}) — يكمل Planner.`);
    }
  } catch (e) {
    console.warn(`⚠️ Planner تعذر (${e.message}) — Solo من ${critic.label}.`);
    const solo = await critic.runText(
      "أنت المنفذ المستقل. ضع خطة فورية لميزة غير تقليدية + إصلاح كل المشاكل.",
      `التشخيص:\n${diagnosticReport}\n\nالذاكرة:\n${memoryContext}\n\nالميثاق:\n${manifesto}\n\nالملفات:\n${currentFiles}`,
      900
    );
    agreedPlan = `[عمل مستقل]\n${solo.text}`;
    activeExecutor = critic;
  }

  const systemJson = [
    "أنت مهندس برمجيات محترف يكتب كوداً خالياً من الأخطاء.",
    "أعد كائن JSON صالحاً فقط بدون أي نص خارج JSON.",
    "⚠️ مهم: كل قيمة داخل files يجب أن تكون سلسلة كاملة تنتهي بشكل صحيح — لا تقطع أي ملف.",
    "الشكل بدقة:",
    '{"files":{"path/to/file":"full content"},"summary":"ملخص","newIdea":"ميزة جديدة","memoryUpdate":{"ideas":["..."],"knownIssues":["..."]}}'
  ].join("\n");

  const execPrompt = [
    "نفّذ الخطة بدقة مع ميزة خارج الصندوق جديدة، وأصلح كل الأخطاء:",
    agreedPlan, "", "=== التشخيص ===", diagnosticReport, "",
    "=== الذاكرة ===", memoryContext, "",
    "=== الميثاق ===", manifesto, "",
    "=== الملفات الحالية ===", currentFiles,
    "",
    "⚠️ تنبيه: أعد فقط الملفات التي تحتاج تعديلاً فعلياً. لا تعد كتابة ملفات لم تتغير.",
    "⚠️ تنبيه: كل ملف يجب أن يكون كاملاً — لا تقطعه."
  ].join("\n");

  const orderedExec = [activeExecutor, ...providers.filter(p => p !== activeExecutor)].filter(Boolean);
  let execResult = null, lastErr = null, validationErrors = [];

  for (const ep of orderedExec) {
    console.log(`🔧 محاولة تنفيذ عبر ${ep.label}...`);
    try {
      let r = await ep.runJson(systemJson, execPrompt, 8000);
      let errs = validateGeneratedFiles(r?.parsed?.files);
      if (errs.length) {
        console.warn(`⚠️ تحقق ${ep.label}: ${errs.slice(0, 3).join(" | ")} — إعادة محاولة.`);
        const retry = `${execPrompt}\n\n=== أخطاء يجب تصحيحها ===\n${errs.join("\n")}`;
        r = await ep.runJson(systemJson, retry, 8000);
        errs = validateGeneratedFiles(r?.parsed?.files);
        if (errs.length) { lastErr = new Error(errs.join(" | ")); continue; }
      }
      execResult = r; validationErrors = []; lastErr = null;
      console.log(`✅ نجح التنفيذ عبر ${ep.label}`);
      break;
    } catch (e) {
      lastErr = e;
      console.warn(`⚠️ تنفيذ ${ep.label} فشل: ${e.message}`);
    }
  }

  // ✅ إصلاح 5: حفظ الذاكرة حتى لو فشل كل شيء (لتذكّر المشاكل)
  if (!execResult?.parsed) {
    memory.knownIssues.push(`فشل كامل في ${new Date().toISOString()}: ${lastErr?.message || "unknown"}`);
    saveMemory(memory);
    failWithReason(`فشل التوليد من جميع المزودين: ${lastErr?.message || "unknown"}`);
  }

  const parsed = execResult.parsed;
  console.log(`✅ AI STATUS: WORKING (${execResult.detail})`);
  console.log("📝 ملخص:", parsed.summary || "—");
  if (parsed.newIdea) console.log("💡 فكرة جديدة:", parsed.newIdea);

  let updated = 0;
  const changedFiles = [];
  if (parsed.files && typeof parsed.files === "object") {
    for (const [fp, content] of Object.entries(parsed.files)) {
      const p = String(fp).replace(/^\/+/, "").trim();
      if (!p || p.includes("..") || typeof content !== "string" || !content.trim()) continue;
      if (p.endsWith(".json")) { try { JSON.parse(content); } catch { console.warn(`⏭️ تخطي JSON غير صالح: ${p}`); continue; } }
      const dir = path.dirname(p); if (dir && dir !== ".") fs.mkdirSync(dir, { recursive: true });
      const prev = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
      if (prev !== content) {
        fs.writeFileSync(p, content, "utf8");
        updated++; changedFiles.push(p);
        console.log(`📝 ${p}`);
      }
    }
  }
  console.log(`📦 ملفات تغيّرت: ${updated}`);

  memory.history.push({
    ts: new Date().toISOString(),
    summary: String(parsed.summary || "تحديث").slice(0, 200),
    files: changedFiles.slice(0, 12)
  });
  if (parsed.newIdea) memory.ideas.push(String(parsed.newIdea).slice(0, 200));
  if (parsed.memoryUpdate?.ideas) memory.ideas.push(...parsed.memoryUpdate.ideas.map(String));
  if (parsed.memoryUpdate?.knownIssues) memory.knownIssues.push(...parsed.memoryUpdate.knownIssues.map(String));
  if (validationErrors.length) memory.knownIssues.push(...validationErrors);
  saveMemory(memory);

  if (updated > 0) {
    fs.writeFileSync("last_ai_change.txt",
      String(parsed.summary || "Autopilot cycle").replace(/[\r\n]+/g, " ").slice(0, 120), "utf8");
  }
}

run().catch(e => failWithReason(e.stack || e.message));
