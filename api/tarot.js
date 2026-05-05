import crypto from 'node:crypto';

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

function verifyVipToken(token, secret) {
  if (!token || !secret) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const payloadB64 = parts[0];
  const signature = parts[1];
  const expected = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');
  if (signature !== expected) return false;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    if (!payload?.exp) return false;
    return Date.now() < payload.exp;
  } catch {
    return false;
  }
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

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: '只接受 POST 请求' });

  const API_KEY = process.env.OPENAI_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: '后端未配置 API Key' });

  const { question, cards, soulCard, isDaily, isNight, vipToken, fallbackShort, userName, partnerName, emotionLevel, emotionLabel, isCompatibility } = req.body || {};
  const safeCards = Array.isArray(cards) ? cards : [];
  const vipUnlockCode = process.env.VIP_UNLOCK_CODE;
  const vipSigningSecret = process.env.VIP_SIGNING_SECRET || API_KEY;

  if (!isDaily && requiresVipForCards(safeCards) && vipUnlockCode) {
    const ok = verifyVipToken(vipToken, vipSigningSecret);
    if (!ok) {
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
      ? " 你需要输出一版更短、更稳的简版解析。"
      : " 你需要输出简洁清晰的解析。重点是让用户一眼看懂，不要写成长篇散文，也不要为了显得专业而故意写长。");
    
    const identityLine = userName ? `提问者昵称：${userName}` : "提问者昵称：匿名旅人";
    const compatibilityLine = isCompatibility && partnerName
      ? `这是双人合盘问题，对方昵称：${partnerName}。请分析双方互动模式、误解来源与可执行沟通建议。`
      : "这是单人问题，聚焦提问者自身成长与决策。";
    const emotionLine = `当前情绪雷达：等级 ${Number(emotionLevel || 3)}（${emotionLabel || "平静观察"}）。请在语气与建议力度中体现这个状态。`;

    promptContext = `${soulCall}
${identityLine}
${compatibilityLine}
${emotionLine}
TA的疑惑：“${question}”
抽到的阵法：
${safeCards.map(c => `- ${c.position}: 抽到 ${c.cardName}。含义：${c.meaning}`).join('\n')}

你的解盘必须严格遵守以下结构：
1. 先输出：### 结论
内容必须直接回答问题。能判断就明确判断（例如：能 / 不能 / 值得 / 暂缓 / 有机会但要先处理XX）。
2. 然后输出：### 关键提醒
用 2-3 条短句说明最关键的信息，每条都要具体，不要空话。
3. 然后输出：### 为什么会这样
用 2 个短段落解释牌面逻辑：现状、阻碍、转机分别是什么。不要讲太多背景故事，不要重复。
4. 最后输出：### 现在去做
给出 3 条可执行建议，每条一句话，直接能落地。

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
7. 如果信息不足以给肯定判断，就明确说“暂时不建议”或“还要观察”，不要含糊。`;
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
