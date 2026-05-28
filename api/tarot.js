import { verifyVipToken } from './_vipToken.js';

function applyCors(req, res) {
  const origin = req.headers.origin;
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const isAllowed = origin && allowed.includes(origin);

  if (isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function requiresVipForCards(cards = []) {
  if (!Array.isArray(cards) || !cards.length) return false;
  if (cards.length > 3) return true;

  const positions = cards
    .map(card => String(card?.position || '').trim())
    .filter(Boolean);

  const yesNoPositions = ['支持的力量', '反对的力量', '最终答案'];
  return yesNoPositions.every(label => positions.includes(label));
}

function getRequiredVipProductType({ cards = [], isCompatibility = false } = {}) {
  if (!requiresVipForCards(cards)) return '';
  return isCompatibility ? 'compatibility' : 'deep';
}

function includesAny(text = '', keywords = []) {
  const normalized = String(text || '').toLowerCase();
  return keywords.some(keyword => normalized.includes(String(keyword).toLowerCase()));
}

function detectQuestionFocus(question = '', isCompatibility = false) {
  const rules = [
    {
      label: '选择判断',
      keywords: ['要不要', '该不该', '能不能', '会不会', '是否', '值不值得', '适不适合', '二选一', '选择', '还是'],
      instruction: '结论第一句必须给出明确倾向；如果是二选一，要分别比较两个方向的收益、风险和更推荐的一边。',
      answerFrame: '结论第一句建议写成“倾向：选/不选/暂缓，因为……”。不能只说“看你的内心”。'
    },
    {
      label: '关系感情',
      keywords: ['复合', '分手', '喜欢', '爱', '暧昧', '关系', '感情', '恋爱', '前任', '伴侣', '对象', '婚姻', '他', '她', 'ta'],
      instruction: '必须回答关系状态、对方/双方真实动力、主要阻碍和下一步沟通方式，不要泛化成个人成长鸡汤。',
      answerFrame: '结论第一句必须点明“这段关系目前是什么状态”和“建议主动/暂缓/设边界”。'
    },
    {
      label: '事业工作',
      keywords: ['工作', '事业', 'offer', '面试', '跳槽', '老板', '同事', '项目', '副业', '客户', '合作', '升职', '辞职'],
      instruction: '必须回答现实推进、机会风险、关键人/关键节点和下一步行动，不要转去谈感情或抽象情绪。',
      answerFrame: '结论第一句必须说明“推进/暂缓/先验证”的职业判断，并给出一个现实依据。'
    },
    {
      label: '金钱财务',
      keywords: ['钱', '财', '赚钱', '收入', '投资', '存款', '涨薪', '工资', '副业', '花钱', '债', '预算'],
      instruction: '必须回答财务趋势、风险边界和可执行的收支动作，避免给出高风险投资承诺。',
      answerFrame: '结论第一句必须说明“保守/可尝试/先止损/先核算”的财务倾向，不承诺收益。'
    },
    {
      label: '时间走势',
      keywords: ['未来', '走势', '发展', '多久', '什么时候', '本月', '月运', '今年', '明年', '近期', '三个月'],
      instruction: '必须说明阶段变化与观察信号；如果不能给精确时间，就给出最可能的节奏和触发条件。',
      answerFrame: '结论第一句必须给出“近期节奏”和“观察信号”，不要假装能精确到某一天。'
    }
  ];

  if (isCompatibility) return {
    label: '双人合盘',
    instruction: '必须围绕两个人的互动模式、误解来源、吸引与阻碍、下一步沟通动作回答。',
    answerFrame: '结论第一句必须直接判断两个人现在的互动质量，以及下一步该靠近、澄清还是拉开距离。'
  };
  return rules.find(rule => includesAny(question, rule.keywords)) || {
    label: '开放探索',
    instruction: '先界定你将按哪个具体方向解读，再给出清楚结论、主要风险和下一步行动。',
    answerFrame: '结论第一句必须把模糊问题收束成一个具体判断，不要只给情绪安慰。'
  };
}

function normalizeQuestion(question = '') {
  return String(question || '').replace(/\s+/g, ' ').trim();
}

function getReadableQuestion(question = '') {
  return normalizeQuestion(question) || '不输入具体问题，直接看当下最需要留意的信号';
}

function formatCardsForPrompt(cards = []) {
  if (!Array.isArray(cards) || !cards.length) return '- 未抽到有效牌面';
  return cards.map((card, index) => {
    const position = String(card?.position || `位置${index + 1}`).trim();
    const name = String(card?.cardName || card?.name || '未知牌').trim();
    const meaning = String(card?.meaning || '暂无牌义').trim();
    const direction = card?.isReversed ? '逆位' : (/\(逆位\)/.test(name) ? '逆位' : '正位/未标注');
    return `- ${position}: ${name}（${direction}）。核心含义：${meaning}`;
  }).join('\n');
}

function buildReadingQualityContract({ questionFocus, hasSpecificQuestion = false, fallbackShort = false } = {}) {
  return `
解读质量标准：
1. 第一屏必须让用户在 10 秒内看到答案：问题复述、结论、风险、下一步都要靠前。
2. 结论不能逃避判断。${questionFocus?.answerFrame || ''}
3. 每个关键判断都要回扣至少一张牌或一个牌阵位置，不能只写通用心理建议。
4. ${hasSpecificQuestion ? '必须保留用户问题里的核心对象、场景或选择项；不要换题。' : '这是轻量灵感牌，可以按“当下提醒”来解读，但仍要给出现实可做的小动作。'}
5. “现在去做”必须是 3 条动作清单，每条都包含现实动词、具体对象，并尽量带时间或数量，例如：发、问、约、等、核对、写下、收集、评估、暂停、停止、取消、设边界、比较、准备。
6. 禁止用“顺其自然、相信宇宙、答案在你心里、命运会安排、看见自己”代替答案。
7. 不做医疗、法律、投资收益或绝对命运承诺；需要谨慎时，说清边界和观察信号。
${fallbackShort ? '8. 这是修正版或稳定版，长度更短，但结构必须完整，尤其要修正偏题和无结论。' : '8. 总体克制，宁可短而清楚，不要长而飘。'}`;
}

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: '只接受 POST 请求' });

  const API_KEY = process.env.OPENAI_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: '后端未配置 API Key' });

  const { question, cards, soulCard, isDaily, isNight, vipToken, fallbackShort, qualityIssue, userName, partnerName, emotionLevel, emotionLabel, isCompatibility, previousReading } = req.body || {};
  const safeCards = Array.isArray(cards) ? cards : [];
  const vipSigningSecret = process.env.VIP_SIGNING_SECRET || API_KEY;
  const requiredVipProductType = getRequiredVipProductType({ cards: safeCards, isCompatibility });

  if (!isDaily && requiredVipProductType) {
    if (!vipSigningSecret) return res.status(503).json({ error: 'VIP 验证未配置' });
    const verification = verifyVipToken(vipToken, vipSigningSecret, {
      requiredProductType: requiredVipProductType
    });
    if (!verification.ok) {
      return res.status(402).json({ error: '高级牌阵需要VIP解锁验证' });
    }
  }
  
  let promptContext = "";
  let systemRole = "";

  const soulCall = soulCard ? `访客的本命牌是【${soulCard.name}】，请在文中提到这一点并结合分析。` : "";

  // 模式 A：朋友圈日签模式
  if (isDaily) {
    systemRole = "你是一位极具诗意和疗愈感的占星诗人。";
    const dailyCard = safeCards[0] || {};
    const dailyCardName = dailyCard.cardName || dailyCard.name || "未知之牌";
    const dailyCardMeaning = dailyCard.meaning || "未知含义";
    promptContext = `今天抽到的日签是【${dailyCardName}】(核心含义:${dailyCardMeaning})。
写一段 60 字左右的绝美散文诗作为今日箴言。不要解释牌意，直接输出文字，不带任何标签。`;
  } 
  // 模式 B：结构化专业解盘模式
  else {
    let styleDesc = "你是一位经验丰富、判断清晰的咨询式塔罗解读师。说话像成熟咨询师，不像散文作者。";

    if (isNight) styleDesc += " 此时正值深夜，语气可以温和，但仍要保持清楚、稳定、不过度煽情。";
    
    systemRole = styleDesc + (fallbackShort
      ? " 你需要输出一版更短、更稳的简版解析。如果这是修正稿，要优先修正偏题、无结论、答非所问或行动建议不具体的问题。"
      : " 你需要输出简洁清晰的解析。重点是让用户一眼看懂，不要写成长篇散文，也不要为了显得专业而故意写长。");
    
    const identityLine = userName ? `提问者昵称：${userName}` : "提问者昵称：匿名旅人";
    const compatibilityLine = isCompatibility && partnerName
      ? `这是双人合盘问题，对方昵称：${partnerName}。请分析双方互动模式、误解来源与可执行沟通建议。`
      : "这是单人问题，聚焦提问者自身成长与决策。";
    const emotionLine = `当前情绪雷达：等级 ${Number(emotionLevel || 3)}（${emotionLabel || "平静观察"}）。请在语气与建议力度中体现这个状态。`;

    const safeQuestion = getReadableQuestion(question);
    const hasSpecificQuestion = Boolean(normalizeQuestion(question));
    const questionFocus = detectQuestionFocus(safeQuestion, isCompatibility);
    const qualityContract = buildReadingQualityContract({ questionFocus, hasSpecificQuestion, fallbackShort });

    promptContext = `${soulCall}
${identityLine}
${compatibilityLine}
${emotionLine}
问题类型判定：${questionFocus.label}
回答重点：${questionFocus.instruction}
${qualityIssue ? `上一版解读存在问题：${String(qualityIssue).slice(0, 420)}。这一版必须修正这个问题。` : ""}
${previousReading ? `上一版解读摘要：${String(previousReading).replace(/\s+/g, ' ').slice(0, 700)}。请保留有用判断，删掉偏题和空泛部分。` : ""}
TA的疑惑：“${safeQuestion}”
抽到的阵法：
${formatCardsForPrompt(safeCards)}

${qualityContract}

你的解盘必须严格遵守以下结构：
1. 先输出：### 我理解的问题
用 1 句话复述用户真正想问的事。必须包含用户问题里的核心对象或关键词；如果问题很模糊，先说清你会按哪个方向解读，不能擅自换题。
2. 然后输出：### 结论
第一句话必须直接回答问题。能判断就明确判断（例如：能 / 不能 / 值得 / 暂缓 / 有机会但要先处理XX）。不要把结论藏在后文；不要先铺垫情绪。
3. 然后输出：### 关键提醒
用 2-3 条短句说明最关键的信息。每条都要指向一个牌面、牌阵位置或现实信号，不要空话。
4. 然后输出：### 为什么会这样
用 2 个短段落解释牌面逻辑：现状、阻碍、转机分别是什么。每段至少提到一个具体牌名或位置，不要讲太多背景故事，不要重复。
5. 最后输出：### 现在去做
给出 3 条可执行建议，每条一句话，直接能落地；每条都要包含“动作 + 对象 + 时间/数量/边界”中的至少两个要素。不要把“相信自己、保持觉察、用数据代替想象”当作行动。

排版铁律：
1. 全部使用纯 Markdown 格式：### 或 #### 做标题，> 做引用，**加粗**，- 列表。
2. 绝对禁止使用任何 HTML 标签（包括 div, h4, p, span, style 等）。
3. 绝对禁止使用 markdown 代码块。`;

    promptContext += `

表达铁律：
1. 优先说人话，避免玄而又玄、诗化、重复铺垫。
2. 句子尽量短，每句只说一个重点。
3. 不要使用“你要相信宇宙”“命运自有安排”这类空泛表述。
4. 用户最先看到的前 5 行，必须已经知道答案、风险点和下一步。
5. 少用“神谕、灵魂、命运、能量、注定”等词，除非牌义确实必须提到。
6. 不要写安慰废话，不要重复牌名，不要把同一个意思换种说法说三遍。
7. 如果信息不足以给肯定判断，就明确说“暂时不建议”或“还要观察”，不要含糊。
8. 必须围绕用户原问题回答；不要泛化成与问题无关的人生建议。
9. 如果用户问关系，就不要泛泛谈事业；问事业，就不要泛泛谈情绪；问选择，就必须比较两个方向。
10. 如果用户反馈“偏了”，修正版要先承认并重新对齐问题，不要为上一版辩解。`;
    promptContext += `
11. 输出前自检：结论第一句必须能单独回答“TA到底问了什么”。如果不能，就重写结论。
12. “现在去做”的每一条建议必须包含一个现实动作，例如发一条信息、收集三个事实、等一个节点、核对一个事实、暂停一个决定、停掉一个消耗项或设一个边界。
13. 如果用户的问题包含人名、TA、A/B、工作、复合、钱、时间等关键词，至少在“我理解的问题”和“结论”里各回应一次。`;
  }

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: "deepseek-chat", 
        messages: [
          { "role": "system", "content": systemRole || "你是一个严格遵守排版规则的高级占卜助手。" },
          { "role": "user", "content": promptContext }
        ],
        temperature: isDaily ? 0.9 : 0.65,
        max_tokens: isDaily ? 150 : (fallbackShort ? 500 : 1200),
        stream: !isDaily && !fallbackShort
      })
    });

    if (!response.ok) return res.status(response.status).json({ error: '大模型连接失败' });

    if (isDaily || fallbackShort) {
      const data = await response.json();
      return res.status(200).json({ reading: data.choices[0].message.content });
    }

    // 长文流式下发
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      res.write(chunk);
    }
    res.end();

  } catch (error) {
    if(!isDaily) res.status(500).end(`data: [ERROR] 后端崩溃 ${error.message}\n\n`);
    else res.status(500).json({ error: error.message });
  }
}
