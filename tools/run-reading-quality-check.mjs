import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_ENDPOINT = "https://www.tarotwheel.top/api/tarot";
const SAMPLE_PATH = new URL("./reading-quality-samples.json", import.meta.url);
const REPORT_DIR = path.resolve("reports");

const concreteActionPattern = /(发|问|约|等|看|列|写|核对|确认|暂停|停止|停掉|取消|推迟|拒绝|设|沟通|记录|复盘|比较|提交|准备|观察|整理|收集|评估|联系|预约|保存|删除|申请|更新|检查|预算|边界|投递|试水|练习|拆|跟进|标出|选择|选|缩减|限制|投入|计算)/;
const vaguePattern = /(相信宇宙|命运自有安排|答案在你心里|顺其自然|提升能量|保持开放|做好自己|不要想太多|一切都会好)/;
const directPattern = /(倾向|建议|不建议|可以|不要|值得|不值得|能|不能|会|不会|暂缓|优先|主动|等待|保守|推进|观察|设边界|拉开距离|选择|继续|停止|适合|不适合|最应该|先调整|先处理|先做|处于|状态|停滞|破局)/;

const selfTestSample = {
  id: "self-test",
  category: "事业工作",
  question: "我该不该继续等这个工作机会，还是主动去找新的选择？",
  cards: [
    { position: "过去的因果", cardName: "宝剑五 (正位)", meaning: "竞争、沟通不畅", isReversed: false },
    { position: "当下的现状", cardName: "宝剑九 (逆位)", meaning: "焦虑缓解但仍不稳定", isReversed: true },
    { position: "未来的趋势", cardName: "月亮 (正位)", meaning: "信息模糊、隐藏风险", isReversed: false }
  ],
  mustMention: ["工作", "机会"],
  expectedActionWords: ["投递", "确认", "时间", "更新"]
};

const selfTestReadings = [
  {
    name: "good",
    shouldPass: true,
    reading: `### 我理解的问题
你在问这个工作机会是否还值得等，还是应该主动寻找新的选择。

### 结论
倾向：暂缓继续等待，优先主动寻找新的工作机会。

### 关键提醒
- 宝剑五提示过去有竞争或沟通不清，机会本身不够透明。
- 宝剑九逆位说明焦虑正在缓解，但继续被动等会消耗判断力。
- 月亮提醒未来信息仍模糊，需要用事实确认，而不是靠猜。

### 为什么会这样
宝剑五落在过去，说明这个机会可能从一开始就有信息不对称或沟通消耗。

月亮落在未来，代表即使后续有消息，也需要核对流程和时间节点。

### 现在去做
- 更新简历并投递：本周至少投递 3 个新机会。
- 确认时间节点：向对方询问流程和预计反馈时间。
- 设定截止日：7 天内没有明确回复，就把重心转向新选择。`
  },
  {
    name: "bad",
    shouldPass: false,
    reading: `### 结论
答案在你心里，相信宇宙会安排最好的方向。

### 关键提醒
- 保持开放。

### 现在去做
- 相信自己。
- 放轻松。
- 顺其自然。`
  }
];

function parseArgs(argv) {
  const args = {
    endpoint: process.env.TAROT_QA_ENDPOINT || DEFAULT_ENDPOINT,
    limit: 0,
    only: "",
    fallback: false,
    selfTest: false,
    save: true
  };

  for (let i = 2; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--endpoint") args.endpoint = argv[++i] || args.endpoint;
    else if (item === "--limit") args.limit = Number(argv[++i] || 0);
    else if (item === "--only") args.only = argv[++i] || "";
    else if (item === "--fallback") args.fallback = true;
    else if (item === "--self-test") args.selfTest = true;
    else if (item === "--no-save") args.save = false;
  }
  return args;
}

