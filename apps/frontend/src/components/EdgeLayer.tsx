import { useLayoutEffect, useState } from "react";
import type { PositionedBullet } from "./railLayout";

interface EdgeLayerProps {
  activeBullet: PositionedBullet | null;
  layoutState: string;
}

interface EdgeGeometry {
  channelX: number;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
}

const EDGE_TARGET_OFFSET = 8;
const EDGE_CHANNEL_OFFSET = 28;
const EDGE_SOURCE_CLEARANCE = 18;

export function EdgeLayer({ activeBullet, layoutState }: EdgeLayerProps) {
  const [geometry, setGeometry] = useState<EdgeGeometry | null>(null);

  useLayoutEffect(() => {
    if (!activeBullet) {
      setGeometry(null);
      return;
    }

    const measure = () => {
      const surface = document.querySelector(".reading-surface");
      const documentView = document.querySelector(".document-view");
      const bulletDot = document.querySelector(
        `[data-bullet-id="${activeBullet.bulletId}"] .bullet-dot`,
      );

      if (!surface || !documentView || !bulletDot) {
        setGeometry(null);
        return;
      }

      const surfaceRect = surface.getBoundingClientRect();
      const documentViewRect = documentView.getBoundingClientRect();
      const sourceRect = bulletDot.getBoundingClientRect();
      const targetRect = findTargetRect(activeBullet, sourceRect);

      if (!targetRect) {
        setGeometry(null);
        return;
      }

      const sourceX = sourceRect.left + sourceRect.width / 2 - surfaceRect.left;
      const sourceY = sourceRect.top + sourceRect.height / 2 - surfaceRect.top;
      const contentRightX = documentViewRect.right - surfaceRect.left;
      const maxTargetX = sourceX - EDGE_SOURCE_CLEARANCE * 2;
      const maxChannelX = sourceX - EDGE_SOURCE_CLEARANCE;
      const targetX = Math.min(contentRightX + EDGE_TARGET_OFFSET, maxTargetX);
      const channelX = Math.max(
        targetX,
        Math.min(contentRightX + EDGE_CHANNEL_OFFSET, maxChannelX),
      );
      const targetY = targetRect.top + targetRect.height / 2 - surfaceRect.top;
      const geometryKey = [
        channelX.toFixed(1),
        sourceX.toFixed(1),
        sourceY.toFixed(1),
        targetX.toFixed(1),
        targetY.toFixed(1),
      ].join(":");

      setGeometry((currentGeometry) => {
        const currentGeometryKey = currentGeometry
          ? [
              currentGeometry.channelX.toFixed(1),
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
          channelX,
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
        <svg
          className="edge-svg"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            overflow: "visible",
          }}
        >
          <defs>
            <linearGradient id="edge-grad" gradientUnits="userSpaceOnUse"
              x1={geometry.targetX} y1={geometry.targetY}
              x2={geometry.sourceX} y2={geometry.sourceY}>
              <stop offset="0%" stopColor="rgba(107, 92, 76, 0.3)" />
              <stop offset="100%" stopColor="rgba(107, 92, 76, 0.6)" />
            </linearGradient>
          </defs>
          <path
            className="edge-connector"
            d={buildEdgePath(geometry)}
            fill="none"
            stroke="url(#edge-grad)"
            strokeWidth="1"
            strokeDasharray="2 4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle
            cx={geometry.targetX}
            cy={geometry.targetY}
            r="2"
            fill="rgba(107, 92, 76, 0.45)"
            className="edge-connector"
          />
        </svg>
      ) : null}
    </div>
  );
}

function buildEdgePath(g: EdgeGeometry): string {
  if (Math.abs(g.sourceY - g.targetY) < 2) {
    return `M ${g.targetX} ${g.targetY} H ${g.sourceX}`;
  }

  // 圆弧半径
  const r = 6;
  const dir = g.sourceY > g.targetY ? 1 : -1; // 1 = 向下, -1 = 向上

  // 从 target 水平到 channel，拐弯处用圆弧，再垂直到 source 高度，拐弯用圆弧，再水平到 source
  return [
    `M ${g.targetX} ${g.targetY}`,
    `H ${g.channelX - r}`,
    `a ${r} ${r} 0 0 ${dir > 0 ? 1 : 0} ${r} ${r * dir}`,
    `V ${g.sourceY - r * dir}`,
    `a ${r} ${r} 0 0 ${dir > 0 ? 0 : 1} ${r} ${r * dir}`,
    `H ${g.sourceX}`,
  ].join(" ");
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
