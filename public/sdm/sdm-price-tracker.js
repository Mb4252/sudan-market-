(function () {
  "use strict";

  const STORAGE_KEY = "sdm_daily_prices_v1";

  function safeParse(raw, fallback) {
    try {
      const parsed = JSON.parse(raw);
      return parsed ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function formatDateLabel(ts) {
    try {
      const d = new Date(ts || Date.now());
      if (Number.isNaN(d.getTime())) return "اليوم";
      return d.toLocaleDateString("ar-EG", { day: "numeric", month: "short" });
    } catch (_) {
      return "اليوم";
    }
  }

  function getPrices() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const list = safeParse(raw, []);
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function savePrices(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      return true;
    } catch (_) {
      return false;
    }
  }

  function addPriceEntry(entry) {
    try {
      if (!entry || typeof entry !== "object") {
        return { ok: false, error: "بيانات غير صالحة" };
      }

      const itemName = String(entry.item || "").trim();
      const area = String(entry.area || "عام").trim() || "عام";
      const priceNum = Number(entry.price);
      const author = String(entry.author || "مستخدم").trim() || "مستخدم";

      if (!itemName) {
        return { ok: false, error: "يرجى إدخال اسم السلعة" };
      }
      if (!Number.isFinite(priceNum) || priceNum <= 0) {
        return { ok: false, error: "يرجى إدخال سعر صحيح أكبر من صفر" };
      }

      const current = getPrices();
      const record = {
        id: String(Date.now()) + "_" + Math.random().toString(36).slice(2, 6),
        item: itemName,
        price: priceNum,
        area,
        author,
        createdAt: Date.now()
      };

      current.unshift(record);
      const trimmed = current.slice(0, 300);
      savePrices(trimmed);

      return { ok: true, record, total: trimmed.length };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : "خطأ أثناء الحفظ" };
    }
  }

  function getItemSummary(queryText) {
    try {
      const q = String(queryText || "").trim().toLowerCase();
      const all = getPrices();
      if (!all.length) {
        return { ok: false, message: "لا توجد أسعار مسجلة بعد. أضف أول سعر ليبدأ المؤشر." };
      }

      const matches = q
        ? all.filter((r) => {
            const nameMatch = String(r.item || "").toLowerCase().includes(q);
            const areaMatch = String(r.area || "").toLowerCase().includes(q);
            return nameMatch || areaMatch;
          })
        : all;

      const targetList = matches.length ? matches : all;
      const latest = targetList[0];
      const sum = targetList.reduce((acc, r) => acc + Number(r.price || 0), 0);
      const avg = sum / targetList.length;

      let diffText = "";
      if (targetList.length >= 2) {
        const prev = Number(targetList[1].price || 0);
        if (prev > 0) {
          const diff = Number(latest.price) - prev;
          const pct = ((diff / prev) * 100).toFixed(1);
          if (diff > 0) {
            diffText = ` (مرتفع عن السابق بـ +${diff} أي +${pct}%)`;
          } else if (diff < 0) {
            diffText = ` (منخفض عن السابق بـ ${diff} أي ${pct}%)`;
          } else {
            diffText = " (مستقر مقارنة بالسابق)";
          }
        }
      }

      const message =
        `📊 ${latest.item} (${latest.area}): آخر سعر ${latest.price}${diffText} | ` +
        `المتوسط المسجل: ${avg.toFixed(1)} (${targetList.length} قراءة، آخر تحديث ${formatDateLabel(latest.createdAt)}).`;

      return { ok: true, latest, average: avg, count: targetList.length, message };
    } catch (_) {
      return { ok: false, message: "تعذر قراءة ملخص الأسعار حالياً." };
    }
  }

  function answerSdmQuery(promptText) {
    try {
      const text = String(promptText || "").trim();
      if (!text) return null;

      const priceKeywords = ["سعر", "اسعار", "أسعار", "متوسط", "بكم", "كم", "مقارنة", "غالي", "رخيص"];
      const hasKeyword = priceKeywords.some((k) => text.toLowerCase().includes(k));
      if (!hasKeyword) return null;

      const cleaned = text
        .replace(/(سعر|اسعار|أسعار|متوسط|بكم|كم|مقارنة|اليوم|الان|الآن|في|عن|هل|ما)/gi, " ")
        .replace(/\s+/g, " ")
        .trim();

      const summary = getItemSummary(cleaned);
      return summary.ok ? summary.message : summary.message;
    } catch (_) {
      return null;
    }
  }

  function renderLatestList(containerId) {
    try {
      const el = document.getElementById(containerId);
      if (!el) return;

      const items = getPrices().slice(0, 10);
      if (!items.length) {
        el.textContent = "لا توجد قراءات أسعار بعد.";
        return;
      }

      el.innerHTML = "";
      items.forEach((r) => {
        const row = document.createElement("div");
        row.className = "sdm-price-row";
        row.textContent = `${r.item} — ${r.price} | ${r.area} (${formatDateLabel(r.createdAt)})`;
        el.appendChild(row);
      });
    } catch (_) {
      // تجاهل أي خطأ واجهة بشكل آمن
    }
  }

  try {
    window.sdmPriceTracker = {
      getPrices,
      addPriceEntry,
      getItemSummary,
      answerSdmQuery,
      renderLatestList
    };
  } catch (_) {
    // تجاهل تعذر الوصول للنافذة العالمية
  }
})();
