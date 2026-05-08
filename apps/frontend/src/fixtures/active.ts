import type {
  Bullet,
  DocumentUnit,
  ReviewChangeSet,
  SessionSnapshot,
} from "../types/blackboard";

const currentContent = `# 批评作为一种同行写作

批评并不只是给出 verdict。它首先是一种注意力练习：让我们慢下来，仔细阅读，并在善意中重新接近眼前的作品。

一条有分寸的批评不会削弱作品；它会让作品的轮廓变得更清楚，让已经成立的强度得以保留，也让那些还在犹疑的部分获得继续生长的方向。

当我们真正完成一次批评时，我们不是站在作者对面，而是临时站在作者身旁。我们尝试指出一条更清晰的路径，同时保留原稿中仍然有呼吸的地方。

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
| 精度 | 批注是否指向具体文本 | 附着在纸面边缘 |
| 结算 | 修改是否可被审阅 | 进入 review 层 |

\`\`\`ts
type ReadingSurface = {
  documentFirst: true;
  railWeight: "subtle";
};
\`\`\`

这就是 active 页面需要先成立的原因：只有当页面首先像一份原稿，后续编辑、批注、review 和 history 才不会把用户从阅读现场里拽走。`;

const units: DocumentUnit[] = [
  {
    unitId: "u-title",
    type: "title",
    markdown: "# 批评作为一种同行写作",
    order: 0,
    sourceStart: 0,
    sourceEnd: 13,
    text: "批评作为一种同行写作",
  },
  {
    unitId: "u-opening",
    type: "paragraph",
    markdown:
      "批评并不只是给出 verdict。它首先是一种注意力练习：让我们慢下来，仔细阅读，并在善意中重新接近眼前的作品。",
    order: 1,
    sourceStart: 15,
    sourceEnd: 71,
    text: "批评并不只是给出 verdict。它首先是一种注意力练习：让我们慢下来，仔细阅读，并在善意中重新接近眼前的作品。",
  },
  {
    unitId: "u-shape",
    type: "paragraph",
    markdown:
      "一条有分寸的批评不会削弱作品；它会让作品的轮廓变得更清楚，让已经成立的强度得以保留，也让那些还在犹疑的部分获得继续生长的方向。",
    order: 2,
    sourceStart: 73,
    sourceEnd: 140,
    text: "一条有分寸的批评不会削弱作品；它会让作品的轮廓变得更清楚，让已经成立的强度得以保留，也让那些还在犹疑的部分获得继续生长的方向。",
  },
  {
    unitId: "u-alongside",
    type: "paragraph",
    markdown:
      "当我们真正完成一次批评时，我们不是站在作者对面，而是临时站在作者身旁。我们尝试指出一条更清晰的路径，同时保留原稿中仍然有呼吸的地方。",
    order: 3,
    sourceStart: 142,
    sourceEnd: 210,
    text: "当我们真正完成一次批评时，我们不是站在作者对面，而是临时站在作者身旁。我们尝试指出一条更清晰的路径，同时保留原稿中仍然有呼吸的地方。",
  },
  {
    unitId: "u-posture-heading",
    type: "heading",
    markdown: "## 阅读时的基本姿态",
    order: 4,
    sourceStart: 212,
    sourceEnd: 223,
    level: 2,
    text: "阅读时的基本姿态",
  },
  {
    unitId: "u-posture",
    type: "paragraph",
    markdown:
      "好的协作从不急于替作者完成所有句子。它先辨认文本已经建立的节奏，再决定哪些地方需要追问，哪些地方需要安静。",
    order: 5,
    sourceStart: 225,
    sourceEnd: 282,
    text: "好的协作从不急于替作者完成所有句子。它先辨认文本已经建立的节奏，再决定哪些地方需要追问，哪些地方需要安静。",
  },
  {
    unitId: "u-list-1",
    type: "list_item",
    markdown: "- 先确认作品真正想解决的问题。",
    order: 6,
    sourceStart: 284,
    sourceEnd: 299,
    listKind: "unordered",
    depth: 0,
    text: "先确认作品真正想解决的问题。",
  },
  {
    unitId: "u-list-2",
    type: "list_item",
    markdown: "- 再检查论证是否跟得上这个问题。",
    order: 7,
    sourceStart: 300,
    sourceEnd: 316,
    listKind: "unordered",
    depth: 0,
    text: "再检查论证是否跟得上这个问题。",
  },
  {
    unitId: "u-list-3",
    type: "list_item",
    markdown: "- 最后才讨论语气、删改和结构。",
    order: 8,
    sourceStart: 317,
    sourceEnd: 333,
    listKind: "unordered",
    depth: 0,
    text: "最后才讨论语气、删改和结构。",
  },
  {
    unitId: "u-quote",
    type: "blockquote",
    markdown: "> 一份原稿最需要的不是被快速改写，而是被准确地看见。",
    order: 9,
    sourceStart: 335,
    sourceEnd: 364,
    text: "一份原稿最需要的不是被快速改写，而是被准确地看见。",
  },
  {
    unitId: "u-judgement-heading",
    type: "heading",
    markdown: "## 工作中的判断",
    order: 10,
    sourceStart: 366,
    sourceEnd: 375,
    level: 2,
    text: "工作中的判断",
  },
  {
    unitId: "u-table",
    type: "table",
    markdown:
      "| 维度 | 关注点 | 页面表达 |\n| --- | --- | --- |\n| 节奏 | 段落是否自然推进 | 保持连续文稿 |\n| 精度 | 批注是否指向具体文本 | 附着在纸面边缘 |\n| 结算 | 修改是否可被审阅 | 进入 review 层 |",
    order: 11,
    sourceStart: 377,
    sourceEnd: 472,
    headers: ["维度", "关注点", "页面表达"],
    rows: [
      ["节奏", "段落是否自然推进", "保持连续文稿"],
      ["精度", "批注是否指向具体文本", "附着在纸面边缘"],
      ["结算", "修改是否可被审阅", "进入 review 层"],
    ],
  },
  {
    unitId: "u-code",
    type: "code_block",
    markdown:
      '```ts\ntype ReadingSurface = {\n  documentFirst: true;\n  railWeight: "subtle";\n};\n```',
    order: 12,
    sourceStart: 474,
    sourceEnd: 555,
    language: "ts",
    code: 'type ReadingSurface = {\n  documentFirst: true;\n  railWeight: "subtle";\n};',
  },
  {
    unitId: "u-close",
    type: "paragraph",
    markdown:
      "这就是 active 页面需要先成立的原因：只有当页面首先像一份原稿，后续编辑、批注、review 和 history 才不会把用户从阅读现场里拽走。",
    order: 13,
    sourceStart: 557,
    sourceEnd: 623,
    text: "这就是 active 页面需要先成立的原因：只有当页面首先像一份原稿，后续编辑、批注、review 和 history 才不会把用户从阅读现场里拽走。",
  },
];

