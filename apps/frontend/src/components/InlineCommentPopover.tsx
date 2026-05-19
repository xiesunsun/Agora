import { useEffect, useRef, useState } from "react";

export interface SelectionDraft {
  anchorText: string;
  anchorStartOffset?: number;
  anchorEndOffset?: number;
  unitId: string;
  x: number;
  y: number;
}

interface InlineCommentPopoverProps {
  selectionDraft: SelectionDraft;
  onCancel: () => void;
  onSubmit: (
    unitId: string,
    anchorText: string,
    content: string,
    anchorStartOffset?: number,
    anchorEndOffset?: number,
  ) => void;
}

export function InlineCommentPopover({
  selectionDraft,
  onCancel,
  onSubmit,
}: InlineCommentPopoverProps) {
  const [content, setContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // 不自动 focus，保留用户的文字 selection 以便复制
    // 用户点击 textarea 时会自然获得焦点
  }, [selectionDraft.unitId, selectionDraft.anchorText]);

  function handleSubmit() {
    const trimmedContent = content.trim();

    if (!trimmedContent) {
      return;
    }

    onSubmit(
      selectionDraft.unitId,
      selectionDraft.anchorText,
      trimmedContent,
      selectionDraft.anchorStartOffset,
      selectionDraft.anchorEndOffset,
    );
    setContent("");
  }

  return (
    <div
      className="inline-comment-popover"
      style={{ left: selectionDraft.x, top: selectionDraft.y }}
    >
      <textarea
        ref={textareaRef}
        value={content}
        placeholder="添加批注"
        onMouseDown={(event) => event.stopPropagation()}
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
          取消
        </button>
        <button type="button" onClick={handleSubmit}>
          批注
        </button>
      </div>
    </div>
  );
}
