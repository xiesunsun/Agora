import type { CSSProperties } from "react";
import { selectBulletVisualStatus } from "../app/sessionSelectors";
import type { PositionedBullet } from "./railLayout";

interface BulletNoteProps {
  bullet: PositionedBullet;
  onClose: () => void;
}

export function BulletNote({ bullet, onClose }: BulletNoteProps) {
  const body =
    bullet.kind === "edit"
      ? "这一段被用户修改了"
      : (bullet.content ?? bullet.body);

  return (
    <aside
      className="bullet-note"
      data-kind={bullet.kind}
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
      {bullet.kind === "comment" && bullet.anchorText ? (
        <p className="bullet-note-anchor">“{bullet.anchorText}”</p>
      ) : null}
      <p className="bullet-note-body">{body}</p>
    </aside>
  );
}
