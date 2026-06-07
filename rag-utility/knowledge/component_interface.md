# Component Interface (CI) Awareness — PeopleCode

## What a Component Interface Is and Why It Matters for Generated Code

A Component Interface (CI) exposes a PeopleSoft component to external programs (Application Engine, Integration Broker, CI-based batch, web services, Excel-to-CI) WITHOUT the GUI. The CI runtime replays component logic programmatically, but it does NOT behave identically to an interactive online session.

This matters because PeopleCode placed in a component can run in **two contexts**:
- **Online (interactive)** — a user navigates the pages in a browser. All events fire, modal prompts work.
- **Component Interface (CI / batch)** — code drives the component with no UI. Some events never fire, and any function that needs a user or a screen will fail or hang.

Unless the requirement explicitly says "online only", generated PeopleCode should be written to work safely in BOTH contexts.

## Events That Do NOT Fire Under a Component Interface

Logic that MUST run in CI mode should never depend on these events, because the CI runtime skips them:

| Event | Fires online? | Fires under CI? | Implication |
|---|---|---|---|
| SearchInit | Yes | No | CI sets keys directly; don't put required defaults only here |
| RowSelect | Yes | No | Never rely on RowSelect filtering for data integrity |
| FieldDefault | Yes | Partial/No | CI may bypass; set critical defaults in RowInit or explicitly |
| FieldFormula | Yes | No | Deprecated for logic; never place business logic here |
| Activate (page Activate) | Yes | No | No pages are activated in CI — page-level logic is skipped |
| PrePopup / ItemSelected | Yes | No | UI-only events, irrelevant in CI |
| FieldChange (no programmatic set) | Yes | Only when CI sets the property | Fires in CI ONLY when the CI program assigns that property |

Events that DO fire under CI (so they are safe places for validation/derivation that must run in batch): **RowInit, RowInsert, FieldEdit, FieldChange (on properties the CI sets), SaveEdit, SavePreChange, SavePostChange, Workflow**.

## Functions That Break or Hang Under a Component Interface

These require a user/screen and will raise an error or hang when invoked through a CI. Guard them with `%CompIntfcName` (or avoid them when the code may run in CI):

- `MessageBox()` with a style that prompts, `WinMessage()` (interactive styles) — blocks waiting for a user click.
- `DoModal()`, `DoModalComponent()`, `Transfer()`, `TransferPage()`, `TransferNode()` — navigation has no meaning in CI.
- `Prompt()`, `RevalidatePassword()` — require interactive input.
- `WinEscape()`, `DoCancel()` — UI flow control.
- `%Menu`, `%Page`, `%Panel` — may be blank/undefined in CI.

Note: `Error` and `Warning` ARE allowed in SaveEdit/FieldEdit under CI — the CI surfaces them as a property/exception (`&oCI.GetPropertyByName` errors collection) rather than a popup. So validation still works; only *interactive* prompts are the problem.

## The Guard Pattern: Detecting CI Context

Use the system variable `%CompIntfcName` — it returns the CI name when the component is running under a Component Interface, and a blank string when running online. Branch interactive-only logic on it:

```peoplecode
If %CompIntfcName = "" Then
   /* Online only — safe to show interactive UI */
   WinMessage("Saved successfully.", 0);
Else
   /* Running under a Component Interface — skip interactive prompts */
End-If;
```

Equivalent online-only guards you may see in delivered code: `If Not IsModal()` is about modal pages, NOT CI — do not confuse the two. `%CompIntfcName` is the correct CI test.

## Rules for Generating CI-Safe PeopleCode

1. **Default to dual-context**: Unless the requirement says "online only", assume the component may also be driven by a Component Interface.
2. **Put must-run logic in CI-firing events**: Validation that must hold in batch belongs in SaveEdit/FieldEdit/SavePreChange (which fire under CI), NOT in RowSelect, FieldFormula, SearchInit, or page Activate.
3. **Never gate data integrity on UI-only events**: If a validation only runs in Activate or SearchInit, a CI load can bypass it entirely.
4. **Guard interactive functions**: Wrap `WinMessage`/`MessageBox`/`Transfer`/`DoModal` in an `If %CompIntfcName = "" Then` block (or omit them) so CI execution does not hang.
5. **Don't assume FieldChange fires**: Under CI, FieldChange fires only for properties the CI program explicitly sets. Don't rely on a FieldChange cascade for fields the CI may not touch.
6. **Error/Warning are fine for validation**: Keep using `Error`/`Warning` in SaveEdit/FieldEdit — the CI captures them. Just don't add a `WinMessage` alongside without a guard.

## Quick Reference

- CI context test: `%CompIntfcName <> ""` means running under a Component Interface.
- Safe-in-CI events: RowInit, RowInsert, FieldEdit, FieldChange (CI-set props), SaveEdit, SavePreChange, SavePostChange.
- Skipped-in-CI events: SearchInit, RowSelect, FieldDefault (partial), FieldFormula, Activate, PrePopup, ItemSelected.
- Hang/break-in-CI functions: WinMessage, MessageBox (prompt styles), Transfer*, DoModal*, Prompt — guard with `%CompIntfcName`.
