import type { ProceedingState, ProceedingStage } from "../types/blackboard";

interface ProceedingOverlayProps {
  proceeding: ProceedingState | null;
}

const proceedingStages: Record<ProceedingStage, string> = {
  resolving_bullets: "解析正文编辑与侧边批注",
  synthesizing_changes: "统合可审阅的修改建议",
  materializing_review: "整理审阅提案",
};

const stageOrder: ProceedingStage[] = [
  "resolving_bullets",
  "synthesizing_changes",
  "materializing_review",
];

export function ProceedingOverlay({
  proceeding,
}: ProceedingOverlayProps) {
  const activeProceeding =
    proceeding ??
    ({
      stage: "resolving_bullets",
      completed: 0,
      total: 1,
      progress: 0,
    } satisfies ProceedingState);
  const safeProgress = Math.max(0, Math.min(100, activeProceeding.progress));
  const completedCount = Math.max(0, activeProceeding.completed);
  const totalCount = Math.max(1, activeProceeding.total);
  const safeStageIndex = Math.max(0, stageOrder.indexOf(activeProceeding.stage));
  const stageLabel = proceedingStages[activeProceeding.stage];

  return (
    <section className="proceeding-overlay" aria-label="Proceeding session">
      <div className="proceeding-status">
        <div className="proceeding-orbit" aria-hidden="true">
          <span className="orbit-line orbit-line-a" />
          <span className="orbit-line orbit-line-b" />
          <span className="orbit-line orbit-line-c" />
          <span className="orbit-dot orbit-dot-a" />
          <span className="orbit-dot orbit-dot-b" />
          <span className="orbit-core" />
        </div>
        <h2>正在统合本轮修改</h2>
        <p>
          Agent 正在深度解析正文编辑与侧边批注，为您准备下一阶段的审阅建议。
        </p>
        <div className="proceeding-count">
          <strong>
            {completedCount} / {totalCount}
          </strong>
          <span>{safeProgress >= 100 ? "已完成" : "处理中"}</span>
        </div>
        <div className="proceeding-progress" aria-hidden="true">
          <span style={{ width: `${safeProgress}%` }} />
        </div>
        <div className="proceeding-substage">
          第 {safeStageIndex + 1}/3 步：{stageLabel}...
        </div>
      </div>
    </section>
  );
}
