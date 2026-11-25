/* =====================================================================
 * SUDAN MARKET — AUTOPILOT v3.3
 * "One Feature Per Cycle" + Verification + Feature Templates
 * ===================================================================== */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const CANONICAL_PAGES_URL = "https://mb4252.github.io/sudan-market-/";
const CANONICAL_RENDER_URL = "https://sudan-market-2.onrender.com";
const MEMORY_FILE = "ai-memory.json";
const MAX_MEMORY_ITEMS = 40;

// ============ قائمة الميزات المتقدمة (مرتبة بالأولوية) ============
const ADVANCED_FEATURES = [
  {
    id: "unhandled-errors",
    name: "ملتقط الأخطاء العام",
    detect: (combined) => /window\.addEventListener\(["']error["']|onunhandledrejection/.test(combined),
    template: `// في أعلى public/app.js
window.addEventListener("error", (e) => {
  const bar = document.getElementById("errorBar") || (() => {
    const b = document.createElement("div");
    b.id = "errorBar";
    b.style.cssText = "position:fixed;top:0;left:0;right:0;background:#c0392b;color:#fff;padding:8px;z-index:9999;font-family:monospace;font-size:13px;";
    document.body.appendChild(b);
    return b;
  })();
  bar.textContent = "⚠️ خطأ: " + (e.message || e.error?.message || "غير معروف");
  bar.style.display = "block";
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("Unhandled rejection:", e.reason);
  const bar = document.getElementById("errorBar");
  if (bar) { bar.textContent = "⚠️ وعد مرفوض: " + (e.reason?.message || e.reason); bar.style.display = "block"; }
});`
  },
  {
    id: "nlp-extractor",
    name: "محرك NLP عربي محلي",
    detect: (combined) => /extractEntities|parseFreeText|entityExtract/.test(combined),
    template: `// في public/nlp.js — محرك استخراج كيانات عربي محلي
function extractEntities(text) {
  const t = String(text || "");
  const places = ["الخرطوم","أم درمان","بحري","بورتسودان","كسلا","القضارف","مدني","الأبيض","نيالا","الفاشر","دنقلا","عطبرة"];
  const units = ["كيلو","كجم","جرام","لتر","جالون","قطعة","كرتون","جوال","شوال","دستة","رطل"];
  const itemMatch = t.match(/(?:سعر|أبيع|أشتري|عندي|متوفر)\\s+([\\u0600-\\u06FF\\s]{2,20}?)\\s+(?:بـ|ب|بسعر|بمبلغ|بـ\\s*)/);
  const priceMatch = t.match(/(\\d{2,7}(?:[.,]\\d{1,2})?)\\s*(?:جنيه|جنية|ج.س|SDG)/i);
  const placeMatch = places.find(p => t.includes(p));
  const unitMatch = units.find(u => t.includes(u));
  const item = itemMatch ? itemMatch[1].trim() : null;
  const price = priceMatch ? parseFloat(priceMatch[1].replace(",", ".")) : null;
  const confidence = [item, price, placeMatch, unitMatch].filter(Boolean).length * 25;
  return { item, price, place: placeMatch || null, unit: unitMatch || null, confidence };
}
if (typeof window !== "undefined") window.extractEntities = extractEntities;`
  },
  {
    id: "volatility-index",
    name: "مؤشر تذبذب الأسعار",
    detect: (combined) => /volatility|calculateVolatility|تذبذب/i.test(combined),
    template: `// في public/analytics.js
function calculateVolatility(prices) {
  if (!Array.isArray(prices) || prices.length < 2) return 0;
  const clean = prices.filter(p => typeof p === "number" && p > 0);
  if (clean.length < 2) return 0;
  const mean = clean.reduce((a, b) => a + b, 0) / clean.length;
  const variance = clean.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / clean.length;
  return Math.round((Math.sqrt(variance) / mean) * 100);
}`
  },
  {
    id: "anomaly-detection",
    name: "كشف شذوذ الأسعار",
    detect: (combined) => /anomaly|detectAnomaly|zscore|شذوذ/i.test(combined),
    template: `// في public/analytics.js
function detectAnomaly(price, history) {
  if (!Array.isArray(history) || history.length < 3) return { isAnomaly: false, zscore: 0 };
  const clean = history.filter(p => typeof p === "number" && p > 0);
  const mean = clean.reduce((a, b) => a + b, 0) / clean.length;
  const sd = Math.sqrt(clean.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / clean.length);
  if (sd === 0) return { isAnomaly: false, zscore: 0 };
  const z = (price - mean) / sd;
  return { isAnomaly: Math.abs(z) > 2, zscore: +z.toFixed(2) };
}`
  },
  {
    id: "forecast",
    name: "تنبؤ السعر",
    detect: (combined) => /forecast|predictPrice|linearTrend/i.test(combined),
    template: `// في public/analytics.js
function forecastPrice(prices) {
  if (!Array.isArray(prices) || prices.length < 2) return null;
  const clean = prices.filter(p => typeof p === "number" && p > 0);
  if (clean.length < 2) return null;
  const n = clean.length;
  const xs = clean.map((_, i) => i);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = clean.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * clean[i], 0);
  const sumX2 = xs.reduce((a, x) => a + x * x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return Math.round(intercept + slope * n);
}`
  },
  {
    id: "plugin-registry",
    name: "سجل إضافات",
    detect: (combined) => /registerPlugin|pluginRegistry/.test(combined),
    template: `// في public/core.js
const PluginRegistry = {
  _plugins: {},
  register(name, plugin) { this._plugins[name] = plugin; console.log("🔌 plugin:", name); },
  get(name) { return this._plugins[name]; },
  list() { return Object.keys(this._plugins); },
  async loadAll() {
    const list = window.__PLUGIN_LIST__ || [];
    for (const url of list) { try { await import(url); } catch(e) { console.warn("plugin fail:", url, e); } }
  }
};
if (typeof window !== "undefined") window.PluginRegistry = PluginRegistry;`
  },
  {
    id: "confidence",
    name: "مؤشر الثقة",
    detect: (combined) => /confidenceScore|calculateConfidence/.test(combined),
    template: `// في public/analytics.js
function calculateConfidence(post) {
  if (!post) return 0;
  let s = 0;
  if (post.item) s += 30;
  if (post.price && post.price > 0) s += 30;
  if (post.place) s += 20;
  if (post.unit) s += 10;
  if (post.seller) s += 10;
  return Math.min(100, s);
}`
  },
  {
    id: "market-pulse",
    name: "نبض السوق",
    detect: (combined) => /MarketPulse|marketPulse|renderPulse/.test(combined),
    template: `// في public/ui.js
function renderPulse(container, series) {
  if (!container) return;
  const max = Math.max(...series, 1);
  container.innerHTML = series.map((v, i) => {
    const h = Math.round((v / max) * 60);
    return '<span style="display:inline-block;width:6px;margin:0 2px;height:' + h + 'px;background:#3498db;vertical-align:bottom;border-radius:2px;" title="' + v + '"></span>';
  }).join("");
}`
  }
];

// ---------- utilities ----------
function failWithReason(reason) {
  console.error("❌ AI STATUS: FAILED");
  console.error("سبب الفشل:", reason);
  process.exit(1);
}
function sanitizeUrl(raw, fb = "") {
  let u = String(raw || "").trim();
  const md = u.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (md) u = (md[2] || md[1] || "").trim();
  u = u.replace(/^<|>$/g, "").trim();
  return u || fb;
}
function loadMemory() {
  try {
    if (!fs.existsSync(MEMORY_FILE)) return { history: [], ideas: [], knownIssues: [], disabledModels: {}, openRouterBlockedUntil: 0, builtFeatures: [] };
    const raw = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
    return {
      history: raw.history || [],
      ideas: raw.ideas || [],
      knownIssues: raw.knownIssues || [],
      disabledModels: raw.disabledModels || {},
      openRouterBlockedUntil: Number(raw.openRouterBlockedUntil || 0),
      builtFeatures: raw.builtFeatures || []
    };
  } catch { return { history: [], ideas: [], knownIssues: [], disabledModels: {}, openRouterBlockedUntil: 0, builtFeatures: [] }; }
}
function saveMemory(mem) {
  mem.history = mem.history.slice(-MAX_MEMORY_ITEMS);
  mem.ideas = [...new Set(mem.ideas)].slice(-MAX_MEMORY_ITEMS);
  mem.knownIssues = [...new Set(mem.knownIssues)].slice(-MAX_MEMORY_ITEMS);
  mem.builtFeatures = [...new Set(mem.builtFeatures || [])];
  const now = Date.now();
  for (const k of Object.keys(mem.disabledModels || {})) {
    if (mem.disabledModels[k] < now) delete mem.disabledModels[k];
  }
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(mem, null, 2), "utf8");
}

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

function validateGeneratedFiles(filesMap) {
  const errors = [];
  if (!filesMap || typeof filesMap !== "object") return ["كائن files مفقود."];
  const htmlEntry = filesMap["index.html"];
  const htmlIds = new Set();
  if (typeof htmlEntry === "string") {
    for (const m of htmlEntry.matchAll(/\bid=["']([^"']+)["']/g)) htmlIds.add(m[1]);
  }
  for (const [rawPath, content] of Object.entries(filesMap)) {
    const p = String(rawPath).replace(/^\/+/, "").trim();
    if (!p || p.includes("..") || typeof content !== "string" || !content.trim()) { errors.push(`مسار/محتوى غير صالح: ${rawPath}`); continue; }
    if (p.endsWith(".json")) { try { JSON.parse(content); } catch (e) { errors.push(`JSON خطأ في ${p}: ${e.message}`); } }
    else if (p.endsWith(".js") && !p.endsWith("sw.js")) { try { new vm.Script(content, { filename: p }); } catch (e) { errors.push(`JS خطأ في ${p}: ${e.message}`); } }
  }
  if (typeof htmlEntry === "string") {
    for (const [p, content] of Object.entries(filesMap)) {
      if (!p.endsWith(".js") || typeof content !== "string") continue;
      const refs = [...content.matchAll(/getElementById\(["']([^"']+)["']\)/g)].map(m => m[1]);
      const missing = [...new Set(refs.filter(id => !htmlIds.has(id)))];
      if (missing.length) errors.push(`DOM مفقود في ${p}: ${missing.join(", ")}`);
    }
  }
  return errors;
}

async function probeLiveEndpoints(pagesUrl, renderUrl) {
  const lines = [];
  const p = sanitizeUrl(pagesUrl, CANONICAL_PAGES_URL);
  const r = sanitizeUrl(renderUrl, CANONICAL_RENDER_URL).replace(/\/+$/, "");
  try {
    const res = await fetch(p, { signal: AbortSignal.timeout(12000) });
    const html = await res.text();
    const srcs = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]);
    lines.push(`Pages: HTTP ${res.status} | ${srcs.length} سكربت`);
  } catch (e) { lines.push(`Pages فشل: ${e.message}`); }
  try {
    const h = await fetch(`${r}/health`, { signal: AbortSignal.timeout(15000) });
    lines.push(`Render /health: HTTP ${h.status} | ${(await h.text()).slice(0, 100)}`);
  } catch (e) { lines.push(`Render فشل: ${e.message}`); }
  return lines.join("\n");
}

