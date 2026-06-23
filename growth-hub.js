/* Growth archive: history timeline and journal features. Loaded before script.js. */

let growthArchiveFilter = "all";
const ACTION_SECTION_HEADINGS = ["现在去做", "行动建议", "下一步", "凡尘指南"];
const ACTION_STATUS_OPTIONS = [
  { value: "done", label: "已完成" },
  { value: "later", label: "暂缓" },
  { value: "skip", label: "不适用" }
];

function archiveEscapeHtml(input = "") {
  return String(input || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function archiveStripRichText(input = "") {
  return String(input || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*_`~\-[\]().:：]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function archiveSectionBody(markdown = "", headings = []) {
  const text = String(markdown || "");
  if (!text.trim() || !Array.isArray(headings) || !headings.length) return "";

  const escaped = headings.map(item => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(
    `(?:^|\\n)#{3,4}\\s*(?:${escaped.join("|")})\\s*\\n([\\s\\S]*?)(?=\\n#{3,4}\\s+|$)`,
    "i"
  );
  return text.match(pattern)?.[1]?.trim() || "";
}

function archiveFirstSentence(input = "") {
  return archiveStripRichText(input)
    .split(/(?<=[。！？!?])|；|;|\n/)
    .map(item => item.trim())
    .filter(Boolean)[0] || "";
}

function archiveNormalizeActionText(input = "") {
  return String(input || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s*(?:[-*•·]|\d+[.、)]|[一二三四五六七八九十]+[、.)）])\s*/g, "")
    .replace(/[#>*_`~[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractActionLinesFromBody(body = "", limit = 3) {
  const seen = new Set();
  const lines = String(body || "")
    .replace(/\r/g, "\n")
    .split(/\n+|(?<=[。！？!?])\s+|；|;/)
    .map(archiveNormalizeActionText)
    .filter(item => item && item.length > 2 && !/^暂无|^无$/.test(item))
    .filter(item => {
      const key = item.slice(0, 32);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return lines.slice(0, limit);
}

function extractRecordActions(record = {}, limit = 3) {
  const body = archiveSectionBody(String(record?.reading || ""), ACTION_SECTION_HEADINGS);
  return extractActionLinesFromBody(body, limit);
}

function getRecordActionKey(record = {}) {
  return [
    record?.date || "",
    record?.spread || "",
    record?.question || "单牌速读"
  ].join("|").slice(0, 220);
}

function getActionStatusLabel(status = "") {
  if (status === "done") return "已完成";
  if (status === "later") return "暂缓";
  if (status === "skip") return "不适用";
  return "待行动";
}

function summarizeActionProgress(record = {}) {
  const actions = extractRecordActions(record);
  const progress = ActionProgressService.get(record);
  const done = actions.filter((_, idx) => progress[idx] === "done").length;
  const later = actions.filter((_, idx) => progress[idx] === "later").length;
  const skip = actions.filter((_, idx) => progress[idx] === "skip").length;
  return {
    total: actions.length,
    done,
    later,
    skip,
    open: Math.max(actions.length - done - later - skip, 0),
    allSettled: actions.length > 0 && actions.length === done + later + skip
  };
}

function inferTimelineTopic(record) {
  const spread = String(record?.spread || "");
  const q = String(record?.question || "");
  if (spread.includes("情感") || /爱|感情|关系|复合|喜欢|暧昧/.test(q)) return "情感";
  if (spread.includes("财富") || spread.includes("事业") || /工作|升职|面试|副业|赚钱/.test(q)) return "事业";
  if (spread.includes("二选一") || spread.includes("是非") || /选|决定|要不要|该不该/.test(q)) return "选择";
  return "综合";
}

function extractTimelineTags(record) {
  const topic = inferTimelineTopic(record);
  const tags = new Set([topic, "经典解牌"]);
  if (record?.isCompatibility) tags.add("双人合盘");
  if (record?.emotionLabel) tags.add(record.emotionLabel);
  return Array.from(tags);
}

function extractRecordInsights(record = {}) {
  const reading = String(record?.reading || "");
  const answer = archiveFirstSentence(archiveSectionBody(reading, ["结论", "一句话答案", "先看结论", "神谕总览"]));
  const action = extractRecordActions(record, 1)[0] || archiveFirstSentence(archiveSectionBody(reading, ACTION_SECTION_HEADINGS));
  const reminder = archiveFirstSentence(archiveSectionBody(reading, ["关键提醒", "提醒", "破局之眼"]));
  const fallback = buildReadingSnippet(reading, 80);

  return {
    answer: answer || fallback || "这次答案还在整理中。",
    action: action || "回到记录里选一个最小动作。",
    reminder: reminder || "",
    question: String(record?.question || "单牌速读").replace(/^\[双人合盘：.*?\]\s*/, "").trim() || "单牌速读"
  };
}

function buildArchiveStats(records = []) {
  const topicCounts = records.reduce((acc, item) => {
    const topic = inferTimelineTopic(item);
    acc[topic] = (acc[topic] || 0) + 1;
    return acc;
  }, {});
  const topTopic = Object.entries(topicCounts).sort((a, b) => b[1] - a[1])[0] || null;
  const recent = records[0] || null;
  const recentInsights = extractRecordInsights(recent || {});
  const actionTotals = records.reduce((acc, record) => {
    const summary = summarizeActionProgress(record);
    acc.total += summary.total;
    acc.done += summary.done;
    acc.open += summary.open;
    return acc;
  }, { total: 0, done: 0, open: 0 });

  return {
    total: records.length,
    compatibility: records.filter(r => r.isCompatibility).length,
    notes: Array.isArray(JournalService.notes) ? JournalService.notes.length : 0,
    topTopic,
    recent,
    recentInsights,
    topicCounts,
    actionTotals
  };
}

function buildArchivePatternCards(stats) {
  const totalActions = stats.actionTotals.total || 0;
  const doneRate = totalActions ? Math.round((stats.actionTotals.done / totalActions) * 100) : 0;
  const topicEntries = Object.entries(stats.topicCounts || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const topTopic = stats.topTopic?.[0] || "尚未形成";
  const actionTone = totalActions
    ? `${doneRate}% 已推进 · ${stats.actionTotals.open} 个待行动`
    : "等待第一条行动";
  const noteTone = stats.notes
    ? `${stats.notes} 条札记正在补足答案背后的心境`
    : "还没有心境札记";

  return `
    <section class="archive-pattern-card archive-pattern-card--density">
      <div class="archive-pattern-card__label">档案密度</div>
      <strong>${stats.total}</strong>
      <span>${noteTone}</span>
    </section>
    <section class="archive-pattern-card">
      <div class="archive-pattern-card__label">行动推进</div>
      <strong>${actionTone}</strong>
      <span>把解读落到生活里，档案才会真正长出来。</span>
    </section>
    <section class="archive-pattern-card archive-pattern-card--topics">
      <div class="archive-pattern-card__label">主题星图</div>
      <strong>${archiveEscapeHtml(topTopic)}</strong>
      <div class="archive-topic-bars">
        ${topicEntries.length ? topicEntries.map(([topic, count]) => {
          const width = stats.total ? Math.max(16, Math.round((count / stats.total) * 100)) : 16;
          return `
            <div class="archive-topic-bar">
              <span>${archiveEscapeHtml(topic)}</span>
              <i style="--topic-width:${width}%"></i>
              <em>${count}</em>
            </div>
          `;
        }).join("") : `<div class="archive-topic-empty">完成几次解牌后，这里会出现你的重复主题。</div>`}
      </div>
    </section>
  `;
}

function collectOpenArchiveActions(records = [], limit = 3) {
  const items = [];
  for (const record of records) {
    const actions = extractRecordActions(record);
    if (!actions.length) continue;
    const progress = ActionProgressService.get(record);
    const insights = extractRecordInsights(record);
    const topic = inferTimelineTopic(record);
    actions.forEach((action, index) => {
      if (items.length >= limit) return;
      if (progress[index]) return;
      items.push({
        record,
        action,
        index,
        topic,
        question: insights.question,
        date: record?.date || ""
      });
    });
    if (items.length >= limit) break;
  }
  return items;
}

function renderTodayActionPanel(records = []) {
  const panel = document.getElementById("todayActionPanel");
  if (!panel) return;

  if (!records.length) {
    panel.innerHTML = `
      <section class="today-action-panel__empty">
        <span>今日待行动</span>
        <strong>完成一次解牌后，这里会出现可执行的小步骤。</strong>
      </section>
    `;
    return;
  }

  const actions = collectOpenArchiveActions(records, 3);
  if (!actions.length) {
    panel.innerHTML = `
      <section class="today-action-panel__empty today-action-panel__empty--settled">
        <span>今日待行动</span>
        <strong>最近行动都已经处理过了。</strong>
      </section>
    `;
    return;
  }

  panel.innerHTML = `
    <section class="today-action-card">
      <div class="today-action-card__head">
        <div>
          <span>今日待行动</span>
          <strong>先完成一件最小的事</strong>
        </div>
        <em>${actions.length} 条</em>
      </div>
      <div class="today-action-list">
        ${actions.map((item, idx) => `
          <button class="today-action-item" type="button" data-action-open="${idx}">
            <span>${archiveEscapeHtml(item.topic)} · ${archiveEscapeHtml(item.date || "最近")}</span>
            <strong>${archiveEscapeHtml(item.action)}</strong>
            <em>${archiveEscapeHtml(item.question)}</em>
          </button>
        `).join("")}
      </div>
    </section>
  `;

  panel.querySelectorAll("[data-action-open]").forEach(btn => {
    btn.addEventListener("click", () => {
      const index = Number(btn.getAttribute("data-action-open"));
      const item = actions[index];
      if (!item) return;
      openHistoryDetail({ ...item.record, timelineTopic: item.topic });
    });
  });
}

function renderArchiveFocus(records = [], mapped = []) {
  const panel = document.getElementById("archiveFocusPanel");
  const filters = document.getElementById("archiveFilterBar");
  const patterns = document.getElementById("archivePatternPanel");
  if (!panel && !filters && !patterns) return;

  const stats = buildArchiveStats(records);
  if (panel) {
    if (!records.length) {
      panel.innerHTML = `
        <section class="archive-focus-empty">
          <div class="archive-focus-kicker">还没有记录</div>
          <strong>完成一次解牌后，这里会自动整理答案和下一步。</strong>
          <span>不用手动归档，系统会替你留住每一次重要提问。</span>
        </section>
      `;
    } else {
      const topTopicText = stats.topTopic ? `${stats.topTopic[0]} · ${stats.topTopic[1]}次` : "暂无重复主题";
      const recentActionProgress = summarizeActionProgress(stats.recent);
      const actionProgressText = recentActionProgress.total
        ? `${recentActionProgress.done}/${recentActionProgress.total} 已完成`
        : "等待行动";
      panel.innerHTML = `
        <section class="archive-focus-card archive-focus-card--answer">
          <div class="archive-focus-kicker">最近答案</div>
          <strong>${archiveEscapeHtml(stats.recentInsights.answer)}</strong>
          <span>${archiveEscapeHtml(stats.recentInsights.question)}</span>
        </section>
        <section class="archive-focus-card">
          <div class="archive-focus-kicker">可执行一步</div>
          <strong>${archiveEscapeHtml(stats.recentInsights.action)}</strong>
          <span>${archiveEscapeHtml(actionProgressText)} · ${archiveEscapeHtml(stats.recentInsights.reminder || "先做一件最小、可验证的事。")}</span>
        </section>
        <section class="archive-focus-card">
          <div class="archive-focus-kicker">重复主题</div>
          <strong>${archiveEscapeHtml(topTopicText)}</strong>
          <span>${stats.total} 条解牌 · ${stats.notes} 条札记 · ${stats.actionTotals.open} 个待行动</span>
        </section>
      `;
    }
  }

  if (patterns) {
    if (!records.length) {
      patterns.innerHTML = `
        <section class="archive-pattern-empty">
          <div class="archive-focus-kicker">档案脉络</div>
          <strong>这里会自动生成你的主题分布、行动推进和复盘密度。</strong>
          <span>先完成一次解牌，成长档案会开始记录你的提问路径。</span>
        </section>
      `;
    } else {
      patterns.innerHTML = buildArchivePatternCards(stats);
    }
  }

  if (filters) {
    const topics = [...new Set(mapped.map(item => item.topic))];
    const options = ["all", ...topics];
    filters.innerHTML = options.map(topic => {
      const active = growthArchiveFilter === topic ? "active" : "";
      const label = topic === "all" ? "全部" : topic;
      const count = topic === "all" ? records.length : (stats.topicCounts[topic] || 0);
      return `<button class="archive-filter-chip ${active}" type="button" data-topic="${archiveEscapeHtml(topic)}">${archiveEscapeHtml(label)} <span>${count}</span></button>`;
    }).join("");
    filters.querySelectorAll(".archive-filter-chip").forEach(btn => {
      btn.addEventListener("click", () => {
        growthArchiveFilter = btn.getAttribute("data-topic") || "all";
        renderTimeline();
      });
    });
  }
}

function renderTimeline() {
  const list = document.getElementById("timelineList");
  const summary = document.getElementById("timelineSummary");
  if (!list) return;
  const records = Array.isArray(HistoryService.records) ? HistoryService.records : [];
  list.innerHTML = "";

  const mapped = records.map(r => ({ record: r, topic: inferTimelineTopic(r), tags: extractTimelineTags(r) }));
  renderArchiveFocus(records, mapped);
  renderTodayActionPanel(records);

  if (summary) {
    const stats = buildArchiveStats(records);
    const topTopicText = stats.topTopic ? `${stats.topTopic[0]} ${stats.topTopic[1]}次` : "暂无";
    summary.innerHTML = `
      <div class="timeline-summary-item"><div class="timeline-summary-label">总记录</div><div class="timeline-summary-value">${stats.total}</div></div>
      <div class="timeline-summary-item"><div class="timeline-summary-label">行动完成</div><div class="timeline-summary-value">${stats.actionTotals.done}/${stats.actionTotals.total}</div></div>
      <div class="timeline-summary-item"><div class="timeline-summary-label">心境札记</div><div class="timeline-summary-value">${stats.notes}</div></div>
      <div class="timeline-summary-item timeline-summary-item--wide"><div class="timeline-summary-label">重复主题</div><div class="timeline-summary-value">${topTopicText}</div></div>
    `;
  }

  if (!records.length) {
    list.innerHTML = '<div class="timeline-item"><div class="timeline-item-main">暂无解牌记录。先完成一次解牌，再回来复盘你的模式。</div></div>';
    return;
  }

  const filtered = growthArchiveFilter === "all"
    ? mapped
    : mapped.filter(item => item.topic === growthArchiveFilter);

  if (!filtered.length) {
    list.innerHTML = '<div class="timeline-item timeline-item--empty"><div class="timeline-item-main">这个主题暂时没有记录。</div></div>';
    return;
  }

  filtered.forEach(({ record, tags, topic }) => {
    const item = document.createElement("div");
    item.className = "timeline-item";
    item.setAttribute("role", "button");
    item.setAttribute("tabindex", "0");
    const insights = extractRecordInsights(record);
    const actionProgress = summarizeActionProgress(record);
    const actionProgressText = actionProgress.total
      ? `行动 ${actionProgress.done}/${actionProgress.total} · ${actionProgress.open} 待处理`
      : "暂无明确行动";
    const progressClass = actionProgress.allSettled ? " timeline-action-progress--settled" : "";
    item.innerHTML = `
      <div class="timeline-item-top">
        <div class="timeline-item-time">${archiveEscapeHtml(record.date || "未知时间")}</div>
        <div class="timeline-item-open">打开</div>
      </div>
      <div class="timeline-item-main">${archiveEscapeHtml(insights.question)}</div>
      <div class="timeline-item-answer">${archiveEscapeHtml(insights.answer)}</div>
      <div class="timeline-item-snippet">下一步：${archiveEscapeHtml(insights.action)}</div>
      <div class="timeline-action-progress${progressClass}">${archiveEscapeHtml(actionProgressText)}</div>
      <div class="timeline-tags">${tags.map(t => `<span class="timeline-tag">${t}</span>`).join("")}</div>
    `;
    const openDetail = () => openHistoryDetail({ ...record, timelineTopic: topic });
    item.addEventListener("click", openDetail);
    item.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openDetail();
      }
    });
    list.appendChild(item);
  });

}

function buildReadingSnippet(reading = "", maxLength = 80) {
  const plain = archiveStripRichText(reading)
    .replace(/#{1,6}\s*/g, "")
    .replace(/\b(?:我理解的问题|理解的问题|问题理解|三点速览|结论|关键提醒|现在去做)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return "";
  return plain.slice(0, maxLength);
}

const HistoryService = {
  records: [],
  storageKey() {
    return `tarotHistory:${getVaultStorageSuffix()}`;
  },
  save() {
    localStorage.setItem(this.storageKey(), JSON.stringify(this.records));
  },
  load() {
    const raw = localStorage.getItem(this.storageKey());
    if (!raw) {
      this.records = [];
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      this.records = Array.isArray(parsed) ? parsed.slice(0, HISTORY_LIMIT) : [];
    } catch (e) {
      this.records = [];
    }
  },
  add(record) {
    this.records.unshift(record);
    this.records = this.records.slice(0, HISTORY_LIMIT);
    this.save();
    renderTimeline();
  },
  clear() {
    this.records = [];
    this.save();
    ActionProgressService.clear();
    renderTimeline();
  }
};

const ActionProgressService = {
  progress: {},
  storageKey() {
    return `tarotActionProgress:${getVaultStorageSuffix()}`;
  },
  load() {
    const raw = localStorage.getItem(this.storageKey());
    if (!raw) {
      this.progress = {};
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      this.progress = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      this.progress = {};
    }
  },
  save() {
    localStorage.setItem(this.storageKey(), JSON.stringify(this.progress));
  },
  get(record) {
    return this.progress[getRecordActionKey(record)] || {};
  },
  set(record, index, status) {
    const key = getRecordActionKey(record);
    const current = { ...(this.progress[key] || {}) };
    if (!status) {
      delete current[index];
    } else {
      current[index] = status;
    }
    if (Object.keys(current).length) {
      this.progress[key] = current;
    } else {
      delete this.progress[key];
    }
    this.save();
  },
  clear() {
    this.progress = {};
    localStorage.removeItem(this.storageKey());
  }
};

const JournalService = {
  notes: [],
  storageKey() {
    return `tarotJournal:${getVaultStorageSuffix()}`;
  },
  load() {
    const raw = localStorage.getItem(this.storageKey());
    if (!raw) {
      this.notes = [];
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      this.notes = Array.isArray(parsed) ? parsed.slice(0, NOTES_LIMIT) : [];
    } catch {
      this.notes = [];
    }
  },
  save() {
    localStorage.setItem(this.storageKey(), JSON.stringify(this.notes));
  },
  add(note) {
    this.notes.unshift(note);
    this.notes = this.notes.slice(0, NOTES_LIMIT);
    this.save();
    renderJournalNotes();
    renderTimeline();
  },
  remove(idx) {
    if (idx < 0 || idx >= this.notes.length) return;
    this.notes.splice(idx, 1);
    this.save();
    renderJournalNotes();
    renderVaultMeta();
  }
};

function loadHistory() { HistoryService.load(); JournalService.load(); ActionProgressService.load(); }
function addHistoryRecord(record) { HistoryService.add(record); }
function clearHistory() {
  const count = HistoryService.records.length;
  if (!count) { updateStatus("暂无记录可清空。"); return; }
  const msg = `确定要清空全部 ${count} 条解牌记录吗？此操作不可撤销。`;
  if (!confirm(msg)) return;
  HistoryService.clear();
  renderVaultMeta();
  renderTimeline();
  updateStatus("");
}

function readVaultMeta() {
  try {
    return JSON.parse(localStorage.getItem(VAULT_META_KEY) || "null");
  } catch {
    return null;
  }
}

function getVaultStorageSuffix() {
  const meta = readVaultMeta();
  if (!meta?.name || !meta?.pinHash) return "guest";
  return `${meta.name}:${meta.pinHash}`;
}

function openGrowthHub() {
  const modal = document.getElementById("growthHubModal");
  const panel = document.getElementById("growthHubPanel");
  if (!modal || !panel) return;

  loadHistory();
  renderVaultMeta();
  panel.style.display = "block";
  modal.style.display = "flex";
  renderTimeline();
  renderJournalNotes();
}


function closeGrowthHub() {
  const modal = document.getElementById("growthHubModal");
  if (modal) modal.style.display = "none";
}

function renderVaultMeta() {
  const metaEl = document.getElementById("vaultMeta");
  if (!metaEl) return;

  const meta = readVaultMeta();
  const totalReadings = Array.isArray(HistoryService.records) ? HistoryService.records.length : 0;
  const totalNotes = Array.isArray(JournalService.notes) ? JournalService.notes.length : 0;
  const totalActions = (Array.isArray(HistoryService.records) ? HistoryService.records : [])
    .reduce((sum, record) => sum + summarizeActionProgress(record).total, 0);

  if (!meta?.name) {
    metaEl.textContent = `访客档案 · ${totalReadings} 条解牌 · ${totalNotes} 条札记 · ${totalActions} 个行动`;
    return;
  }

  metaEl.textContent = `${meta.name} 的成长档案 · ${totalReadings} 条解牌 · ${totalNotes} 条札记 · ${totalActions} 个行动`;
}

function saveJournalNote() {
  const noteInput = document.getElementById("journalNoteInput");
  const text = noteInput?.value?.trim() || "";
  if (!text) {
    alert("先写下一点感受再保存吧。");
    return;
  }
  const emotion = getSelectedMood();
  JournalService.add({
    text,
    date: new Date().toLocaleString(),
    emotionLabel: emotion.label,
    emotionLevel: emotion.value,
    linkedQuestion: "",
    linkedSpread: ""
  });
  if (noteInput) noteInput.value = "";
  renderVaultMeta();
  updateStatus("心境札记已保存到成长档案。");
}

function renderJournalNotes() {
  const list = document.getElementById("journalNotesList");
  if (!list) return;
  list.innerHTML = "";
  if (!JournalService.notes.length) {
    list.innerHTML = '<div class="timeline-item"><div class="timeline-item-main">还没有札记，写下今天第一条心境记录吧。</div></div>';
    return;
  }
  JournalService.notes.forEach((note, idx) => {
    const item = document.createElement("div");
    item.className = "timeline-item";
    item.innerHTML = `
      <div class="timeline-item-time">${archiveEscapeHtml(note.date)}<button class="journal-delete-btn" data-idx="${idx}" title="删除" aria-label="删除此条札记">×</button></div>
      <div class="timeline-item-main">${archiveEscapeHtml(note.emotionLabel)}${note.linkedSpread ? ` · ${archiveEscapeHtml(note.linkedSpread)}` : ""}</div>
      <div class="timeline-item-snippet">${archiveEscapeHtml(note.text)}</div>
      <div class="timeline-tags">
        ${note.linkedQuestion ? `<span class="timeline-tag">${archiveEscapeHtml(note.linkedQuestion.slice(0, 18))}</span>` : ""}
      </div>
    `;
    item.querySelector(".journal-delete-btn").addEventListener("click", e => {
      e.stopPropagation();
      JournalService.remove(idx);
    });
    list.appendChild(item);
  });
}

function openHistoryDetail(record) {
  const modal = document.getElementById("historyDetailModal");
  const body = document.getElementById("historyDetailBody");
  if (!modal || !body) return;

  const insights = extractRecordInsights(record);
  const actions = extractRecordActions(record);
  const progress = ActionProgressService.get(record);
  const progressSummary = summarizeActionProgress(record);
  const actionList = actions.length
    ? actions.map((action, idx) => {
      const activeStatus = progress[idx] || "";
      const buttons = ACTION_STATUS_OPTIONS.map(option => {
        const active = activeStatus === option.value ? " active" : "";
        return `<button class="history-action-status-btn${active}" type="button" data-action-index="${idx}" data-action-status="${option.value}">${option.label}</button>`;
      }).join("");
      return `
        <div class="history-action-row">
          <div class="history-action-text">
            <span>${idx + 1}</span>
            <strong>${archiveEscapeHtml(action)}</strong>
            <em>${archiveEscapeHtml(getActionStatusLabel(activeStatus))}</em>
          </div>
          <div class="history-action-statuses">
            ${buttons}
            ${activeStatus ? `<button class="history-action-status-btn history-action-status-btn--clear" type="button" data-action-index="${idx}" data-action-status="">重置</button>` : ""}
          </div>
        </div>
      `;
    }).join("")
    : `<div class="history-action-empty">这次解读没有提取到明确行动。可以回看正文，手动把最小一步写进札记。</div>`;
  const cardsText = Array.isArray(record.cards) && record.cards.length
    ? `<ul>${record.cards.map(c => `<li>${archiveEscapeHtml(c.position || "位置")}：${archiveEscapeHtml(c.cardName || c.name || "未知牌")}</li>`).join("")}</ul>`
    : "<p>本次未保存牌面详情。</p>";

  body.innerHTML = `
    <section class="history-detail-hero history-detail-section">
      <div class="history-detail-section__label">答案</div>
      <div class="archive-focus-kicker">${archiveEscapeHtml(record.timelineTopic || inferTimelineTopic(record))} · ${archiveEscapeHtml(record.spread || "未知牌阵")}</div>
      <h4>${archiveEscapeHtml(insights.question)}</h4>
      <p>${archiveEscapeHtml(insights.answer)}</p>
      <strong>下一步：${archiveEscapeHtml(insights.action)}</strong>
    </section>
    <div class="history-detail-meta">
      <span>${archiveEscapeHtml(record.date || "未知时间")}</span>
      <span>${archiveEscapeHtml(record.mode || "解牌")}</span>
      <span>${archiveEscapeHtml(record.emotionLabel || "平静观察")}</span>
      ${record.isCompatibility ? `<span>${archiveEscapeHtml(record.userName || "你")} × ${archiveEscapeHtml(record.partnerName || "对方")}</span>` : ""}
    </div>
    <section class="history-action-panel history-detail-section">
      <div class="history-action-panel__head">
        <span>行动</span>
        <strong>${progressSummary.done}/${progressSummary.total} 已完成</strong>
      </div>
      ${actionList}
    </section>
    <section class="history-origin-panel history-detail-section">
      <div class="history-detail-section__label">原文</div>
      <div class="history-origin-grid">
        <div>
          <div class="history-origin-title">牌面详情</div>
          ${cardsText}
        </div>
        <div>
          <div class="history-origin-title">解读节选</div>
          <div class="history-detail-reading">${archiveEscapeHtml(buildReadingSnippet(record.reading, 560) || "暂无解牌正文。")}</div>
        </div>
      </div>
    </section>
  `;

  body.querySelectorAll(".history-action-status-btn").forEach(btn => {
    btn.addEventListener("click", event => {
      event.stopPropagation();
      const index = Number(btn.getAttribute("data-action-index"));
      const status = btn.getAttribute("data-action-status") || "";
      if (!Number.isInteger(index)) return;
      ActionProgressService.set(record, index, status);
      renderTimeline();
      renderVaultMeta();
      if (typeof updateStatus === "function") {
        updateStatus(status ? `行动已标记为${getActionStatusLabel(status)}。` : "行动状态已重置。");
      }
      openHistoryDetail(record);
    });
  });

  modal.style.display = "flex";
}

function closeHistoryDetail() {
  const modal = document.getElementById("historyDetailModal");
  if (modal) modal.style.display = "none";
}
