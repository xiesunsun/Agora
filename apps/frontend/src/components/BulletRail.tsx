import type { CSSProperties } from "react";
import { selectBulletVisualStatus } from "../app/sessionSelectors";
import { AgentAvatar } from "./AgentAvatar";
import { BulletNote } from "./BulletNote";
import type { PositionedBullet } from "./railLayout";

interface BulletRailProps {
  bullets: PositionedBullet[];
  hoveredBulletId: string | null;
  onSelectBullet: (bulletId: string | null) => void;
  onHoverBullet: (bulletId: string | null) => void;
  selectedBulletId: string | null;
}

export function BulletRail({
  bullets,
  hoveredBulletId,
  onSelectBullet,
  onHoverBullet,
  selectedBulletId,
}: BulletRailProps) {
  const activeBullet = bullets.find((bullet) => bullet.status === "processing");
  const selectedBullet =
    bullets.find((bullet) => bullet.bulletId === selectedBulletId) ?? null;

  return (
    <aside className="bullet-rail" aria-label="Collaboration rail">
      <div className="rail-spine" aria-hidden="true" />
      {activeBullet ? <AgentAvatar y={activeBullet.railY} /> : null}
      {bullets.map((bullet) => (
        <button
          className="bullet-node"
          data-anchor-unit-id={bullet.unitId}
          data-bullet-id={bullet.bulletId}
          data-kind={bullet.type}
          data-status={selectBulletVisualStatus(bullet)}
          data-hovered={
            bullet.bulletId === hoveredBulletId ? "true" : undefined
          }
          data-selected={
            bullet.bulletId === selectedBulletId ? "true" : undefined
          }
          key={bullet.bulletId}
          onBlur={() => onHoverBullet(null)}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onSelectBullet(
              bullet.bulletId !== selectedBulletId ? bullet.bulletId : null,
            );
          }}
          onFocus={() => onHoverBullet(bullet.bulletId)}
          onPointerEnter={() => onHoverBullet(bullet.bulletId)}
          onPointerLeave={() => onHoverBullet(null)}
          style={
            {
              "--rail-offset-x": `${bullet.railOffsetX}px`,
              top: `${bullet.railY}%`,
            } as CSSProperties
          }
          type="button"
          aria-label={`${bullet.title}: ${bullet.body}`}
        >
          <span className="bullet-dot" />
          <span className="bullet-label">
            <strong>{bullet.title}</strong>
            <small>{bullet.type}</small>
          </span>
        </button>
      ))}
      {selectedBullet ? (
        <BulletNote
          bullet={selectedBullet}
          onClose={() => onSelectBullet(null)}
        />
      ) : null}
    </aside>
  );
}
