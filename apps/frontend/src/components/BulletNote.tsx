import type { CSSProperties } from "react";
import { selectBulletVisualStatus } from "../app/sessionSelectors";
import type { PositionedBullet } from "./railLayout";

interface BulletNoteProps {
  bullet: PositionedBullet;
  onClose: () => void;
}

function truncateAnchor(text: string): string {
  const firstLine = text.split("\n")[0] ?? text;
  if (firstLine.length > 60 || text.includes("\n")) {
    return firstLine.slice(0, 60) + "\u2026";
  }
  return firstLine;
}

export function BulletNote({ bullet, onClose }: BulletNoteProps) {
  const body =
    bullet.type === "edit"
      ? "\u8FD9\u4E00\u6BB5\u88AB\u7528\u6237\u4FEE\u6539\u4E86"
      : (bullet.content ?? bullet.body);

  return (
    <aside
      className="bullet-note"
      data-kind={bullet.type}
      data-status={selectBulletVisualStatus(bullet)}
      style={
        {
          "--rail-offset-x": `${bullet.railOffsetX}px`,
          top: `${bullet.railY}%`,
        } as CSSProperties
      }
    >
      <div className="bullet-note-header">
        <span>{bullet.author}</span>
        <button type="button" onClick={onClose} aria-label="Close note">
          ×
        </button>
      </div>
      {bullet.type === "comment" && bullet.anchorTextSnapshot ? (
        <p className="bullet-note-anchor">
          {"\u201C"}{truncateAnchor(bullet.anchorTextSnapshot)}{"\u201D"}
        </p>
      ) : null}
      <p className="bullet-note-body">{body}</p>
    </aside>
  );
}
