/* Reading engine: AI generation, quality checks, summaries, and feedback repair. Loaded before script.js. */

function resetReadingFeedbackPanel() {
  const panel = document.getElementById("readingFeedbackPanel");
  if (!panel) return;
  panel.classList.remove("is-sent");
  panel.querySelectorAll(".reading-feedback-choice").forEach(btn => {
    btn.disabled = false;
    btn.classList.remove("active");
  });
  const label = panel.querySelector(".reading-feedback-panel__label");
  if (label) label.textContent = "这次解读";
  const detail = document.getElementById("readingFeedbackDetail");
  if (detail) detail.style.display = "none";
  const note = document.getElementById("readingFeedbackNote");
  if (note) note.value = "";
}

async function sendReadingFeedback(button) {
  const feedback = button?.getAttribute("data-feedback") || "";
  const panel = document.getElementById("readingFeedbackPanel");
  const label = panel?.querySelector(".reading-feedback-panel__label");
  if (!feedback || !latestReadingRecord || !panel) return;

  panel.querySelectorAll(".reading-feedback-choice").forEach(btn => {
    btn.classList.toggle("active", btn === button);
    btn.disabled = feedback === "accurate";
  });
  const detail = document.getElementById("readingFeedbackDetail");
  if (feedback === "unclear") {
    const note = document.getElementById("readingFeedbackNote");
    if (label) label.textContent = "说说哪里偏";
    if (detail) detail.style.display = "grid";
    if (note) note.focus();
    updateStatus("告诉我哪里偏了，我会用原牌面重新校准一版。");
    return;
  }

  if (feedback === "retry") {
    prepareRetryFromLatestReading();
    return;
  }

  if (detail) detail.style.display = "none";
  if (label) label.textContent = "已收到";

  const feedbackTextMap = {
    accurate: "用户认为这次解读准确",
    unclear: "用户认为这次解读有点偏",
    retry: "用户想重新提问或重新抽牌"
  };

  try {
    await fetch(apiUrl("/api/feedback"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "解读反馈",
        email: "未填写",
        message: [
          feedbackTextMap[feedback] || `用户反馈：${feedback}`,
          `问题：${latestReadingRecord.question || "未填写"}`,
          `牌阵：${latestReadingRecord.spread || "未知"}`,
          `时间：${latestReadingRecord.date || new Date().toLocaleString()}`
        ].join("\n"),
        page: window.location.href,
        createdAt: new Date().toISOString()
      })
    });
  } catch {
    // 反馈失败不打断用户阅读。
  } finally {
    panel.classList.add("is-sent");
    updateStatus("谢谢你的反馈，我会用它继续校准解读体验。");
  }
}

function getQuestionForRetry(record = latestReadingRecord) {
  const raw = String(record?.question || "").trim();
  return raw.replace(/^\[双人合盘：.*?\]\s*/, "").trim();
}

