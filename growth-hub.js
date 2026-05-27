/* Growth archive: history timeline and journal features. Loaded before script.js. */

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

function renderTimeline() {
  const list = document.getElementById("timelineList");
  const summary = document.getElementById("timelineSummary");
  if (!list) return;
  const records = Array.isArray(HistoryService.records) ? HistoryService.records : [];
  list.innerHTML = "";

  if (summary) {
    const total = records.length;
    const compatibility = records.filter(r => r.isCompatibility).length;
    const topicCounts = records.reduce((acc, item) => {
      const topic = inferTimelineTopic(item);
      acc[topic] = (acc[topic] || 0) + 1;
      return acc;
    }, {});
    const topTopic = Object.entries(topicCounts).sort((a, b) => b[1] - a[1])[0];
    const topTopicText = topTopic ? `${topTopic[0]} ${topTopic[1]}次` : "暂无";
    summary.innerHTML = `
      <div class="timeline-summary-item"><div class="timeline-summary-label">总记录</div><div class="timeline-summary-value">${total}</div></div>
      <div class="timeline-summary-item"><div class="timeline-summary-label">双人占卜</div><div class="timeline-summary-value">${compatibility}</div></div>
      <div class="timeline-summary-item timeline-summary-item--wide"><div class="timeline-summary-label">重复主题</div><div class="timeline-summary-value">${topTopicText}</div></div>
    `;
  }

  if (!records.length) {
    list.innerHTML = '<div class="timeline-item"><div class="timeline-item-main">暂无解牌记录。先完成一次解牌，再回来复盘你的模式。</div></div>';
    return;
  }

  const mapped = records.map(r => ({ record: r, topic: inferTimelineTopic(r), tags: extractTimelineTags(r) }));
  const filtered = mapped;

  if (!filtered.length) {
    list.innerHTML = '<div class="timeline-item"><div class="timeline-item-main">暂无记录。</div></div>';
    return;
  }

  filtered.forEach(({ record, tags, topic }) => {
    const item = document.createElement("div");
    item.className = "timeline-item";
    const snippet = buildReadingSnippet(record.reading, 62);
    item.innerHTML = `
      <div class="timeline-item-time">${record.date || "未知时间"}</div>
      <div class="timeline-item-main">${record.question || "单牌速读"} · ${record.spread || "未知牌阵"}</div>
      <div class="timeline-item-snippet">${snippet ? `${snippet}…` : "无解牌节选"}</div>
      <div class="timeline-tags">${tags.map(t => `<span class="timeline-tag">${t}</span>`).join("")}</div>
    `;
    item.addEventListener("click", () => openHistoryDetail({ ...record, timelineTopic: topic }));
    list.appendChild(item);
  });

}

function buildReadingSnippet(reading = "", maxLength = 80) {
  const plain = stripRichText(reading)
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
    renderTimeline();
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

function loadHistory() { HistoryService.load(); JournalService.load(); }
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
  JournalService.load();
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

  if (!meta?.name) {
    metaEl.textContent = `当前为访客档案，共保存 ${totalReadings} 条解牌记录、${totalNotes} 条札记。`;
    return;
  }

  metaEl.textContent = `${meta.name} 的成长档案，当前保存 ${totalReadings} 条解牌记录、${totalNotes} 条札记。`;
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
      <div class="timeline-item-time">${note.date}<button class="journal-delete-btn" data-idx="${idx}" title="删除" aria-label="删除此条札记">×</button></div>
      <div class="timeline-item-main">${note.emotionLabel}${note.linkedSpread ? ` · ${note.linkedSpread}` : ""}</div>
      <div class="timeline-item-snippet">${note.text}</div>
      <div class="timeline-tags">
        ${note.linkedQuestion ? `<span class="timeline-tag">${note.linkedQuestion.slice(0, 18)}</span>` : ""}
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

  const cardsText = Array.isArray(record.cards) && record.cards.length
    ? `<ul>${record.cards.map(c => `<li>${c.position || "位置"}：${c.cardName || c.name || "未知牌"}</li>`).join("")}</ul>`
    : "<p>本次未保存牌面详情。</p>";

  body.innerHTML = `
    <p><strong>时间：</strong>${record.date || "未知"}</p>
    <p><strong>模式：</strong>${record.mode || "解牌"}</p>
    <p><strong>问题：</strong>${record.question || "未填写"}</p>
    <p><strong>主题：</strong>${record.timelineTopic || inferTimelineTopic(record)}</p>
    <p><strong>解牌：</strong>精选塔罗解读</p>
    <p><strong>情绪雷达：</strong>${record.emotionLabel || "平静观察"}</p>
    <p><strong>双人合盘：</strong>${record.isCompatibility ? `${record.userName || "你"} × ${record.partnerName}` : "未开启"}</p>
    <p><strong>牌阵：</strong>${record.spread || "未知"}</p>
    <hr style="border-color: rgba(255,255,255,0.16); margin: 12px 0;">
    <p><strong>牌面详情</strong></p>
    ${cardsText}
    <hr style="border-color: rgba(255,255,255,0.16); margin: 12px 0;">
    <p><strong>解读节选</strong></p>
    <div>${record.reading || "暂无解牌正文。"}</div>
  `;

  modal.style.display = "flex";
}

function closeHistoryDetail() {
  const modal = document.getElementById("historyDetailModal");
  if (modal) modal.style.display = "none";
}
