# Azure DevOps PAT Creation Page Analysis

## 1) All Visible Text (Verbatim)

**Header:**
- "Create a new personal access token"
- "×" (close button, top right)

**Top fields:**
- "Name *" (label)
- (empty text input)
- "Organization" (label)
- "andares" (dropdown selection)
- "Expiration (UTC)" (label)
- "30 days" (dropdown value)
- "2026/9/10" (date input value, with calendar icon)

**Scopes heading:**
- "Scopes"
- "Authorize the scope of access associated with this token"
- "Scopes" (radio label, left of options)
- "Full access" (radio option, unselected)
- "Custom defined" (radio option, selected/blue dot)

**Work Items section:**
- "Work Items"
- "Work items, queries, backlogs, plans, and metadata"
- "Read"
- "Read & write"
- "Read, write, & manage"

**Code section:**
- "Code"
- "Source code, repositories, pull requests, and notifications"
- "Read"
- "Read & write"
- "Read, write, & manage"
- "Full"
- "Status"

**Build section:**
- "Build"
- "Artifacts, definitions, requests, queue a build, and update build properties"
- "Read"
- "Read & execute"

**Release section:**
- "Release"
- "Read, update, and delete releases, release pipelines, and stages"
- "Read"
- "Read, write, & execute"
- "Read, write, execute, & manage"

**Test Management section:**
- "Test Management"
- "Read, create, and update test plans, cases, and results"
- "Read"
- "Read & write"

**Footer:**
- "Show all scopes (30 more)" (link)
- "Create" (button — disabled/greyed)
- "Cancel" (button)

---

## 2) Organization Field

- **Set to:** `andares` (a specific organization name)
- It is a **closed dropdown** — only the current value is visible. The "All accessible organizations" option (common in older Azure DevOps PAT UIs) is **not visible** because the dropdown is not expanded; we cannot confirm whether it exists as a selectable option without opening it. The visible selection is just the org name `andares`.

---

## 3) Scope Sections Visible

| Section | Description | Exact option names (checkboxes) |
|---|---|---|
| **Scopes** (radio) | "Authorize the scope of access associated with this token" | `Full access` / `Custom defined` (Custom defined is selected) |
| **Work Items** | "Work items, queries, backlogs, plans, and metadata" | `Read`, `Read & write`, `Read, write, & manage` |
| **Code** | "Source code, repositories, pull requests, and notifications" | `Read`, `Read & write`, `Read, write, & manage`, `Full`, `Status` |
| **Build** | "Artifacts, definitions, requests, queue a build, and update build properties" | `Read`, `Read & execute` |
| **Release** | "Read, update, and delete releases, release pipelines, and stages" | `Read`, `Read, write, & execute`, `Read, write, execute, & manage` |
| **Test Management** | "Read, create, and update test plans, cases, and results" | `Read`, `Read & write` |

Plus a link **"Show all scopes (30 more)"** indicating 5 additional scope sections (e.g., Marketplace, Extensions, Service Connections, Notifications, Security, Graph, Identity, Member Entitlement Management, etc.) are collapsed/hidden below.

Note: there is no dedicated **Marketplace** scope section visible in the shown viewport — it is among the "(30 more)" hidden sections.

---

## 4) Expiration / Validity Field

- Label: **"Expiration (UTC)"**
- Two controls side by side:
  - **Dropdown** (left) — currently showing **`30 days`** (other options like `7 days`, `90 days`, `1 year`, and likely `Custom defined` exist but are hidden inside the closed dropdown)
  - **Date picker** (right) — currently showing **`2026/9/10`** (auto-calculated based on the 30-day choice from today). Has a calendar icon.

---

## 5) Warning Banners / Informational Text

- **No warning banners** are visible (no yellow/red alert boxes).
- **Informational text present:**
  - "Authorize the scope of access associated with this token" (under "Scopes")
  - One-line description under each scope section (e.g., "Work items, queries, backlogs, plans, and metadata")
  - "Show all scopes (30 more)" — reveals that 30 additional scope-checkboxes exist below the visible scope sections.

---

## 6) Bottom Buttons

- **"Create"** — rendered in a **disabled/greyed-out state** (likely because `Name` is empty)
- **"Cancel"** — active, white background

---

## Residual Risks / Caveats

- The Organization and Expiration **dropdowns are closed**, so we cannot list every selectable option verbatim — only the currently selected value is visible.
- The "Show all scopes (30 more)" section is collapsed; the exact names of the remaining 5 scope sections (and their 30 individual checkboxes) are not visible.
- The dialog is a modal (note the "×" close button), so we cannot see what is behind it or whether other browser-level warnings exist.