const bullets: Bullet[] = [
  {
    bulletId: "b-1",
    kind: "edit",
    status: "processing",
    anchorUnitId: "u-shape",
    anchorText: "轮廓变得更清楚",
    title: "Development",
    body: "这里可以补一个更具体的例子，让判断从抽象进入文本。",
    author: "Alex",
    railY: 21,
  },
  {
    bulletId: "b-2",
    kind: "comment",
    status: "new",
    anchorUnitId: "u-alongside",
    anchorText: "站在作者身旁",
    title: "Tone",
    body: "这句是整段的心脏，建议保留它的温度。",
    author: "Jun",
    railY: 26,
  },
  {
    bulletId: "b-3",
    kind: "comment",
    status: "ready",
    anchorUnitId: "u-posture",
    anchorText: "哪些地方需要安静",
    title: "Redundancy",
    body: "后续可以考虑合并重复的判断标准。",
    author: "Mia",
    railY: 38,
  },
];

export const emptyReviewChangeSet: ReviewChangeSet | null = null;

export const activeSnapshot: SessionSnapshot = {
  sessionId: "session-local-fixture",
  sessionStatus: "active",
  title: "批评作为一种同行写作",
  baseVersionId: "v1",
  currentVersionId: "v3",
  workingSetRevision: 3,
  currentContent,
  documentUnits: units,
  activeBullets: bullets,
  activeReviewChangeSet: emptyReviewChangeSet,
  proceeding: null,
  versionHistory: [
    {
      versionId: "v1",
      label: "v1",
      createdAt: "2026-05-04T09:00:00.000Z",
      summary: "初始原稿。",
    },
    {
      versionId: "v2",
      label: "v2",
      createdAt: "2026-05-04T10:30:00.000Z",
      summary: "补充协作姿态段落。",
    },
    {
      versionId: "v3",
      label: "v3",
      createdAt: "2026-05-04T11:20:00.000Z",
      summary: "调整 active 阅读母版说明。",
    },
  ],
};