function prepareRetryFromLatestReading() {
  if (!latestReadingRecord) return;
  const question = getQuestionForRetry(latestReadingRecord);
  const spreadKey = latestReadingRecord.spreadKey || "";
  handleReturnToHomePage();
  setTimeout(() => {
    const input = document.getElementById("questionInput");
    const select = document.getElementById("spreadSelect");
    if (select && spreadKey && select.querySelector(`option[value="${spreadKey}"]`)) {
      select.value = spreadKey;
      renderSpread();
    }
    if (input && question && question !== "直觉速取") {
      input.value = question;
      input.focus();
      input.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    updateQuestionHint(false);
    renderSpreadGuide();
    updateStatus("已保留原问题和牌阵，你可以改一句再重新抽牌。");
  }, 320);
}

function renderFinalReading(markdownText = "", cards = drawnCardsData) {
  const streamContent = document.getElementById("streamContent");
  if (!streamContent) return;
  const cleaned = String(markdownText || "")
    .replace(/```html/gi, "")
    .replace(/```/g, "")
    .replace(/<\/?(?:div|span|style)[^>]*>/gi, "")
    .replace(/<h4>(.*?)<\/h4>/gi, "#### $1")
    .replace(/<\/?p>/gi, "\n")
    .replace(/<strong>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<\/?(?:ul|ol)>/gi, "")
    .replace(/<li>(.*?)<\/li>/gi, "- $1");
  if (typeof marked !== "undefined" && typeof marked.parse === "function") {
    streamContent.innerHTML = marked.parse(cleaned);
    sanitizeRenderedReading(streamContent);
  } else {
    streamContent.textContent = cleaned;
  }

  const names = [...new Set((Array.isArray(cards) ? cards : [])
    .map(item => normalizeCardName(item?.cardName || ""))
    .filter(Boolean))].sort((a, b) => b.length - a.length);
  if (names.length && streamContent.querySelectorAll("*").length) {
    const regex = new RegExp(`(${names.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
    const walker = document.createTreeWalker(streamContent, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || parent.closest("code, pre, .tarot-tag")) return NodeFilter.FILTER_REJECT;
        regex.lastIndex = 0;
        return regex.test(node.nodeValue || "") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const nodes = [];
    let current = walker.nextNode();
    while (current) {
      nodes.push(current);
      current = walker.nextNode();
    }
    nodes.forEach(node => {
      const frag = document.createDocumentFragment();
      String(node.nodeValue || "").split(regex).forEach(part => {
        if (!part) return;
        if (names.includes(part)) {
          const tag = document.createElement("span");
          tag.className = "tarot-tag";
          tag.textContent = part;
          frag.appendChild(tag);
        } else {
          frag.appendChild(document.createTextNode(part));
        }
      });
      node.parentNode?.replaceChild(frag, node);
    });
  }
  const hasSummary = renderReadingSummary(markdownText);
  streamContent.classList.toggle("is-summary-only", Boolean(hasSummary));
  if (!hasSummary) wrapReadingSectionsAsCollapsible();
}

function updateLatestHistoryRecord(nextReading) {
  if (!latestReadingRecord || !nextReading) return;
  latestReadingRecord.reading = nextReading;
  const idx = HistoryService.records.findIndex(record => (
    record.date === latestReadingRecord.date &&
    record.question === latestReadingRecord.question
  ));
  if (idx >= 0) {
    HistoryService.records[idx] = { ...HistoryService.records[idx], reading: nextReading, repairedAt: new Date().toLocaleString() };
    HistoryService.save();
    renderTimeline();
  }
}

async function repairReadingFromFeedback() {
  const noteEl = document.getElementById("readingFeedbackNote");
  const note = String(noteEl?.value || "").trim();
  if (!latestReadingRecord) return;
  if (!note) {
    updateStatus("先写一句哪里偏了，我才能更准确地校准。");
    noteEl?.focus();
    return;
  }

  const btn = document.getElementById("repairReadingBtn");
  const panel = document.getElementById("readingFeedbackPanel");
  const label = panel?.querySelector(".reading-feedback-panel__label");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "校准中…";
  }
  if (label) label.textContent = "正在校准";
  setAiStatusText("正在根据你的反馈重新校准解读…");
  const aiStatus = document.getElementById("aiStatus");
  if (aiStatus) aiStatus.style.display = "flex";
  updateStatus("正在用原牌面修正解读，不需要重新抽牌。");

  try {
    const repaired = await TarotApiService.requestFallbackReading({
      question: latestReadingRecord.question,
      cards: latestReadingRecord.cards || drawnCardsData,
      readingStyle: latestReadingRecord.style || "classic",
      userName: latestReadingRecord.userName,
      partnerName: latestReadingRecord.partnerName,
      emotionLevel: latestReadingRecord.emotionLevel,
      emotionLabel: latestReadingRecord.emotionLabel,
      isCompatibility: latestReadingRecord.isCompatibility,
      isNight: isNightMode,
      qualityIssue: `用户认为上一版有偏差：${note}。请围绕原问题重写，第一句话直接给结论。`,
      previousReading: latestReadingRecord.reading
    });
    if (!repaired?.reading) throw new Error("修正版为空");
    fetch(apiUrl("/api/feedback"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "解读纠偏",
        email: "未填写",
        message: [
          `用户认为上一版有偏差：${note}`,
          `问题：${latestReadingRecord.question || "未填写"}`,
          `牌阵：${latestReadingRecord.spread || "未知"}`
        ].join("\n"),
        page: window.location.href,
        createdAt: new Date().toISOString()
      })
    }).catch(() => {});
    renderFinalReading(repaired.reading, latestReadingRecord.cards || drawnCardsData);
    updateLatestHistoryRecord(repaired.reading);
    panel?.classList.add("is-sent");
    const detail = document.getElementById("readingFeedbackDetail");
    if (detail) detail.style.display = "none";
    if (label) label.textContent = "已校准";
    updateStatus("已根据你的反馈生成修正版，并更新到成长档案。");
  } catch (error) {
    updateStatus("校准暂时失败，可以稍后再试，或点“想重问”重新抽牌。");
  } finally {
    if (aiStatus) aiStatus.style.display = "none";
    if (btn) {
      btn.disabled = false;
      btn.textContent = "重新校准";
    }
  }
}

function renderMiniCardBar(cards = []) {
  const bar = document.getElementById("miniCardBar");
  if (!bar) return;

  const miniCards = Array.isArray(cards) ? cards.slice(0, 5) : [];
  if (!miniCards.length) {
    bar.style.display = "none";
    bar.innerHTML = "";
    return;
  }

  bar.innerHTML = miniCards.map((item, index) => {
    const emoji = String(item?.emoji || "🔮");
    const position = String(item?.position || `位置${index + 1}`);
    const baseName = normalizeCardName(item?.cardName || "");
    return `
      <div class="mini-card-item" role="button" tabindex="0" data-idx="${index}" title="${baseName}">
        <span class="mini-card-emoji">${emoji}</span>
        <span class="mini-card-position">${position}</span>
        <span class="mini-card-name">${baseName}</span>
      </div>
    `;
  }).join("");

  bar.style.display = "flex";
  bar.querySelectorAll(".mini-card-item").forEach(el => {
    const onClick = () => {
      const idx = parseInt(el.getAttribute("data-idx"), 10);
      if (!isNaN(idx) && drawnCardsData[idx]) openCardPreview(drawnCardsData[idx], idx);
    };
    el.addEventListener("click", onClick);
    el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") onClick(); });
  });
}

function wrapReadingSectionsAsCollapsible() {
  const container = document.getElementById("streamContent");
  if (!container) return;
  // Only wrap h3 headings that are NOT the quick-takeaway header
  const allH3 = Array.from(container.querySelectorAll("h3")).filter(h =>
    !h.textContent.includes("速览") && !h.textContent.includes("takeaway")
  );
  if (allH3.length < 2) return;

  allH3.forEach((h, idx) => {
    const nextH = allH3[idx + 1] || null;
    const parent = h.parentNode;
    if (!parent) return;

    const details = document.createElement("details");
    if (idx === 0) details.setAttribute("open", "");
    details.className = "reading-section-details";

    const summary = document.createElement("summary");
    summary.className = "reading-section-summary";
    summary.textContent = h.textContent.trim();
    details.appendChild(summary);

    // Collect sibling nodes between this h3 and the next h3
    const toMove = [];
    let cur = h.nextSibling;
    while (cur && cur !== nextH) {
      toMove.push(cur);
      cur = cur.nextSibling;
    }
    toMove.forEach(node => details.appendChild(node));
    parent.replaceChild(details, h);
  });
}

function escapeHtml(input = "") {
  return String(input || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function extractSectionBody(markdown = "", headings = []) {
  const text = String(markdown || "");
  if (!text.trim() || !Array.isArray(headings) || !headings.length) return "";

  const escaped = headings.map(item => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(
    `(?:^|\\n)#{3,4}\\s*(?:${escaped.join("|")})\\s*\\n([\\s\\S]*?)(?=\\n#{3,4}\\s+|$)`,
    "i"
  );
  const match = text.match(pattern);
  return match?.[1]?.trim() || "";
}

function extractSummaryModel(rawReading = "") {
  const reading = String(rawReading || "").trim();
  if (!reading) return null;

  const answerSection = extractSectionBody(reading, ["结论", "一句话答案", "先看结论", "神谕总览"]);
  const reminderSection = extractSectionBody(reading, ["关键提醒", "灵魂拆解", "破局之眼"]);
  const actionSection = extractSectionBody(reading, ["现在去做", "凡尘指南", "行动建议"]);

  const answer = stripRichText(answerSection).split(/(?<=[。！？!?])/).map(s => s.trim()).filter(Boolean)[0] || "";
  const reminderLines = stripRichText(reminderSection)
    .split(/(?<=[。！？!?])|\n/)
    .map(s => s.replace(/^[-*•\d.\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 3);
  const actionLines = String(actionSection || "")
    .split("\n")
    .map(line => stripRichText(line).replace(/^[-*•\d.\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 3);

  if (!answer && !reminderLines.length && !actionLines.length) return null;

  return {
    answer,
    firstAction: actionLines[0] || "",
    reminders: reminderLines,
    actions: actionLines
  };
}

function renderReadingSummary(rawHtml) {
  const box = document.getElementById("readingSummary");
  if (!box) return false;

  const summaryModel = extractSummaryModel(rawHtml);
  if (summaryModel) {
    const answerText = summaryModel.answer || "答案已经浮现，重点在于别再拖延关键一步。";
    const firstAction = summaryModel.firstAction || "把答案落成一个今天就能执行的小动作。";
    const reminderHtml = summaryModel.reminders.length
      ? `<ul>${summaryModel.reminders.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
      : `<p>先处理最卡住你的那一个点，再往下推进。</p>`;
    const actionHtml = summaryModel.actions.length
      ? `<ul>${summaryModel.actions.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
      : `<p>把答案落成一个今天就能执行的小动作。</p>`;

    box.innerHTML = `
      <section class="reading-answer-hero" aria-label="本次解牌核心答案">
        <div>
          <div class="reading-answer-hero__label">这次先看这里</div>
          <p class="reading-answer-hero__answer">${escapeHtml(answerText)}</p>
        </div>
        <div class="reading-answer-hero__action">
          <span>下一步</span>
          <strong>${escapeHtml(firstAction)}</strong>
        </div>
      </section>
      <div class="reading-summary-panel">
        <section class="reading-summary-card">
          <div class="reading-summary-card__label">关键提醒</div>
          ${reminderHtml}
        </section>
        <section class="reading-summary-card">
          <div class="reading-summary-card__label">现在去做</div>
          ${actionHtml}
        </section>
      </div>
    `;
    box.style.display = "block";
    return true;
  }

  // Fallback: extract first 3 sentences
  const plain = String(rawHtml || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!plain) { box.style.display = "none"; return false; }
  const parts = plain.split(/(?<=[。！？!?])/).map(s => s.trim()).filter(Boolean).slice(0, 3);
  if (!parts.length) { box.style.display = "none"; return false; }
  box.innerHTML = `<div class="reading-summary">${parts.join("")}</div>`;
  box.style.display = "block";
  return true;
}

const TarotApiService = {
  async requestReadingStream(payload, options = {}) {
    let response;
    try {
      response = await fetchWithTimeout("/api/tarot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: options.signal
      }, STREAM_REQUEST_TIMEOUT_MS);
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("星界连接超时，请稍后重试");
      }
      throw error;
    }

    if (!response.ok) {
      throw new Error("星界通道拥堵，请稍后重试");
    }

    if (!response.body) {
      throw new Error("响应流为空");
    }

    return response.body;
  },

  async requestDailyReading(card) {
    let response;
    try {
      response = await fetchWithTimeout("/api/tarot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDaily: true, cards: [card] })
      }, DAILY_REQUEST_TIMEOUT_MS);
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("日签连接超时，请稍后再试");
      }
      throw error;
    }

    if (!response.ok) {
      throw new Error("日签抽取失败");
    }

    return response.json();
  },

  async requestFallbackReading(payload, options = {}) {
    let response;
    try {
      response = await fetchWithTimeout("/api/tarot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, fallbackShort: true }),
        signal: options.signal
      }, FALLBACK_REQUEST_TIMEOUT_MS);
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("简版解牌连接超时");
      }
      throw error;
    }

    if (!response.ok) {
      throw new Error("简版解牌生成失败");
    }

    return response.json();
  }
};

function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const { signal, ...rest } = options;
  let timerId = 0;
  let abortForwarder = null;

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      abortForwarder = () => controller.abort();
      signal.addEventListener("abort", abortForwarder, { once: true });
    }
  }

  if (timeoutMs > 0) {
    timerId = window.setTimeout(() => controller.abort(), timeoutMs);
  }

  return fetch(apiUrl(url), {
      ...rest,
      signal: controller.signal
    }).finally(() => {
      if (timerId) clearTimeout(timerId);
      if (signal && abortForwarder) signal.removeEventListener("abort", abortForwarder);
    });
}

