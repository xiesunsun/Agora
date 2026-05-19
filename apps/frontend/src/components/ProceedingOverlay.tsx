import type { ProceedingState } from "../types/blackboard";

interface ProceedingOverlayProps {
  proceeding: ProceedingState | null;
}

const stageLabels: Record<string, string> = {
  resolving_bullets: "解析正文编辑与侧边批注",
  synthesizing_changes: "统合可审阅的修改建议",
  materializing_review: "整理审阅提案",
};

const stageOrder = ["resolving_bullets", "synthesizing_changes", "materializing_review"];

export function ProceedingOverlay({
  proceeding,
}: ProceedingOverlayProps) {
  const stage = proceeding?.stage ?? "resolving_bullets";
  const stageIndex = Math.max(0, stageOrder.indexOf(stage));
  const progress = proceeding ? Math.max(0, Math.min(100, proceeding.progress)) : 0;
  const stageLabel = stageLabels[stage] ?? stage;

  return (
    <section className="proceeding-overlay" aria-label="Proceeding session">
      <div className="proceeding-status">
        <div className="proceeding-ink" aria-hidden="true">
          <span className="ink-drop" />
        </div>
        <h2>执笔润色中</h2>
        <p className="proceeding-stage-label">{stageLabel}</p>
        <div className="proceeding-progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="proceeding-steps" aria-hidden="true">
          {stageOrder.map((_, i) => (
            <span key={i} className="proceeding-step-dot" data-active={i <= stageIndex ? "true" : undefined} />
          ))}
        </div>
      </div>
    </section>
  );
}
