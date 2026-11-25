(function () {
  "use strict";

  function appendChatReply(chatEl, text) {
    try {
      if (!chatEl || !text) return;
      const line = document.createElement("div");
      line.className = "sdm-price-reply";
      line.textContent = text;
      chatEl.appendChild(line);
      chatEl.scrollTop = chatEl.scrollHeight;
    } catch (_) {
      // تجاهل آمن
    }
  }

  function initPriceUi() {
    try {
      const tracker = window.sdmPriceTracker;
      if (!tracker) return;

      tracker.renderLatestList("sdm-price-list");

      const addBtn = document.getElementById("price-add-btn");
      const itemEl = document.getElementById("price-item-input");
      const valEl = document.getElementById("price-value-input");
      const areaEl = document.getElementById("price-area-input");
      const nameEl = document.getElementById("sdm-name");
      const chatEl = document.getElementById("sdm-chat");

      if (addBtn && itemEl && valEl) {
        addBtn.addEventListener("click", function () {
          try {
            const res = tracker.addPriceEntry({
              item: itemEl.value,
              price: valEl.value,
              area: areaEl ? areaEl.value : "عام",
              author: nameEl ? nameEl.value : "مستخدم"
            });

            if (res && res.ok) {
              itemEl.value = "";
              valEl.value = "";
              tracker.renderLatestList("sdm-price-list");
              appendChatReply(
                chatEl,
                `✅ تم تسجيل سعر ${res.record.item}: ${res.record.price} (${res.record.area})`
              );
            } else if (res && res.error) {
              appendChatReply(chatEl, `⚠️ ${res.error}`);
            }
          } catch (_) {
            // تجاهل آمن
          }
        });
      }

      const msgEl = document.getElementById("sdm-message");
      const sendBtn = document.getElementById("sdm-send-btn");

      function handleQueryTrigger() {
        try {
          if (!msgEl || !chatEl) return;
          const reply = tracker.answerSdmQuery(msgEl.value);
          if (reply) {
            appendChatReply(chatEl, reply);
          }
        } catch (_) {
          // تجاهل آمن
        }
      }

      if (msgEl) {
        msgEl.addEventListener("keydown", function (ev) {
          if (ev.key === "Enter") {
            handleQueryTrigger();
          }
        });
      }

      if (sendBtn) {
        sendBtn.addEventListener("click", function () {
          handleQueryTrigger();
        });
      }
    } catch (_) {
      // تجاهل آمن
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPriceUi);
  } else {
    initPriceUi();
  }
})();
