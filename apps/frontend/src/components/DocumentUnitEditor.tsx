import { useEffect, useRef, useState } from "react";
import type { DocumentUnit } from "../types/blackboard";

interface DocumentUnitEditorProps {
  initialText: string;
  unit: DocumentUnit;
  onCancel: () => void;
  onCommit: (unitId: string, text: string) => void;
}

export function DocumentUnitEditor({
  initialText,
  unit,
  onCancel,
  onCommit,
}: DocumentUnitEditorProps) {
  const [draft, setDraft] = useState(initialText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [draft]);

  function handleCommit() {
    onCommit(unit.unitId, draft);
  }

  return (
    <div className="document-unit-editor">
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            handleCommit();
          }

          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      />
      <div className="document-unit-editor-actions">
        <button type="button" onClick={onCancel}>
          取消
        </button>
        <button type="button" onClick={handleCommit}>
          保存
        </button>
      </div>
    </div>
  );
}
