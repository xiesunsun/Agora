# Markdown Rendering Contract

## 1. Purpose

This document turns the existing Markdown and `DocumentUnit` design into an explicit implementation contract.

It protects the MVP from a common failure mode:

* Markdown starts as the intended truth source
* local rendering shortcuts get added
* editing and review behavior gradually stop depending on one stable derivation path

## 2. Stable Statement

For V1 Blackboard:

* Markdown is the only document truth
* `DocumentUnit[]` is a derived structure
* edits rewrite Markdown by source slice
* review changes are derived from document truth, not authored independently in the frontend

## 3. Rendering Pipeline Contract

The stable rendering pipeline is:

1. produce Markdown
2. validate against the Blackboard Markdown Profile
3. parse the Markdown
4. derive ordered `DocumentUnit[]`
5. render the fixed `document` template
6. project bullets, review changes, and state overlays over that derived structure

Any implementation that bypasses this pipeline must be treated as a contract change, not a local refactor.

## 4. Markdown Profile Contract

The rendering implementation must preserve the Blackboard Markdown Profile defined in `docs/02-models/Document-Presentation-Model.md`.

Stable rules:

* exactly one `#` title
* headings do not jump arbitrarily
* no raw HTML or MDX
* list nesting is capped
* code blocks use fenced syntax
* unsupported rich constructs do not silently become first-class MVP content

## 5. `DocumentUnit` Derivation Contract

The implementation must derive one ordered `DocumentUnit[]` projection from Markdown.

Stable rules:

* each unit has `unitId`, `type`, `markdown`, `order`, `sourceStart`, `sourceEnd`
* `sourceStart` and `sourceEnd` are half-open source slice offsets
* `unitId` is only stable inside one derivation context
* reparse may invalidate old `unitId`s and callers must treat `workingSetRevision` as authoritative

Supported V1 unit types:

* `title`
* `heading`
* `paragraph`
* `list_item`
* `table`
* `code_block`
* `blockquote`

## 6. Edit Commit Contract

When a user commits a document-unit edit:

1. the backend must replace the exact `[sourceStart, sourceEnd)` slice in Markdown
2. the whole Markdown string must be reparsed
3. a fresh `DocumentUnit[]` must be derived
4. the resulting unit type at that location may legitimately change

The frontend must not:

* patch local rendered HTML and treat that as truth
* assume old `unitId`s remain stable across reparses
* invent a parallel local unit tree

## 7. Review Derivation Contract

`Change` objects are derived outputs.

Stable rules:

* review derivation compares current Markdown truth and candidate Markdown truth
* change ranges must remain local to a single `DocumentUnit`
* the frontend does not define authoritative diff ranges
* `Flow Review` and `PR Review` consume the same derived review object

## 8. Corpus-Based Validation

The rendering contract should be validated through a stable corpus, not only through ad hoc examples.

The corpus should include at least:

* valid Markdown examples for every supported unit type
* invalid or disallowed examples for banned syntax
* edit-reparse examples where unit type changes
* review derivation examples where changes stay unit-local

The exact file layout can evolve, but the validation model should remain:

* profile tests
* derivation tests
* edit-reparse tests
* diff locality tests

## 9. Drift Signals

Treat the following as rendering-contract drift:

* a frontend component becomes the effective document truth
* unsupported Markdown syntax becomes silently accepted
* review changes start spanning multiple units without a contract update
* editing logic stops using source slice replacement
* visual fixtures no longer match the derived semantic structure

## 10. Related Documents

This contract is enforced together with:

* `docs/02-models/Document-Presentation-Model.md`
* `docs/03-contracts/Frontend-Backend-Protocol.md`
* `docs/03-contracts/Document-Template-Contract.md`
* `docs/04-design/Acceptance-Matrix.md`
* `harness/rules/rendering-contract.md`
