import type { DocumentUnit } from "../types/blackboard";
import type { CommentHighlight } from "./DocumentUnitRenderer";
import { DocumentView } from "./DocumentView";

interface DocumentScrollerProps {
  activeAnchorUnitId: string | null;
  commentHighlightsByUnit: Record<string, CommentHighlight[]>;
  editingUnitId: string | null;
  onHoverHighlightBullet: (bulletId: string | null) => void;
  onCancelEdit: () => void;
  onCommitEdit: (unitId: string, text: string) => void;
  onStartEdit: (unitId: string) => void;
  documentUnits: DocumentUnit[];
}

export function DocumentScroller({
  activeAnchorUnitId,
  commentHighlightsByUnit,
  editingUnitId,
  onHoverHighlightBullet,
  onCancelEdit,
  onCommitEdit,
  onStartEdit,
  documentUnits,
}: DocumentScrollerProps) {
  return (
    <div className="document-scroller">
      <DocumentView
        activeAnchorUnitId={activeAnchorUnitId}
        commentHighlightsByUnit={commentHighlightsByUnit}
        editingUnitId={editingUnitId}
        onHoverHighlightBullet={onHoverHighlightBullet}
        onCancelEdit={onCancelEdit}
        onCommitEdit={onCommitEdit}
        onStartEdit={onStartEdit}
        documentUnits={documentUnits}
      />
    </div>
  );
}
