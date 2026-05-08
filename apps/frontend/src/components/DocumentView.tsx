import type { DocumentUnit } from "../types/blackboard";
import {
  DocumentUnitRenderer,
  type CommentHighlight,
} from "./DocumentUnitRenderer";

interface DocumentViewProps {
  activeAnchorUnitId: string | null;
  commentHighlightsByUnit: Record<string, CommentHighlight[]>;
  editingUnitId: string | null;
  onHoverHighlightBullet: (bulletId: string | null) => void;
  onCancelEdit: () => void;
  onCommitEdit: (unitId: string, text: string) => void;
  onStartEdit: (unitId: string) => void;
  documentUnits: DocumentUnit[];
}

export function DocumentView({
  activeAnchorUnitId,
  commentHighlightsByUnit,
  editingUnitId,
  onHoverHighlightBullet,
  onCancelEdit,
  onCommitEdit,
  onStartEdit,
  documentUnits,
}: DocumentViewProps) {
  return (
    <article className="document-view" aria-label="Manuscript">
      {documentUnits.map((unit) => (
        <DocumentUnitRenderer
          commentHighlights={commentHighlightsByUnit[unit.unitId] ?? []}
          isActiveAnchor={unit.unitId === activeAnchorUnitId}
          isEditing={unit.unitId === editingUnitId}
          key={unit.unitId}
          onHoverHighlightBullet={onHoverHighlightBullet}
          onCancelEdit={onCancelEdit}
          onCommitEdit={onCommitEdit}
          onStartEdit={onStartEdit}
          unit={unit}
        />
      ))}
    </article>
  );
}
