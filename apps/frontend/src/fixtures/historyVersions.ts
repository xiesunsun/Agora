import type { HistoryVersionPayload } from "../types/blackboard";
import { activeSnapshot } from "./active";

const v1Content = `# 批评作为一种同行写作

批评并不只是给出 verdict。它首先是一种注意力练习：让我们慢下来，仔细阅读眼前的作品。

一条有分寸的批评不会削弱作品；它会让作品的轮廓变得更清楚，让已经成立的强度得以保留。

当我们真正完成一次批评时，我们不是站在作者对面，而是临时站在作者身旁。

## 阅读时的基本姿态

好的协作从不急于替作者完成所有句子。它先辨认文本已经建立的节奏，再决定哪些地方需要追问。

- 先确认作品真正想解决的问题。
- 再检查论证是否跟得上这个问题。

> 一份原稿最需要的不是被快速改写，而是被准确地看见。`;

const v2Content = `# 批评作为一种同行写作

批评并不只是给出 verdict。它首先是一种注意力练习：让我们慢下来，仔细阅读，并在善意中重新接近眼前的作品。

一条有分寸的批评不会削弱作品；它会让作品的轮廓变得更清楚，让已经成立的强度得以保留，也让那些还在犹疑的部分获得继续生长的方向。

当我们真正完成一次批评时，我们不是站在作者对面，而是临时站在作者身旁。我们尝试指出一条更清晰的路径。

## 阅读时的基本姿态

好的协作从不急于替作者完成所有句子。它先辨认文本已经建立的节奏，再决定哪些地方需要追问，哪些地方需要安静。

- 先确认作品真正想解决的问题。
- 再检查论证是否跟得上这个问题。
- 最后才讨论语气、删改和结构。

> 一份原稿最需要的不是被快速改写，而是被准确地看见。

## 工作中的判断

| 维度 | 关注点 | 页面表达 |
| --- | --- | --- |
| 节奏 | 段落是否自然推进 | 保持连续文稿 |
| 精度 | 批注是否指向具体文本 | 附着在纸面边缘 |`;

export const historyVersions: Record<string, HistoryVersionPayload> = {
  v1: buildHistoryVersion(
    "v1",
    1,
    "2026-05-04T09:00:00.000Z",
    v1Content,
  ),
  v2: buildHistoryVersion(
    "v2",
    2,
    "2026-05-04T10:30:00.000Z",
    v2Content,
  ),
  v3: buildHistoryVersion(
    "v3",
    3,
    "2026-05-04T11:20:00.000Z",
    activeSnapshot.currentContent,
  ),
};

function buildHistoryVersion(
  versionId: string,
  versionNumber: number,
  createdAt: string,
  content: string,
): HistoryVersionPayload {
  return {
    versionId,
    versionNumber,
    createdAt,
    content,
  };
}