// ✅ فحص فعلي: هل الميزة موجودة في الملفات الحقيقية؟
function detectMissingFeatures(filesList) {
  const combined = filesList.map(f => f.raw).join("\n");
  return ADVANCED_FEATURES.filter(f => !f.detect(combined));
}

// ---------- providers ----------
async function getGroqModelsOrdered(apiKey, disabled) {
  const preferred = ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "llama-3.1-8b-instant", "gemma2-9b-it"];
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) return preferred.filter(m => !(disabled[m] > Date.now()));
    const data = await res.json();
    const now = Date.now();
    const avail = (data.data || []).map(m => m.id).filter(id => id && !/whisper|tts|guard|embed/i.test(id)).filter(id => !(disabled[id] > now));
    const ordered = [];
    for (const p of preferred) if (avail.includes(p) && !ordered.includes(p)) ordered.push(p);
    for (const id of avail) if (!ordered.includes(id)) ordered.push(id);
    return ordered.length ? ordered : preferred.filter(m => !(disabled[m] > Date.now()));
  } catch { return preferred.filter(m => !(disabled[m] > Date.now())); }
}

function tryRepairJson(c) {
  let s = String(c || "").trim();
  const fb = s.indexOf("{"); if (fb > 0) s = s.slice(fb);
  const lb = s.lastIndexOf("}"); if (lb !== -1) s = s.slice(0, lb + 1);
  let inStr = false, esc = false, open = 0;
  for (const ch of s) {
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === "\"") { inStr = !inStr; continue; }
    if (!inStr) { if (ch === "{") open++; else if (ch === "}") open = Math.max(0, open - 1); }
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
async function callChat(url, headers, body) {
  const res = await fetch(sanitizeUrl(url), { method: "POST", headers, body: JSON.stringify(body) });
  const txt = await res.text();
  let data;
  try { data = JSON.parse(txt); } catch { const e = new Error(`غير JSON (HTTP ${res.status})`); e.status = res.status; throw e; }
  if (!res.ok || data.error) { const e = new Error(`HTTP ${res.status}: ${data?.error?.message || txt.slice(0, 200)}`); e.status = res.status; throw e; }
  return data;
}
function isTruncated(t) {
  t = String(t || "").trim();
  if (!t.endsWith("}")) return true;
  let d = 0, s = false, e = false;
  for (const c of t) {
    if (e) { e = false; continue; }
    if (c === "\\") { e = true; continue; }
    if (c === "\"") { s = !s; continue; }
    if (!s) { if (c === "{") d++; else if (c === "}") d--; }
  }
  return d !== 0;
}

function buildProviders(primary, or, mistral, memory) {
  const list = [], seen = new Set(), now = Date.now();
  const wrap = (id, label, runner) => {
    list.push({
      id, label,
      runText: async (sys, usr, max = 800) => ({ text: await runner(sys, usr, max, false), detail: label }),
      runJson: async (sys, usr, max = 8000) => {
        const raw = await runner(sys, usr, max, true);
        if (isTruncated(raw)) throw new Error(`${label}: رد مقطوع`);
        return { parsed: extractJsonObject(raw), detail: label };
      }
    });
  };

  if (mistral && !seen.has(mistral)) {
    seen.add(mistral);
    wrap("mistral", "Mistral", async (sys, usr, max, jsonMode) => {
      const models = ["codestral-latest", "mistral-small-latest", "open-mistral-nemo"];
      let lastErr;
      for (const m of models) {
        if (memory.disabledModels[m] > now) continue;
        try {
          const body = { model: m, messages: [{ role: "system", content: sys }, { role: "user", content: usr }], max_tokens: Math.min(max, 8192), temperature: 0.6 };
          if (jsonMode && m !== "codestral-latest") body.response_format = { type: "json_object" };
          const d = await callChat("https://api.mistral.ai/v1/chat/completions", { "Content-Type": "application/json", Authorization: `Bearer ${mistral}` }, body);
          const out = d?.choices?.[0]?.message?.content || "";
          if (out.trim()) return out;
        } catch (e) { lastErr = e; if (e.status === 404) memory.disabledModels[m] = now + 86400000; }
      }
      throw lastErr || new Error("Mistral failed");
    });
  }

  for (const key of [primary, or].map(k => (k || "").trim()).filter(Boolean)) {
    if (seen.has(key)) continue; seen.add(key);
    if (key.startsWith("gsk_")) {
      wrap("groq", "Groq", async (sys, usr, max, jsonMode) => {
        const models = await getGroqModelsOrdered(key, memory.disabledModels);
        let lastErr;
        for (const m of models) {
          try {
            const body = { model: m, messages: [{ role: "system", content: sys }, { role: "user", content: usr }], max_tokens: Math.min(max, 8192), temperature: 0.6 };
            if (jsonMode) body.response_format = { type: "json_object" };
            const d = await callChat("https://api.groq.com/openai/v1/chat/completions", { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body);
            const out = d?.choices?.[0]?.message?.content || "";
            if (out.trim()) return out;
          } catch (e) { lastErr = e; if (e.status === 404) { memory.disabledModels[m] = now + 86400000; continue; } if (e.status === 429) continue; }
        }
        throw lastErr || new Error("Groq failed");
      });
    } else if (key.startsWith("sk-or-")) {
      wrap("openrouter", "OpenRouter", async (sys, usr, max) => {
        if (memory.openRouterBlockedUntil > now) throw new Error("OpenRouter محظور مؤقتاً");
        try {
          const d = await callChat("https://openrouter.ai/api/v1/chat/completions", { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, {
            model: "openrouter/free", messages: [{ role: "system", content: sys }, { role: "user", content: usr }], max_tokens: Math.min(max, 8192), temperature: 0.6
          });
          const out = d?.choices?.[0]?.message?.content || "";
          if (!out.trim()) throw new Error("OpenRouter empty");
          return out;
        } catch (e) { if (e.status === 429) memory.openRouterBlockedUntil = now + 43200000; throw e; }
      });
    }
  }
  const pri = { mistral: 1, groq: 2, openrouter: 3 };
  list.sort((a, b) => (pri[a.id] || 9) - (pri[b.id] || 9));
  return list;
}

// ===================== MAIN =====================
async function run() {
  const primary = (process.env.AI_API_KEY || "").trim();
  const or = (process.env.OPENROUTER_API_KEY || "").trim();
  const mistral = (process.env.MISTRAL_API_KEY || "").trim();
  const pagesUrl = sanitizeUrl(process.env.PAGES_URL, CANONICAL_PAGES_URL);
  const renderUrl = sanitizeUrl(process.env.RENDER_URL, CANONICAL_RENDER_URL);

  const memory = loadMemory();
  const providers = buildProviders(primary, or, mistral, memory);
  if (!providers.length) failWithReason("لا يوجد مزود صالح.");

  console.log("📋 المزودون:", providers.map(p => p.label).join(" → "));

  const filesList = collectProjectFiles(".");
  const missing = detectMissingFeatures(filesList);

  console.log(`🔍 ميزات مفقودة: ${missing.length ? missing.map(m => m.name).join(", ") : "لا شيء — ممتاز!"}`);

  // ✅ الميزة الملزمة هذه الدورة (الأولى المفقودة)
  let forcedFeature = null;
  if (missing.length) {
    // تخطَّ الميزات التي فشلت سابقاً أكثر من مرتين
    const failedCounts = {};
    (memory.history || []).forEach(h => { if (h.failedFeature) failedCounts[h.failedFeature] = (failedCounts[h.failedFeature] || 0) + 1; });
    forcedFeature = missing.find(f => (failedCounts[f.id] || 0) < 2) || missing[0];
    console.log(`🎯 ميزة هذه الدورة: ${forcedFeature.name} (${forcedFeature.id})`);
  }

  const liveReport = await probeLiveEndpoints(pagesUrl, renderUrl);
  const diagnosticReport = `فحص حي:\n${liveReport}\n\nميزات مفقودة (${missing.length}):\n${missing.map((m, i) => `${i + 1}. ${m.name}`).join("\n") || "—"}`;
  console.log("🩺", diagnosticReport);

  const relevantFiles = filesList.filter(f => f.fullPath === "index.html" || f.fullPath.startsWith("public/") || f.fullPath === "server.js");
  const currentFiles = relevantFiles.map(f => `--- ${f.fullPath} ---\n${f.content}`).join("\n\n").slice(0, 5000);

  const memoryContext = [
    `آخر دورات:`,
    memory.history.slice(-5).map(h => `• ${h.ts}: ${h.summary}${h.failedFeature ? ` [فشلت: ${h.failedFeature}]` : ""}`).join("\n") || "(لا يوجد)",
    "",
    `ميزات بُنيت سابقاً: ${(memory.builtFeatures || []).join(", ") || "(لا شيء)"}`,
    "",
    `أفكار:`,
    memory.ideas.slice(-5).map(i => `• ${i}`).join("\n") || "(لا يوجد)",
    "",
    `مشاكل:`,
    memory.knownIssues.slice(-5).map(i => `• ${i}`).join("\n") || "(لا يوجد)"
  ].join("\n");

  const manifesto = [
    `GitHub Pages: ${pagesUrl}`,
    `Render Bridge: ${renderUrl} (wss + /health)`,
    "",
    "🎯 الفلسفة: مختبر سوق ذكي، لا لوحة تقليدية.",
    "",
    "📐 البنية الإلزامية:",
    "• Reactive Store + Plugin Registry.",
    "• Offline-First: Service Worker + Sync Queue.",
    "• Local-First: حفظ في localStorage فوراً ثم بث عبر WebSocket.",
    "",
    "🛡️ الصلابة:",
    "• window.onerror + unhandledrejection.",
    "• كل JS صالح الصياغة.",
    "• كل JSON صالح.",
    "• لا روابط مطلقة /.",
    "",
    "📋 هذه الدورة: نفّذ فقط الميزة الملزمة المذكورة في user prompt."
  ].join("\n");

  // ========== التخطيط (سريع) ==========
  const planner = providers[0];
  const critic = providers[1] || providers[0];
  let agreedPlan = "";
  let activeExecutor = planner;

  console.log(`🤝 حوار: [${planner.label}] ↔ [${critic.label}]`);
  try {
    const prop = await planner.runText(
      "أنت مهندس معماري. خطتك يجب أن تركز فقط على الميزة الملزمة.",
      `📊 التشخيص:\n${diagnosticReport}\n\n🧠 الذاكرة:\n${memoryContext}\n\n📜 الميثاق:\n${manifesto}\n\n🎯 الميزة الملزمة: ${forcedFeature ? forcedFeature.name : "لا شيء (أصلح الأخطاء فقط)"}\n\n📂 الملفات:\n${currentFiles}`,
      700
    );
    try {
      const rev = await critic.runText(
        "أنت الناقد. اكتب [اتفقنا] + خطة تنفيذ مختصرة للميزة الملزمة.",
        `مقترح:\n${prop.text}\n\n🎯 الميزة: ${forcedFeature?.name || "—"}\n\n${manifesto}`,
        700
      );
      agreedPlan = rev.text;
      activeExecutor = critic;
      console.log(`✅ اتفاق عبر ${critic.label}.`);
    } catch (e) {
      agreedPlan = `[اتفاق مباشر]\n${prop.text}`;
      console.warn(`⚠️ الناقد فشل: ${e.message}`);
    }
  } catch (e) {
    agreedPlan = `[عمل مستقل] نفّذ الميزة: ${forcedFeature?.name || "إصلاحات"}`;
    activeExecutor = critic;
    console.warn(`⚠️ Planner فشل: ${e.message}`);
  }

  // ========== التنفيذ ==========
  const systemJson = [
    "أنت مهندس برمجيات. أعد JSON فقط بدون أي نص خارجه.",
    "⚠️ كل قيمة داخل files يجب أن تكون سلسلة كاملة — لا تقطع أي ملف.",
    'الشكل: {"files":{"path":"content"},"summary":"...","newIdea":"...","memoryUpdate":{"ideas":[],"knownIssues":[]}}'
  ].join("\n");

  const featureTemplateBlock = forcedFeature
    ? `\n\n=== قالب الميزة الملزمة (${forcedFeature.name}) ===\nيمكنك تعديله وتحسينه، لكن يجب أن يحتوي على الدوال الأساسية:\n\`\`\`js\n${forcedFeature.template}\n\`\`\`\n\n⚠️ أضف هذه الدوال إلى public/app.js أو public/plugins/${forcedFeature.id}.js، واربطها في index.html إذا لزم.`
    : "";

  const execPrompt = [
    `🎯 الميزة الملزمة الوحيدة هذه الدورة: ${forcedFeature ? forcedFeature.name : "لا شيء — أصلح الأخطاء"}`,
    "",
    "=== الخطة ===",
    agreedPlan,
    "",
    "=== التشخيص ===",
    diagnosticReport,
    "",
    "=== الذاكرة ===",
    memoryContext,
    "",
    "=== الميثاق ===",
    manifesto,
    "",
    "=== الملفات الحالية ===",
    currentFiles,
    featureTemplateBlock,
    "",
    "⚠️ تعليمات صارمة:",
    "1. نفّذ الميزة الملزمة فقط + أي إصلاحات ضرورية.",
    "2. أعد فقط الملفات التي تحتاج تعديلاً.",
    "3. كل ملف كامل — لا تقطعه.",
    "4. تأكد من window.onerror + unhandledrejection موجودة."
  ].join("\n");

  const orderedExec = [activeExecutor, ...providers.filter(p => p !== activeExecutor)];
  let execResult = null, lastErr = null;

  for (const ep of orderedExec) {
    console.log(`🔧 محاولة عبر ${ep.label}...`);
    try {
      let r = await ep.runJson(systemJson, execPrompt, 8000);
      let errs = validateGeneratedFiles(r?.parsed?.files);
      if (errs.length) {
        console.warn(`⚠️ تحقق ${ep.label}: ${errs.slice(0, 2).join(" | ")} — إعادة محاولة.`);
        r = await ep.runJson(systemJson, `${execPrompt}\n\n=== أخطاء يجب تصحيحها ===\n${errs.join("\n")}`, 8000);
        errs = validateGeneratedFiles(r?.parsed?.files);
        if (errs.length) { lastErr = new Error(errs.join(" | ")); continue; }
      }
      execResult = r; lastErr = null;
      console.log(`✅ نجح عبر ${ep.label}`);
      break;
    } catch (e) {
      lastErr = e;
      console.warn(`⚠️ ${ep.label} فشل: ${e.message}`);
    }
  }

  if (!execResult?.parsed) {
    memory.history.push({
      ts: new Date().toISOString(),
      summary: `فشل: ${lastErr?.message || "unknown"}`,
      failedFeature: forcedFeature?.id
    });
    memory.knownIssues.push(`فشل ${new Date().toISOString()}: ${lastErr?.message || "unknown"}`);
    saveMemory(memory);
    failWithReason(`فشل التوليد: ${lastErr?.message || "unknown"}`);
  }

  const parsed = execResult.parsed;
  console.log(`✅ AI STATUS: WORKING (${execResult.detail})`);
  console.log("📝 ملخص:", parsed.summary || "—");
  if (parsed.newIdea) console.log("💡 فكرة:", parsed.newIdea);

  let updated = 0;
  const changedFiles = [];
  if (parsed.files && typeof parsed.files === "object") {
    for (const [fp, content] of Object.entries(parsed.files)) {
      const p = String(fp).replace(/^\/+/, "").trim();
      if (!p || p.includes("..") || typeof content !== "string" || !content.trim()) continue;
      if (p.endsWith(".json")) { try { JSON.parse(content); } catch { continue; } }
      const dir = path.dirname(p); if (dir && dir !== ".") fs.mkdirSync(dir, { recursive: true });
      const prev = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
      if (prev !== content) { fs.writeFileSync(p, content, "utf8"); updated++; changedFiles.push(p); console.log(`📝 ${p}`); }
    }
  }
  console.log(`📦 تغيّر ${updated} ملف.`);

  // ✅ تحقق نهائي: هل الميزة بُنيت فعلاً؟
  let featureBuilt = false;
  if (forcedFeature) {
    const afterList = collectProjectFiles(".");
    featureBuilt = forcedFeature.detect(afterList.map(f => f.raw).join("\n"));
    console.log(featureBuilt ? `🎉 الميزة "${forcedFeature.name}" بُنيت بنجاح!` : `⚠️ لم تُبنَ الميزة "${forcedFeature.name}" بعد.`);
    if (featureBuilt) memory.builtFeatures.push(forcedFeature.id);
  }

  memory.history.push({
    ts: new Date().toISOString(),
    summary: String(parsed.summary || "تحديث").slice(0, 200),
    files: changedFiles.slice(0, 12),
    failedFeature: featureBuilt ? null : (forcedFeature?.id || null)
  });
  if (parsed.newIdea) memory.ideas.push(String(parsed.newIdea).slice(0, 200));
  if (parsed.memoryUpdate?.ideas) memory.ideas.push(...parsed.memoryUpdate.ideas.map(String));
  if (parsed.memoryUpdate?.knownIssues) memory.knownIssues.push(...parsed.memoryUpdate.knownIssues.map(String));
  saveMemory(memory);

  if (updated > 0) {
    fs.writeFileSync("last_ai_change.txt",
      String(parsed.summary || "Autopilot cycle").replace(/[\r\n]+/g, " ").slice(0, 120), "utf8");
  }
}

run().catch(e => failWithReason(e.stack || e.message));
