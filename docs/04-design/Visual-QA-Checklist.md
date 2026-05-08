# MVP Visual QA Checklist

Use this checklist for every frontend milestone that touches the Blackboard reading surface.

Use it together with:

* `docs/04-design/Acceptance-Matrix.md`
* `docs/05-agent/MVP-Runbook.md`
* `docs/03-contracts/Document-Template-Contract.md`
* `docs/04-design/Visual-Reference.md`

Current rule:

* Desktop implementation review should treat `Visual-Reference.md` as the canonical page-state and interaction reference set for the current MVP stage.

## Desktop Reading Surface

- [ ] The primary reading frame stays within roughly `720-840px` and never reads like a compressed app column.
- [ ] Body copy measure stays close to `68-72ch` in the main manuscript sections.
- [ ] The page reads as one document surface first, with collaboration UI attached at the edge rather than split into equal columns.
- [ ] The background remains warm and paper-like, with any texture weak enough to avoid becoming a theme.
- [ ] The desktop page still aligns with the current `active` reference in `Visual-Reference.md`.

## Mobile Reading Surface

- [ ] The manuscript keeps natural side margins around `92vw` rather than stretching edge-to-edge.
- [ ] Typography remains readable without collapsing the title/body contrast.
- [ ] Edge notes or review cards fall below the document instead of permanently squeezing the reading frame.

## Typography and Font Loading

- [ ] `Fraunces` is used for display/title moments.
- [ ] `Source Serif 4` is used for long-form body copy.
- [ ] `IBM Plex Sans` is used for controls, labels, and review chrome.
- [ ] `JetBrains Mono` is used only for code or structured diff fragments.
- [ ] Font loading degrades gracefully: fallback fonts preserve layout and `html[data-fonts="ready"]` appears after the web fonts resolve.

## Review and History Atmosphere

- [ ] `active` feels like an editorial manuscript with minimal tool presence.
- [ ] `reviewing` increases contrast and precision without turning into a dashboard layout.
- [ ] `history_preview` feels like a quieter, read-only manuscript pass.
- [ ] No mode introduces a persistent panel that compresses the main document column.
- [ ] `flow review`, `pr review`, `history preview`, `proceeding`, and `closed` still align with their current canonical references in `Visual-Reference.md`.

## Motion and Interaction

- [ ] Motion is limited to opacity/translate-style transitions in the `180-240ms` range.
- [ ] Mode changes preserve the sense of staying on the same document rather than navigating to another page.
- [ ] Reduced-motion preferences remove the transitions cleanly.

## Evidence Capture

- [ ] Desktop screenshots were reviewed for every touched top-level state.
- [ ] Desktop screenshots were explicitly compared against the current canonical reference assets in `Visual-Reference.md`.
- [ ] Mobile screenshots were reviewed for every touched top-level state.
- [ ] The agent recorded the remaining distance from the relevant prototype images in plain language.
- [ ] The user manually reviewed that comparison and approved the touched state before the task was marked complete.
- [ ] Any snapshot update was justified as a contract-preserving change, not silent visual drift.
- [ ] The outcome was recorded in the active runbook or task review as `manual-pass`, `known-gap`, or `blocker`.
