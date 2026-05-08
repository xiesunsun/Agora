import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { PointerEvent } from "react";
import type { Bullet, DocumentUnit, PageStatus } from "../types/blackboard";
import { BulletRail } from "./BulletRail";
import { DocumentScroller } from "./DocumentScroller";
import type { CommentHighlight } from "./DocumentUnitRenderer";
import { EdgeLayer } from "./EdgeLayer";
import {
  InlineCommentPopover,
  type SelectionDraft,
} from "./InlineCommentPopover";
import type { PositionedBullet } from "./railLayout";

interface ReadingSurfaceProps {
  bullets: Bullet[];
  editingUnitId: string | null;
  onCancelEdit: () => void;
  onCreateComment: (
    unitId: string,
    anchorText: string,
    content: string,
  ) => void;
  onCommitEdit: (unitId: string, text: string) => void;
  onStartEdit: (unitId: string) => void;
  pageStatus: PageStatus;
  documentUnits: DocumentUnit[];
}

export function ReadingSurface({
  bullets,
  editingUnitId,
  onCancelEdit,
  onCreateComment,
  onCommitEdit,
  onStartEdit,
  pageStatus,
  documentUnits,
}: ReadingSurfaceProps) {
  const railVisible = pageStatus === "active" && bullets.length > 0;
  const [hoveredBulletId, setHoveredBulletId] = useState<string | null>(null);
  const [selectedBulletId, setSelectedBulletId] = useState<string | null>(null);
  const [selectionDraft, setSelectionDraft] = useState<SelectionDraft | null>(
    null,
  );
  const [measuredRailY, setMeasuredRailY] = useState<Record<string, number>>(
    {},
  );
  const positionedBullets = useMemo(
    () =>
      applyBulletSpacing(
        bullets.map((bullet) => ({
          ...bullet,
          railY: measuredRailY[bullet.bulletId] ?? bullet.railY,
        })),
      ),
    [bullets, measuredRailY],
  );
  const hoveredBullet =
    positionedBullets.find((bullet) => bullet.bulletId === hoveredBulletId) ??
    null;
  const selectedBullet =
    positionedBullets.find((bullet) => bullet.bulletId === selectedBulletId) ??
    null;
  const noteOpen = selectedBullet !== null;
  const mappedBullet = hoveredBullet ?? selectedBullet;
  const commentHighlightsByUnit = useMemo(
    () => buildCommentHighlightsByUnit(bullets, selectionDraft, mappedBullet),
    [bullets, selectionDraft, mappedBullet],
  );
  const activeAnchorUnitId =
    mappedBullet && (mappedBullet.kind === "edit" || !mappedBullet.anchorText)
      ? mappedBullet.anchorUnitId
      : null;

  useEffect(() => {
    if (
      selectedBulletId &&
      !positionedBullets.some((bullet) => bullet.bulletId === selectedBulletId)
    ) {
      setSelectedBulletId(null);
    }
  }, [positionedBullets, selectedBulletId]);

  useLayoutEffect(() => {
    if (!railVisible) {
      return;
    }

    const measure = () => {
      const rail = document.querySelector(".bullet-rail");

      if (!rail) {
        return;
      }

      const railRect = rail.getBoundingClientRect();
      const nextMeasuredRailY: Record<string, number> = {};

      for (const bullet of bullets) {
        const unit = document.querySelector(
          `[data-unit-id="${bullet.anchorUnitId}"]`,
        );

        if (!unit) {
          continue;
        }

        const unitRect = unit.getBoundingClientRect();
        const anchorY = unitRect.top + Math.min(unitRect.height / 2, 48);
        nextMeasuredRailY[bullet.bulletId] = Math.min(
          96,
          Math.max(4, ((anchorY - railRect.top) / railRect.height) * 100),
        );
      }

      setMeasuredRailY((currentMeasuredRailY) => {
        const currentKeys = Object.keys(currentMeasuredRailY);
        const nextKeys = Object.keys(nextMeasuredRailY);
        const sameLength = currentKeys.length === nextKeys.length;
        const sameValues =
          sameLength &&
          nextKeys.every(
            (key) =>
              Math.abs(
                (currentMeasuredRailY[key] ?? -1) - nextMeasuredRailY[key],
              ) < 0.1,
          );

        return sameValues ? currentMeasuredRailY : nextMeasuredRailY;
      });
    };

    const animationFrame = window.requestAnimationFrame(measure);
    window.addEventListener("resize", measure);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", measure);
    };
  }, [bullets, documentUnits, editingUnitId, railVisible]);

  function handlePointerUp() {
    if (editingUnitId) {
      return;
    }

    window.setTimeout(() => {
      const selection = window.getSelection();
      const anchorText = selection?.toString().trim() ?? "";

      if (!selection || selection.rangeCount === 0 || anchorText.length === 0) {
        return;
      }

      const range = selection.getRangeAt(0);
      const container =
        range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
          ? (range.commonAncestorContainer as Element)
          : range.commonAncestorContainer.parentElement;
      const unitElement = container?.closest<HTMLElement>("[data-unit-id]");

      if (!unitElement || !unitElement.closest(".document-view")) {
        return;
      }

      const unitId = unitElement.dataset.unitId;

      if (!unitId) {
        return;
      }

      const rangeRect = range.getBoundingClientRect();
      const surfaceRect = document
        .querySelector(".reading-surface")
        ?.getBoundingClientRect();

      if (!surfaceRect) {
        return;
      }

      setSelectionDraft({
        anchorText,
        unitId,
        x: rangeRect.left - surfaceRect.left + rangeRect.width / 2,
        y: rangeRect.bottom - surfaceRect.top + 12,
      });
    }, 0);
  }

  function handlePointerDown(event: PointerEvent<HTMLElement>) {
    if (!selectedBulletId) {
      return;
    }

    const target = event.target as Element;

    if (target.closest(".bullet-node, .bullet-note")) {
      return;
    }

    setSelectedBulletId(null);
  }

  return (
    <section
      className="reading-surface"
      data-note-open={noteOpen ? "true" : undefined}
      data-status={pageStatus}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      <DocumentScroller
        activeAnchorUnitId={activeAnchorUnitId}
        commentHighlightsByUnit={commentHighlightsByUnit}
        editingUnitId={editingUnitId}
        onHoverHighlightBullet={setHoveredBulletId}
        onCancelEdit={onCancelEdit}
        onCommitEdit={onCommitEdit}
        onStartEdit={onStartEdit}
        documentUnits={documentUnits}
      />
      {railVisible ? (
        <>
          <EdgeLayer
            activeBullet={mappedBullet}
            layoutState={`${noteOpen}:${selectedBulletId ?? ""}`}
          />
          <BulletRail
            bullets={positionedBullets}
            hoveredBulletId={hoveredBulletId}
            selectedBulletId={selectedBulletId}
            onHoverBullet={setHoveredBulletId}
            onSelectBullet={setSelectedBulletId}
          />
        </>
      ) : null}
      {selectionDraft ? (
        <InlineCommentPopover
          selectionDraft={selectionDraft}
          onCancel={() => setSelectionDraft(null)}
          onSubmit={(unitId, anchorText, content) => {
            onCreateComment(unitId, anchorText, content);
            window.getSelection()?.removeAllRanges();
            setSelectionDraft(null);
          }}
        />
      ) : null}
    </section>
  );
}