function sanitizeRenderedReading(root) {
  if (!root) return;

  root.querySelectorAll("script, style, iframe, object, embed, form, input, button, textarea, select, meta, link").forEach(el => {
    el.remove();
  });

  const allowedTags = new Set([
    "A", "P", "BR", "HR", "BLOCKQUOTE",
    "STRONG", "B", "EM", "I", "U", "S",
    "UL", "OL", "LI",
    "H1", "H2", "H3", "H4", "H5", "H6",
    "CODE", "PRE",
    "TABLE", "THEAD", "TBODY", "TR", "TH", "TD"
  ]);
  const allowedAttrs = {
    A: new Set(["href", "title", "target", "rel"])
  };
  const isSafeHref = href => {
    const value = String(href || "").trim();
    if (!value) return false;
    return /^(https?:|mailto:|#|\/)/i.test(value);
  };

  Array.from(root.querySelectorAll("*")).forEach(el => {
    if (!allowedTags.has(el.tagName)) {
      const parent = el.parentNode;
      if (!parent) {
        el.remove();
        return;
      }
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
      return;
    }

    Array.from(el.attributes).forEach(attr => {
      const name = attr.name.toLowerCase();
      const allowedForTag = allowedAttrs[el.tagName];
      const allowed = allowedForTag?.has(name) || false;
      if (!allowed) {
        el.removeAttribute(attr.name);
        return;
      }
      if (name === "href" && !isSafeHref(attr.value)) {
        el.removeAttribute("href");
      }
    });

    if (el.tagName === "A" && el.getAttribute("href")) {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
    }
  });
}

function extractQuestionSignals(question = "") {
  const text = String(question || "").toLowerCase();
  if (!text.trim()) return [];

  const groups = [
    ["复合", "分手", "喜欢", "爱", "暧昧", "关系", "感情", "恋爱", "前任", "伴侣", "对象", "婚姻", "他", "她", "ta"],
    ["工作", "事业", "offer", "面试", "跳槽", "老板", "同事", "项目", "副业", "客户", "合作", "升职", "辞职", "收入"],
    ["钱", "财", "赚钱", "投资", "存款", "涨薪", "工资", "预算", "债"],
    ["选择", "二选一", "要不要", "该不该", "能不能", "会不会", "是否", "值不值得", "适不适合", "还是"],
    ["未来", "走势", "发展", "多久", "什么时候", "本月", "月运", "今年", "明年", "近期", "三个月"]
  ];

  const signals = new Set();
  groups.flat().forEach(word => {
    if (text.includes(String(word).toLowerCase())) signals.add(word.toLowerCase());
  });
  return Array.from(signals);
}

const CONCRETE_ACTION_PATTERN = /(发|问|约|等|看|列|写|核对|确认|暂停|停止|停掉|取消|推迟|拒绝|设|沟通|记录|复盘|比较|提交|准备|观察|整理|收集|评估|联系|预约|保存|删除|申请|更新|检查|预算|边界)/;
const VAGUE_ACTION_PATTERN = /(相信|觉察|顺其自然|保持开放|接纳|臣服|提升能量|听从内心|等待宇宙|做好自己|放轻松|不要想太多)/;
const EVASIVE_ANSWER_PATTERN = /(答案在你心里|顺其自然|相信宇宙|命运会安排|看见自己|提升能量|保持开放|一切都会好|宇宙会给|灵魂课题)/;

function getQuestionIntentProfile(question = "") {
  const text = String(question || "").toLowerCase();
  const rules = [
    {
      id: "decision",
      keywords: ["要不要", "该不该", "能不能", "会不会", "是否", "值不值得", "适不适合", "二选一", "选择", "还是"],
      directPattern: /(建议|不建议|可以|不要|值得|不值得|能|不能|会|不会|暂缓|有机会|倾向|更适合|更推荐|优先|选择|选)/
    },
    {
      id: "relationship",
      keywords: ["复合", "分手", "喜欢", "暧昧", "关系", "感情", "恋爱", "前任", "伴侣", "对象", "他", "她", "ta"],
      directPattern: /(关系|对方|双方|沟通|边界|复合|喜欢|暧昧|感情|恋爱|前任|伴侣)/
    },
    {
      id: "career",
      keywords: ["工作", "事业", "offer", "面试", "跳槽", "老板", "同事", "项目", "副业", "收入", "升职", "辞职"],
      directPattern: /(工作|事业|机会|风险|项目|面试|跳槽|合作|收入|推进|节点|老板|同事)/
    },
    {
      id: "money",
      keywords: ["钱", "财", "赚钱", "投资", "存款", "涨薪", "工资", "预算", "债"],
      directPattern: /(钱|财务|收入|支出|预算|投资|风险|现金|涨薪|存款)/
    },
    {
      id: "timing",
      keywords: ["未来", "走势", "发展", "多久", "什么时候", "本月", "月运", "今年", "明年", "近期", "三个月"],
      directPattern: /(阶段|近期|本月|未来|走势|发展|节点|信号|触发|时间|节奏|处于|状态|停滞|破局)/
    }
  ];
  return rules.find(rule => rule.keywords.some(word => text.includes(String(word).toLowerCase()))) || null;
}

function extractActionLines(markdown = "") {
  const actionSection = extractSectionBody(markdown, ["现在去做", "行动建议", "下一步"]);
  return String(actionSection || "")
    .split(/\n|(?<=[。！？!?])/)
    .map(line => stripRichText(line).replace(/^[-*•\d.\s]+/, "").trim())
    .filter(Boolean);
}

function getReadingCardNames(cards = []) {
  return [...new Set((Array.isArray(cards) ? cards : [])
    .map(item => normalizeCardName(item?.cardName || item?.name || ""))
    .filter(name => name && name !== "未知牌"))];
}

function getFirstSentence(text = "") {
  return String(text || "")
    .split(/(?<=[。！？!?])|\n/)
    .map(item => item.trim())
    .filter(Boolean)[0] || "";
}

function evaluateReadingQuality(rawReading = "", question = "", cards = []) {
  const plain = stripRichText(rawReading).replace(/\s+/g, " ").trim();
  const reading = String(rawReading || "");
  const q = String(question || "").trim();
  const issues = [];

  if (!plain || plain.length < 80) {
    issues.push("内容过短，无法形成完整解读");
  }
  if (!/###\s*(我理解的问题|理解的问题|问题理解)/.test(reading)) {
    issues.push("缺少对用户问题的复述");
  }
  if (!/###\s*(结论|一句话答案|先看结论)/.test(reading)) {
    issues.push("缺少明确结论");
  }
  if (!/###\s*(现在去做|行动建议|下一步)/.test(reading)) {
    issues.push("缺少可执行建议");
  }

  const conclusionSection = stripRichText(extractSectionBody(reading, ["结论", "一句话答案", "先看结论"]));
  const firstConclusion = getFirstSentence(conclusionSection);
  const intent = getQuestionIntentProfile(q);
  if (intent && firstConclusion && !intent.directPattern.test(firstConclusion)) {
    issues.push("结论第一句没有直接回应问题类型");
  }

  if (firstConclusion && (EVASIVE_ANSWER_PATTERN.test(firstConclusion) || /(宇宙|命运|能量|灵魂课题|内在功课|看见自己)/.test(firstConclusion)) && !/(建议|不建议|可以|不要|值得|暂缓|有机会|倾向|风险|阻碍|先|等|观察)/.test(firstConclusion)) {
    issues.push("结论第一句太抽象，用户可能看不出答案");
  }
  if (firstConclusion && firstConclusion.length > 96) {
    issues.push("结论第一句过长，答案不够靠前");
  }
  if (firstConclusion && EVASIVE_ANSWER_PATTERN.test(firstConclusion)) {
    issues.push("结论第一句存在逃避式表达");
  }

  const actionLines = extractActionLines(reading);
  if (actionLines.length < 3) {
    issues.push("行动建议不足 3 条");
  }
  const concreteActions = actionLines.filter(line => CONCRETE_ACTION_PATTERN.test(line) && !VAGUE_ACTION_PATTERN.test(line));
  if (actionLines.length && concreteActions.length < Math.min(3, actionLines.length)) {
    issues.push("行动建议不够具体");
  }

  const signals = extractQuestionSignals(q);
  if (signals.length) {
    const normalizedReading = plain.toLowerCase();
    const hitCount = signals.filter(signal => normalizedReading.includes(signal)).length;
    if (hitCount === 0) {
      issues.push("没有明显回应用户问题的关键主题");
    }
    const understood = stripRichText(extractSectionBody(reading, ["我理解的问题", "理解的问题", "问题理解"])).toLowerCase();
    const understoodHits = signals.filter(signal => understood.includes(signal)).length;
    if (understood && understoodHits === 0) {
      issues.push("问题复述没有对齐用户原问题");
    }
  }

  const cardNames = getReadingCardNames(cards);
  const reasonSection = stripRichText(extractSectionBody(reading, ["为什么会这样", "牌面逻辑"]));
  if (cardNames.length && reasonSection) {
    const mentionedInReason = cardNames.filter(name => reasonSection.includes(name));
    if (!mentionedInReason.length) {
      issues.push("牌面逻辑没有回扣具体牌名");
    }
  }
  const reminderSection = stripRichText(extractSectionBody(reading, ["关键提醒", "提醒"]));
  if (cardNames.length && reminderSection) {
    const mentionedInReminder = cardNames.filter(name => reminderSection.includes(name));
    if (!mentionedInReminder.length && !/(现状|阻碍|未来|支持|反对|结局|机会|风险|主题)/.test(reminderSection)) {
      issues.push("关键提醒缺少牌面或位置依据");
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    message: issues.join("；")
  };
}

/* 流式输出解码 */
async function fetchStream(question, style, cards, context = getReadingContext(question, activeReadingMode)) {
  activeReadingAbortController?.abort();
  const requestController = new AbortController();
  activeReadingAbortController = requestController;
  const requestId = ++activeReadingRequestId;
  const isStaleRequest = () => requestId !== activeReadingRequestId;
  const streamContent = document.getElementById("streamContent"); const cursor = document.getElementById("cursor");
  streamContent.innerHTML = ""; let htmlBuffer = "";
  streamContent.classList.remove("is-summary-only");
  resetReadingFeedbackPanel();
  document.body.classList.add("reading-generating");
  document.getElementById("readingWrapper")?.setAttribute("aria-busy", "true");

  // #7 进度条：流式开始时显示
  const streamProgress = document.getElementById("streamProgressBar");
  if (streamProgress) { streamProgress.style.width = "0%"; streamProgress.parentElement.style.display = "block"; streamProgress.classList.add("streaming"); }
  const escapeRegExp = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const getCardBaseNames = () => {
    return [...new Set((Array.isArray(cards) ? cards : [])
      .map(item => String(item?.cardName || "").replace(/\s*\((逆位|正位)\)\s*/g, "").trim())
      .filter(Boolean))];
  };
  const applyTarotTagHighlight = () => {
    const root = streamContent;
    if (!root) return;
    const names = getCardBaseNames();
    if (!names.length) return;
    const sorted = names.slice().sort((a, b) => b.length - a.length);
    const nameSet = new Set(sorted);
    const regex = new RegExp(`(${sorted.map(escapeRegExp).join("|")})`, "g");
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const value = String(node?.nodeValue || "");
        if (!value.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest("code, pre, .tarot-tag")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const nodes = [];
    let current = walker.nextNode();
    while (current) {
      nodes.push(current);
      current = walker.nextNode();
    }

    nodes.forEach(node => {
      const text = String(node.nodeValue || "");
      const parts = text.split(regex);
      if (parts.length <= 1) return;

      const frag = document.createDocumentFragment();
      parts.forEach(part => {
        if (!part) return;
        if (nameSet.has(part)) {
          const tag = document.createElement("span");
          tag.className = "tarot-tag";
          tag.textContent = part;
          frag.appendChild(tag);
        } else {
          frag.appendChild(document.createTextNode(part));
        }
      });
      node.parentNode?.replaceChild(frag, node);
    });
  };

  const renderMarkdown = (markdownText = "", isFinal = false) => {
    if (isStaleRequest()) return;
    let cleaned = String(markdownText || "")
      .replace(/```html/gi, '').replace(/```/g, '')
      .replace(/<\/?(?:div|span|style)[^>]*>/gi, '')
      .replace(/<h4>(.*?)<\/h4>/gi, '#### $1')
      .replace(/<\/?p>/gi, '\n')
      .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
      .replace(/<\/?(?:ul|ol)>/gi, '')
      .replace(/<li>(.*?)<\/li>/gi, '- $1');
    if (typeof marked !== "undefined" && typeof marked.parse === "function") {
      streamContent.innerHTML = marked.parse(cleaned);
      sanitizeRenderedReading(streamContent);
      applyTarotTagHighlight();
      return;
    }
    streamContent.textContent = cleaned;
  };
  let rafPending = false;

  if (typeof marked !== "undefined" && typeof marked.setOptions === "function") {
    marked.setOptions({ gfm: true, breaks: true });
  }

  const aiStatus = document.getElementById("aiStatus"); if(aiStatus) aiStatus.style.display = "flex";
  setAiStatusText("塔罗解读中，正在对齐你的问题与牌面…");
  let historyRecord = null;
  const vipToken = readVipToken()?.token || null;
  if (vipToken) {
    // Consume the unlock once a paid reading actually starts requesting content.
    sessionStorage.removeItem(VIP_TOKEN_KEY);
    localStorage.removeItem(VIP_ORDER_ID_KEY);
  }
  const detailContext = context || getReadingContext(question, activeReadingMode);
  const compositeQuestion = detailContext.isCompatibility
    ? `[双人合盘：${detailContext.userName || "我"} x ${detailContext.partnerName}] ${detailContext.question || "关系走向"}`
    : detailContext.question;
  const userQuestionForQuality = detailContext.question || compositeQuestion || "";

  try {
    const streamBody = await TarotApiService.requestReadingStream({
      question: compositeQuestion,
      cards: cards,
      readingStyle: "classic",
      userName: detailContext.userName,
      partnerName: detailContext.partnerName,
      emotionLevel: detailContext.emotion.value,
      emotionLabel: detailContext.emotion.label,
      isCompatibility: detailContext.isCompatibility,
      isNight: isNightMode,
      vipToken
    }, { signal: requestController.signal });
    const reader = streamBody.getReader(); const decoder = new TextDecoder("utf-8");
    let streamLineBuffer = "";
    const processStreamLine = line => {
      const trimmed = String(line || "").trim();
      if (!trimmed || trimmed.includes("[DONE]") || !trimmed.startsWith("data: ")) return;
      try {
        const dataStr = trimmed.replace(/^data:\s*/, "");
        if (dataStr.startsWith("[ERROR]")) {
          htmlBuffer += `\n\n> ${dataStr}`;
          renderMarkdown(htmlBuffer);
          return;
        }
        const data = JSON.parse(dataStr);
        const content = data.choices?.[0]?.delta?.content || "";
        htmlBuffer += content;
        if (!rafPending) {
          rafPending = true;
          requestAnimationFrame(() => { renderMarkdown(htmlBuffer); rafPending = false; });
        }
        if (cursor) cursor.style.display = "inline-block";
      } catch (e) {
        console.error("流数据解析失败", e);
        updateStatus("内容加载有轻微抖动，系统正在自动修复中…");
      }
    };

    while (true) {
      if (requestController.signal.aborted || isStaleRequest()) {
        try { await reader.cancel(); } catch {}
        throw new DOMException("Reading aborted", "AbortError");
      }
      const { done, value } = await reader.read(); if (done) break;
      streamLineBuffer += decoder.decode(value, { stream: true });
      const lines = streamLineBuffer.split(/\r?\n/);
      streamLineBuffer = lines.pop() || "";
      for (const line of lines.map(item => item.trim()).filter(Boolean)) {
        processStreamLine(line);
      }
    }
    processStreamLine(streamLineBuffer);

    const quality = evaluateReadingQuality(htmlBuffer, userQuestionForQuality, cards);
    if (!quality.ok) {
      updateStatus("解读正在校准：系统发现上一版可能不够聚焦，正在自动修正。");
      setAiStatusText("正在校准答案，让结论更贴近你的问题…");
      try {
        const repaired = await TarotApiService.requestFallbackReading({
          question: compositeQuestion,
          cards,
          readingStyle: "classic",
          userName: detailContext.userName,
          partnerName: detailContext.partnerName,
          emotionLevel: detailContext.emotion.value,
          emotionLabel: detailContext.emotion.label,
          isCompatibility: detailContext.isCompatibility,
          isNight: isNightMode,
          vipToken,
          qualityIssue: quality.message
        }, { signal: requestController.signal });
        if (repaired?.reading) {
          htmlBuffer = repaired.reading;
        }
      } catch (repairError) {
        updateStatus("解读结构略有波动，已保留当前版本。你可以继续阅读或重新抽牌。");
      }
    }

    const spreadLabel = document.getElementById("spreadSelect") ? document.getElementById("spreadSelect").selectedOptions[0].innerText : "未知牌阵";
    const displayQuestion = compositeQuestion || "直觉速取";
    const mode = detailContext.mode === "compatibility" ? "双人合盘" : (detailContext.mode === "quick" ? "直觉速取" : "深度占卜");
    historyRecord = {
      mode,
      question: displayQuestion,
      style: "classic",
      spread: spreadLabel,
      spreadKey: document.getElementById("spreadSelect")?.value || "",
      date: new Date().toLocaleString(),
      cards,
      reading: htmlBuffer || streamContent.innerHTML,
      userName: detailContext.userName,
      partnerName: detailContext.partnerName,
      isCompatibility: detailContext.isCompatibility,
      emotionLabel: detailContext.emotion.label,
      emotionLevel: detailContext.emotion.value
    };
    renderMarkdown(htmlBuffer, true);
    const hasSummary = renderReadingSummary(historyRecord.reading);
    streamContent.classList.toggle("is-summary-only", Boolean(hasSummary));
    setFlowStep(3);
  } catch (error) {
    if (requestController.signal.aborted || isStaleRequest() || error?.name === "AbortError") {
      return;
    }
    try {
      setAiStatusText("网络不稳，正在切换到简版解读…");
      const fallback = await TarotApiService.requestFallbackReading({
        question: compositeQuestion,
        cards,
        readingStyle: "classic",
        userName: detailContext.userName,
        partnerName: detailContext.partnerName,
        emotionLevel: detailContext.emotion.value,
        emotionLabel: detailContext.emotion.label,
      isCompatibility: detailContext.isCompatibility,
      isNight: isNightMode,
      vipToken,
      qualityIssue: "流式解读失败，请直接围绕用户原问题给出简短、清楚、可执行的版本。"
    }, { signal: requestController.signal });
      const fallbackText = fallback.reading || "星界连接暂时不稳，已为你生成简版解牌。";
      renderMarkdown(fallbackText);
      const spreadLabel = document.getElementById("spreadSelect") ? document.getElementById("spreadSelect").selectedOptions[0].innerText : "未知牌阵";
      const displayQuestion = compositeQuestion || "直觉速取";
      const mode = detailContext.mode === "compatibility" ? "双人合盘" : (detailContext.mode === "quick" ? "直觉速取" : "深度占卜");
      historyRecord = {
        mode,
        question: displayQuestion,
        style: "classic",
        spread: spreadLabel,
        spreadKey: document.getElementById("spreadSelect")?.value || "",
        date: new Date().toLocaleString(),
        cards,
        reading: fallbackText,
        userName: detailContext.userName,
        partnerName: detailContext.partnerName,
        isCompatibility: detailContext.isCompatibility,
        emotionLabel: detailContext.emotion.label,
        emotionLevel: detailContext.emotion.value
      };
      const hasSummary = renderReadingSummary(historyRecord.reading);
      streamContent.classList.toggle("is-summary-only", Boolean(hasSummary));
      setFlowStep(3);
      updateStatus("网络波动，已自动切换到稳定模式。你可以继续阅读，不影响结果。");
    } catch {
      if (requestController.signal.aborted || isStaleRequest()) {
        return;
      }
      renderMarkdown(`> 🔮 宇宙连接中断: ${error.message}`);
      updateStatus("连接失败：请检查网络后重试，或返回主页重新抽牌。");
    }
  } finally {
    if (activeReadingAbortController === requestController) {
      activeReadingAbortController = null;
    }
    if (isStaleRequest()) return;
    if(cursor) cursor.style.display = "none";
    if(aiStatus) aiStatus.style.display = "none";
    document.body.classList.remove("reading-generating");
    document.getElementById("readingWrapper")?.setAttribute("aria-busy", "false");
    // #7 进度条：流式结束时收起
    if (streamProgress) { streamProgress.style.width = "100%"; streamProgress.classList.remove("streaming"); setTimeout(() => { if (streamProgress?.parentElement) streamProgress.parentElement.style.display = "none"; }, 400); }
    // #8 简化按钮：只保留主要两个，写入档案自动完成
    const actionBtns = document.getElementById("actionBtns"); if(actionBtns) actionBtns.style.display = "flex";
    wrapReadingSectionsAsCollapsible();
    if (historyRecord) {
      latestReadingRecord = historyRecord;
      addHistoryRecord(historyRecord);
      updateStatus("解牌已生成并存入成长档案，可保存图片或继续复盘。");
    }
  }
}
