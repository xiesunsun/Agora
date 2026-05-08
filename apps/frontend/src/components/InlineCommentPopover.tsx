import { useEffect, useRef, useState } from "react";

export interface SelectionDraft {
  anchorText: string;
  unitId: string;
  x: number;
  y: number;
}

interface InlineCommentPopoverProps {
  selectionDraft: SelectionDraft;
  onCancel: () => void;
  onSubmit: (unitId: string, anchorText: string, content: string) => void;
}

export function InlineCommentPopover({
  selectionDraft,
  onCancel,
  onSubmit,
}: InlineCommentPopoverProps) {
  const [content, setContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [selectionDraft.unitId, selectionDraft.anchorText]);

  function handleSubmit() {
    const trimmedContent = content.trim();

    if (!trimmedContent) {
      return;
    }

    onSubmit(selectionDraft.unitId, selectionDraft.anchorText, trimmedContent);
    setContent("");
  }

  return (
    <div
      className="inline-comment-popover"
      style={{ left: selectionDraft.x, top: selectionDraft.y }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <textarea
        ref={textareaRef}
        value={content}
        placeholder="Add a note"
        onChange={(event) => setContent(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            handleSubmit();
          }

          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      />
      <div className="inline-comment-actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" onClick={handleSubmit}>
          Comment
        </button>
      </div>
    </div>
  );
}