function section(markdown = "", headings = []) {
  const escaped = headings.map(item => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(?:^|\\n)#{3,4}\\s*(?:${escaped.join("|")})\\s*\\n([\\s\\S]*?)(?=\\n#{3,4}\\s+|$)`, "i");
  return String(markdown || "").match(pattern)?.[1]?.trim() || "";
}

function strip(input = "") {
  return String(input || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*_`~\-[\]().:：]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstSentence(input = "") {
  return strip(input)
    .split(/(?<=[。！？!?])|；|;|\n/)
    .map(item => item.trim())
    .filter(Boolean)[0] || "";
}

function normalizeCardName(cardName = "") {
  return String(cardName).replace(/\s*\((?:逆位|正位)\)\s*/g, "").trim();
}

function actionLines(markdown = "") {
  return section(markdown, ["现在去做", "行动建议", "下一步"])
    .split(/\n|(?<=[。！？!?])/)
    .map(line => strip(line).replace(/^[-*•\d.\s]+/, "").trim())
    .filter(Boolean);
}

function evaluate(sample, reading) {
  const issues = [];
  const plain = strip(reading);
  const understood = section(reading, ["我理解的问题", "理解的问题", "问题理解"]);
  const conclusion = section(reading, ["结论", "一句话答案", "先看结论"]);
  const reminder = section(reading, ["关键提醒", "提醒"]);
  const reason = section(reading, ["为什么会这样", "牌面逻辑"]);
  const actions = actionLines(reading);
  const answer = firstSentence(conclusion);

  if (!plain || plain.length < 120) issues.push("内容过短");
  if (!understood) issues.push("缺少问题复述");
  if (!conclusion) issues.push("缺少结论");
  if (!answer || !directPattern.test(answer)) issues.push("结论第一句不够直接");
  if (answer.length > 110) issues.push("结论第一句过长");
  if (vaguePattern.test(answer)) issues.push("结论含逃避式表达");
  if (!reminder) issues.push("缺少关键提醒");
  if (!reason) issues.push("缺少牌面逻辑");
  if (actions.length < 3) issues.push("行动建议不足 3 条");

  const concreteCount = actions.filter(line => concreteActionPattern.test(line) && !vaguePattern.test(line)).length;
  if (concreteCount < 3) issues.push("行动建议不够具体");

  const mustMentionHits = (sample.mustMention || []).filter(word => plain.includes(word)).length;
  if ((sample.mustMention || []).length && mustMentionHits === 0) issues.push("没有回应样本关键对象");

  const expectedActionHits = (sample.expectedActionWords || []).filter(word => actions.join(" ").includes(word)).length;
  if ((sample.expectedActionWords || []).length && expectedActionHits === 0) issues.push("行动建议未覆盖预期动作方向");

  const cardNames = (sample.cards || []).map(card => normalizeCardName(card.cardName)).filter(Boolean);
  const cardMentionHits = cardNames.filter(name => reason.includes(name) || reminder.includes(name)).length;
  if (cardNames.length && cardMentionHits === 0) issues.push("没有回扣具体牌名");

  return {
    ok: issues.length === 0,
    score: Math.max(0, 100 - issues.length * 12),
    issues,
    answer,
    actions: actions.slice(0, 3)
  };
}

function parseStreamedReading(rawText = "") {
  return String(rawText || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith("data: "))
    .map(line => line.replace(/^data:\s*/, ""))
    .filter(payload => payload && payload !== "[DONE]" && !payload.startsWith("[ERROR]"))
    .map(payload => {
      try {
        const data = JSON.parse(payload);
        return data.choices?.[0]?.delta?.content || data.choices?.[0]?.message?.content || "";
      } catch {
        return "";
      }
    })
    .join("");
}

async function requestReading(endpoint, sample, options = {}) {
  const body = {
    question: sample.question,
    cards: sample.cards,
    emotionLevel: 3,
    emotionLabel: "平静观察",
    isCompatibility: sample.category === "双人合盘"
  };
  if (options.fallback) body.fallbackShort = true;

  let response;
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      break;
    } catch (error) {
      lastError = error;
      if (attempt === 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 900));
    }
  }

  if (!response) throw lastError || new Error("No response from reading endpoint");

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 240)}`);
  }

  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  if (contentType.includes("application/json")) {
    const data = JSON.parse(text);
    return String(data.reading || "");
  }
  return parseStreamedReading(text);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.selfTest) {
    const results = selfTestReadings.map(item => ({
      name: item.name,
      shouldPass: item.shouldPass,
      evaluation: evaluate(selfTestSample, item.reading)
    }));
    results.forEach(item => {
      const actual = item.evaluation.ok;
      const status = actual === item.shouldPass ? "PASS" : "FAIL";
      console.log(`${status} ${item.name}: expected ${item.shouldPass ? "pass" : "review"}, got ${actual ? "pass" : "review"}`);
      if (!actual) console.log(`  - ${item.evaluation.issues.join("；")}`);
    });
    if (results.some(item => item.evaluation.ok !== item.shouldPass)) {
      throw new Error("Reading quality self-test failed.");
    }
    return;
  }

  const allSamples = JSON.parse(await fs.readFile(SAMPLE_PATH, "utf8"));
  const selected = allSamples
    .filter(sample => !args.only || sample.id === args.only || sample.category === args.only)
    .slice(0, args.limit > 0 ? args.limit : allSamples.length);

  if (!selected.length) throw new Error("No reading quality samples selected.");

  const results = [];
  for (const [index, sample] of selected.entries()) {
    process.stdout.write(`[${index + 1}/${selected.length}] ${sample.id} ... `);
    try {
      const reading = await requestReading(args.endpoint, sample, { fallback: args.fallback });
      const evaluation = evaluate(sample, reading);
      results.push({ sample, evaluation, reading });
      process.stdout.write(`${evaluation.ok ? "PASS" : "REVIEW"} ${evaluation.score}\n`);
      if (!evaluation.ok) {
        process.stdout.write(`  - ${evaluation.issues.join("；")}\n`);
      }
    } catch (error) {
      results.push({ sample, evaluation: { ok: false, score: 0, issues: [error.message], answer: "", actions: [] }, reading: "" });
      process.stdout.write(`ERROR\n  - ${error.message}\n`);
    }
  }

  const passed = results.filter(item => item.evaluation.ok).length;
  const average = Math.round(results.reduce((sum, item) => sum + item.evaluation.score, 0) / results.length);
  const summary = {
    endpoint: args.endpoint,
    mode: args.fallback ? "fallback" : "stream",
    checkedAt: new Date().toISOString(),
    total: results.length,
    passed,
    average,
    results: results.map(item => ({
      id: item.sample.id,
      category: item.sample.category,
      question: item.sample.question || "轻量灵感牌",
      ok: item.evaluation.ok,
      score: item.evaluation.score,
      issues: item.evaluation.issues,
      answer: item.evaluation.answer,
      actions: item.evaluation.actions
    }))
  };

  console.log(`\nSummary: ${passed}/${results.length} passed, average score ${average}`);

  if (args.save) {
    await fs.mkdir(REPORT_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const reportPath = path.join(REPORT_DIR, `reading-quality-${stamp}.json`);
    await fs.writeFile(reportPath, `${JSON.stringify(summary, null, 2)}\n`);
    console.log(`Report: ${reportPath}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
