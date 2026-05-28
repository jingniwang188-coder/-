# 塔罗之眼解读质量样本集

这个文件记录“牌面解读质量”的长期检查方法。目标不是让回答变长，而是让每次解读更直接、更具体、更贴着用户的问题。

## 检查重点

- 结论是否在第一屏出现。
- 第一结论是否直接回答问题，而不是绕成情绪安慰。
- 是否回应用户问题里的核心对象，比如前任、工作、钱、时间或选择项。
- 是否回扣具体牌名或牌阵位置。
- “现在去做”是否至少有 3 条现实动作。
- 是否避免“顺其自然、相信宇宙、答案在你心里”这类逃避式表达。

## 样本覆盖

样本文件在 `tools/reading-quality-samples.json`，目前覆盖 12 类典型场景：

- 关系复合与主动联系
- 关系边界与忽冷忽热
- 工作机会等待或主动寻找
- 面试准备
- 副业与现金流
- 高价消费与预算
- 城市发展二选一
- 合作邀约判断
- 三个月关系走势
- 一个月项目推进
- 轻量灵感牌
- 开放式自我调整

## 使用方法

运行全部样本：

```bash
node tools/run-reading-quality-check.mjs
```

只跑前 3 个样本：

```bash
node tools/run-reading-quality-check.mjs --limit 3
```

只跑某一个样本：

```bash
node tools/run-reading-quality-check.mjs --only relationship-reconnect
```

只检查评分器本身，不访问线上接口：

```bash
node tools/run-reading-quality-check.mjs --self-test
```

脚本默认调用正式站接口 `https://www.tarotwheel.top/api/tarot`，并解析正式流式解读结果。需要测试稳定版简短回复时，可以加 `--fallback`：

```bash
node tools/run-reading-quality-check.mjs --fallback
```

检查结果会保存到 `reports/`。这些报告用于本地复盘，不需要每次都发布到网站。

## 通过标准

理想状态是：

- 单次样本得分不低于 88。
- 全部样本平均分不低于 90。
- 没有“缺少结论”“行动建议不足 3 条”“没有回应样本关键对象”这三类严重问题。

如果某个样本低于标准，优先调整 `api/tarot.js` 里的提示词规则；如果是前端没有拦住明显问题，再调整 `reading-engine.js` 的质量检查。