function applyBulletSpacing(bullets: Bullet[]): PositionedBullet[] {
  const clusterThreshold = 3.8;
  const rowGap = 3.2;
  const laneOffsets = [0, 22, 44, -22, -44];
  const sorted = [...bullets].sort((a, b) => a.railY - b.railY);
  const clusters: Bullet[][] = [];

  for (const bullet of sorted) {
    const currentCluster = clusters[clusters.length - 1];
    const clusterAnchorY = currentCluster?.[0]?.railY;

    if (
      currentCluster &&
      clusterAnchorY !== undefined &&
      Math.abs(bullet.railY - clusterAnchorY) <= clusterThreshold
    ) {
      currentCluster.push(bullet);
      continue;
    }

    clusters.push([bullet]);
  }

  return clusters.flatMap((cluster) => {
    const clusterY =
      cluster.reduce((totalY, bullet) => totalY + bullet.railY, 0) /
      cluster.length;

    return cluster.map((bullet, index) => {
      const rowIndex = Math.floor(index / laneOffsets.length);
      const laneIndex = index % laneOffsets.length;

      return {
        ...bullet,
        railOffsetX: laneOffsets[laneIndex],
        railY: Math.min(96, clusterY + rowIndex * rowGap),
      };
    });
  });
}

function buildCommentHighlightsByUnit(
  bullets: Bullet[],
  selectionDraft: SelectionDraft | null,
  activeBullet: Bullet | null,
): Record<string, CommentHighlight[]> {
  const grouped = new Map<
    string,
    Map<
      string,
      {
        activeKind?: "comment" | "edit";
        bulletId?: string;
        count: number;
        isActive: boolean;
        isDraft: boolean;
        text: string;
      }
    >
  >();

  const addHighlight = (
    unitId: string,
    text: string,
    options: {
      activeKind?: "comment" | "edit";
      bulletId?: string;
      contributesToCount?: boolean;
      isActive?: boolean;
      isDraft?: boolean;
    } = {},
  ) => {
    const trimmedText = text.trim();

    if (!trimmedText) {
      return;
    }

    const unitHighlights = grouped.get(unitId) ?? new Map();
    const existing = unitHighlights.get(trimmedText);
    const contributesToCount = options.contributesToCount ?? true;

    unitHighlights.set(trimmedText, {
      activeKind: options.activeKind ?? existing?.activeKind,
      bulletId: options.bulletId ?? existing?.bulletId,
      count: (existing?.count ?? 0) + (contributesToCount ? 1 : 0),
      isActive: (existing?.isActive ?? false) || (options.isActive ?? false),
      isDraft: (existing?.isDraft ?? false) || (options.isDraft ?? false),
      text: trimmedText,
    });
    grouped.set(unitId, unitHighlights);
  };

  for (const bullet of bullets) {
    if (bullet.kind === "comment" && bullet.anchorText) {
      addHighlight(bullet.anchorUnitId, bullet.anchorText, {
        bulletId: bullet.bulletId,
      });
    }
  }

  if (selectionDraft) {
    addHighlight(selectionDraft.unitId, selectionDraft.anchorText, {
      isDraft: true,
    });
  }

  if (activeBullet?.kind === "comment" && activeBullet.anchorText) {
    addHighlight(activeBullet.anchorUnitId, activeBullet.anchorText, {
      activeKind: activeBullet.kind,
      bulletId: activeBullet.bulletId,
      contributesToCount: false,
      isActive: true,
    });
  }

  return Object.fromEntries(
    [...grouped.entries()].map(([unitId, highlights]) => [
      unitId,
      [...highlights.values()],
    ]),
  );
}
