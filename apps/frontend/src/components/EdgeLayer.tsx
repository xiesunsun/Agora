import { useLayoutEffect, useState } from "react";
import type { PositionedBullet } from "./railLayout";

interface EdgeLayerProps {
  activeBullet: PositionedBullet | null;
  layoutState: string;
}

interface EdgeGeometry {
  angle: number;
  length: number;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
}

export function EdgeLayer({ activeBullet, layoutState }: EdgeLayerProps) {
  const [geometry, setGeometry] = useState<EdgeGeometry | null>(null);

  useLayoutEffect(() => {
    if (!activeBullet) {
      setGeometry(null);
      return;
    }

    const measure = () => {
      const surface = document.querySelector(".reading-surface");
      const bulletDot = document.querySelector(
        `[data-bullet-id="${activeBullet.bulletId}"] .bullet-dot`,
      );

      if (!surface || !bulletDot) {
        setGeometry(null);
        return;
      }

      const surfaceRect = surface.getBoundingClientRect();
      const sourceRect = bulletDot.getBoundingClientRect();
      const targetRect = findTargetRect(activeBullet, sourceRect);

      if (!targetRect) {
        setGeometry(null);
        return;
      }

      const sourceX = sourceRect.left + sourceRect.width / 2 - surfaceRect.left;
      const sourceY = sourceRect.top + sourceRect.height / 2 - surfaceRect.top;
      const targetX = targetRect.right + 6 - surfaceRect.left;
      const targetY = targetRect.top + targetRect.height / 2 - surfaceRect.top;
      const angle = Math.atan2(sourceY - targetY, sourceX - targetX);
      const length = Math.hypot(targetX - sourceX, targetY - sourceY);
      const geometryKey = [
        sourceX.toFixed(1),
        sourceY.toFixed(1),
        targetX.toFixed(1),
        targetY.toFixed(1),
      ].join(":");

      setGeometry((currentGeometry) => {
        const currentGeometryKey = currentGeometry
          ? [
              currentGeometry.sourceX.toFixed(1),
              currentGeometry.sourceY.toFixed(1),
              currentGeometry.targetX.toFixed(1),
              currentGeometry.targetY.toFixed(1),
            ].join(":")
          : null;

        if (currentGeometryKey === geometryKey) {
          return currentGeometry;
        }

        return {
          angle,
          length,
          sourceX,
          sourceY,
          targetX,
          targetY,
        };
      });
    };

    const transitionSurface = document.querySelector(".reading-surface");
    const animationFrame = window.requestAnimationFrame(measure);
    const transitionChecks = [80, 180, 260].map((delay) =>
      window.setTimeout(measure, delay),
    );

    transitionSurface?.addEventListener("transitionend", measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      transitionChecks.forEach((transitionCheck) =>
        window.clearTimeout(transitionCheck),
      );
      transitionSurface?.removeEventListener("transitionend", measure);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [activeBullet, layoutState]);

  if (!activeBullet) {
    return null;
  }

  return (
    <div className="edge-layer" aria-hidden="true">
      {geometry ? (
        <>
          <span
            className="edge-thread-line"
            style={{
              left: geometry.targetX,
              top: geometry.targetY,
              transform: `rotate(${geometry.angle}rad)`,
              width: geometry.length,
            }}
          />
          <span
            className="edge-thread-source"
            style={{ left: geometry.sourceX, top: geometry.sourceY }}
          />
          <span
            className="edge-thread-target"
            style={{ left: geometry.targetX, top: geometry.targetY }}
          />
        </>
      ) : null}
    </div>
  );
}

function findTargetRect(
  activeBullet: PositionedBullet,
  sourceRect: DOMRect,
): DOMRect | null {
  const unit = document.querySelector(
    `[data-unit-id="${activeBullet.unitId}"]`,
  );

  if (!unit) {
    return null;
  }

  if (activeBullet.type === "edit") {
    return findClosestRect(unit, sourceRect);
  }

  if (activeBullet.type === "comment" && activeBullet.anchorTextSnapshot) {
    const highlights = [...unit.querySelectorAll(".comment-text-highlight")];
    const matchingHighlight = highlights.find((highlight) =>
      highlight.textContent?.includes(activeBullet.anchorTextSnapshot ?? ""),
    );

    if (matchingHighlight) {
      return findClosestRect(matchingHighlight, sourceRect);
    }
  }

  if (activeBullet.anchorTextSnapshot) {
    const anchorRect = findAnchorTextRect(
      unit,
      activeBullet.anchorTextSnapshot,
      sourceRect,
    );

    if (anchorRect) {
      return anchorRect;
    }
  }

  return findClosestRect(unit, sourceRect);
}

function findClosestRect(target: Element, sourceRect: DOMRect): DOMRect | null {
  const rects = [...target.getClientRects()];

  if (rects.length === 0) {
    return null;
  }

  const sourceY = sourceRect.top + sourceRect.height / 2;

  return rects.reduce((closestRect, rect) => {
    const closestDistance = Math.abs(
      closestRect.top + closestRect.height / 2 - sourceY,
    );
    const rectDistance = Math.abs(rect.top + rect.height / 2 - sourceY);

    return rectDistance < closestDistance ? rect : closestRect;
  }, rects[0]);
}

function findAnchorTextRect(
  unit: Element,
  anchorText: string,
  sourceRect: DOMRect,
): DOMRect | null {
  const walker = document.createTreeWalker(unit, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node) {
    const text = node.nodeValue ?? "";
    const index = text.indexOf(anchorText);

    if (index >= 0) {
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + anchorText.length);

      return findClosestRangeRect(range, sourceRect);
    }

    node = walker.nextNode();
  }

  return null;
}

function findClosestRangeRect(
  range: Range,
  sourceRect: DOMRect,
): DOMRect | null {
  const rects = [...range.getClientRects()];

  if (rects.length === 0) {
    return null;
  }

  const sourceY = sourceRect.top + sourceRect.height / 2;

  return rects.reduce((closestRect, rect) => {
    const closestDistance = Math.abs(
      closestRect.top + closestRect.height / 2 - sourceY,
    );
    const rectDistance = Math.abs(rect.top + rect.height / 2 - sourceY);

    return rectDistance < closestDistance ? rect : closestRect;
  }, rects[0]);
}
