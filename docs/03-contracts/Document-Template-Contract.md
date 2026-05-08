# Document Template Contract

## 1. Purpose

This document fixes the stable Blackboard page template for MVP execution.

The goal is not to prescribe pixel-perfect implementation details. The goal is to prevent a real product-shape regression where the Blackboard page drifts from a manuscript surface into a generic productivity shell.

## 2. Stable Statement

V1 Blackboard must render through one fixed `document` template.

That template is:

* manuscript-first
* single-surface
* state-layered
* `DocumentUnit`-driven

It is not:

* a dashboard shell
* a card board
* a multi-panel workspace
* a free-form page builder target

## 3. Top-Level Template Skeleton

Every MVP Blackboard page must conceptually map to this structure:

```text
BlackboardPage
  PageChrome
  ReadingSurface
    DocumentScroller
      DocumentView
        DocumentUnitRenderer[]
    EdgeLayer
      BulletRail
      AgentAvatar
      SelectionAffordance
      InlineBulletPopover
    ReviewOverlay
    ProceedOverlay
  HistoryPreviewPage
  ClosedStatePage
```

The important contract is the role of each region, not the exact component names.

For the current MVP stage, the concrete desktop visual realization of this template is fixed in:

* `docs/04-design/Visual-Reference.md`

## 4. Template Regions

### 4.1 PageChrome

`PageChrome` is a weak control strip, not an application shell.

It may show:

* version context
* `Proceed`
* review mode label or switch
* history entry
* close action

It must not:

* become a navigation bar with secondary workflows
* compete with the manuscript for hierarchy
* force the page into app-shell framing

### 4.2 ReadingSurface

`ReadingSurface` is the stable page body and visual anchor for all non-terminal states.

It must provide:

* the reading frame
* the typography hierarchy
* the manuscript background and spacing rhythm
* the spatial continuity between `active`, `reviewing`, and `history_preview`

### 4.3 DocumentView

`DocumentView` is the content truth projection.

It must:

* render one ordered manuscript
* map every interactive region back to derived `DocumentUnit`s
* remain the primary visual object in `active`
* remain visibly present beneath `reviewing`

It must not:

* fragment into card-like sections
* become a compressed middle column between equal side structures

### 4.4 EdgeLayer

`EdgeLayer` is an attached affordance layer.

It may contain:

* bullet rail
* avatar
* selection affordances
* local note popovers

It must not become:

* a second content lane
* a persistent equal-weight panel

### 4.5 ReviewOverlay

`ReviewOverlay` is the review projection of the same manuscript.

It must:

* operate over the current document surface
* keep `Flow Review` and `PR Review` on the same underlying page
* preserve space memory between `active` and `reviewing`

It must not:

* create a separate candidate page
* create a parallel content tree
* replace the manuscript with a diff tool shell

### 4.6 HistoryPreviewPage

`HistoryPreviewPage` is a full-page read-only takeover.

It must:

* keep manuscript language
* clearly signal the user has left the current working context
* only allow return or restore actions

It must not:

* be implemented as drawer, modal, or side panel

### 4.7 ClosedStatePage

`ClosedStatePage` is a terminal page state.

It must:

* keep the same document language
* clearly signal collaboration has ended
* not present the page as if normal editing can resume

## 5. Semantic HTML Contract

The template must preserve semantic HTML alignment with `DocumentUnit.type`.

Minimum expectations:

* `title` -> `<h1>`
* `heading` -> `<h2>` or `<h3>`
* `paragraph` -> `<p>`
* `list_item` -> `<li>` inside list containers
* `blockquote` -> `<blockquote>`
* `table` -> `<table>`
* `code_block` -> `<pre><code>`

The exact React component tree may vary, but semantic drift away from these targets requires an explicit contract update first.

## 6. Fixed Anti-Drift Rules

The following are explicitly forbidden for MVP:

* a persistent left or right primary panel that compresses the manuscript
* a review layout that feels like a different application page
* a history implementation as modal or drawer
* a bullet rail that reads like a second document stream
* a component architecture that treats the manuscript as one widget among many peers

## 7. Required Fixtures and Visual Evidence

The implementation must keep fixture-backed visual evidence for at least:

* `active`
* `proceeding`
* `reviewing(flow)`
* `reviewing(pr)`
* `history_preview`
* `closed`

For each of those states, MVP evidence should exist in:

* desktop screenshots
* mobile screenshots
* runbook sign-off notes when manual judgment is required

## 8. Related Documents

This document is enforced together with:

* `docs/04-design/UI-Structure.md`
* `docs/04-design/Visual-Reference.md`
* `docs/02-models/Document-Presentation-Model.md`
* `docs/04-design/Acceptance-Matrix.md`
* `docs/04-design/Visual-QA-Checklist.md`
* `harness/rules/document-surface.md`
