# Design System & UI Architecture

This document defines the design tokens, component primitives, and UI conventions for `e2e-orchestrator`'s Web GUI. It serves as the primary design reference for AI agents and developers building and extending the interface.

The theme palette is inspired by the VS Code dark modern theme.

---

## 1. Design Tokens (`ui/src/index.css`)

All tokens are defined in Tailwind v4 `@theme` and produce direct utility classes (e.g. `bg-editor`, `text-fg-muted`, `border-border`, `focus:border-border-focus`).

### Surfaces & Canvas Hierarchy

| Token | Hex Value | Tailwind Class | Purpose |
|---|---|---|---|
| `--color-editor` | `#1e1e1e` | `bg-editor` | Main workspace canvas and background |
| `--color-sidebar` | `#252526` | `bg-sidebar` | Side panels, cards, inspection views |
| `--color-activity` | `#181818` | `bg-activity` | Global header, terminal canvas, bottom status bar |
| `--color-titlebar` | `#1f1f1f` | `bg-titlebar` | Section header strips and tab bars |
| `--color-input` | `#313131` | `bg-input` | Form inputs, select dropdown triggers, textareas |
| `--color-hover` | `#2a2d2e` | `bg-hover`, `hover:bg-hover` | Row, card, and interactive element hover state |
| `--color-active` | `#37373d` | `bg-active`, `active:bg-active` | Pressed and active selection states |
| `--color-selection` | `#264f78` | `bg-selection`, `selection:bg-selection` | Text selection and active row indicator |
| `--color-highlight` | `#04395e` | `bg-highlight` | Search results and highlight badges |

### Borders & Focus

| Token | Hex Value | Tailwind Class | Purpose |
|---|---|---|---|
| `--color-border` | `#2d2d2d` | `border-border`, `divide-border` | Primary structural borders |
| `--color-border-muted` | `#252526` | `border-border-muted` | Subtle inner dividers |
| `--color-border-light` | `#3c3c3c` | `border-border-light` | Interactive input borders, card outlines |
| `--color-border-focus` | `#007acc` | `border-border-focus`, `ring-border-focus` | Active focus ring outline |

### Primary Brand & Accents

| Token | Hex Value | Tailwind Class | Purpose |
|---|---|---|---|
| `--color-primary` | `#007acc` | `bg-primary`, `text-primary` | Primary action button and active tab indicator |
| `--color-primary-hover` | `#1177bb` | `hover:bg-primary-hover` | Primary button hover state |
| `--color-primary-active` | `#005999` | `active:bg-primary-active` | Primary button pressed state |
| `--color-primary-muted` | `rgba(0,122,204,0.15)` | `bg-primary-muted` | Soft primary badge and background highlight |

### Foregrounds & Typography

| Token | Hex Value | Tailwind Class | Purpose |
|---|---|---|---|
| `--color-fg` | `#cccccc` | `text-fg` | Default body and label text |
| `--color-fg-bright` | `#ffffff` | `text-fg-bright` | Emphasized headings and active labels |
| `--color-fg-muted` | `#858585` | `text-fg-muted` | Secondary hints, timestamps, descriptions |
| `--color-fg-subtle` | `#6e7681` | `text-fg-subtle` | Disabled text, empty placeholders |

> [!NOTE]
> **Accessible Font Size Floor**: The absolute minimum font size anywhere in the GUI is **12px (`text-xs`)**. Sub-12px classes (such as `text-[9px]`, `text-[10px]`, `text-[11px]`) violate WCAG accessibility standards and are strictly prohibited. Secondary text must use at least `text-xs` (12px) with compliant contrast (`text-fg-muted` or `text-fg`).

### Semantic Status Colors

| State | Foreground | Background | Border |
|---|---|---|---|
| **Success** | `text-success` (`#4ec9b0`) | `bg-success-bg` (`#142a22`) | `border-success-border` (`#1f503e`) |
| **Warning** | `text-warning` (`#dcdcaa`) | `bg-warning-bg` (`#302611`) | `border-warning-border` (`#59471d`) |
| **Error** | `text-error` (`#f14c4c`) | `bg-error-bg` (`#321618`) | `border-error-border` (`#632226`) |
| **Info** | `text-info` (`#75beff`) | `bg-info-bg` (`#162a3f`) | `border-info-border` (`#244970`) |

### Syntax & Driver Badges

- **HTTP / API (`driver-http`)**: `--color-token-var` (`#9cdcfe`)
- **Web / Browser (`driver-web`)**: `--color-token-type` (`#4ec9b0`)
- **Mobile / Android (`driver-mobile`)**: `--color-token-comment` (`#89d185`)
- **Shell / CLI (`driver-shell`)**: `--color-token-fn` (`#dcdcaa`)

---

## 2. Component Primitives (`ui/src/components`)

All reusable UI primitives are located directly in `ui/src/components/`.

### `<Button>`
Universal button component supporting multiple variants, sizes, and loading states.
- **Location**: `ui/src/components/Button.tsx`
- **Variants**: `primary` | `secondary` | `danger` | `ghost` | `outline`
- **Sizes**: `xs` (24px) | `sm` (28px) | `md` (32px) | `lg` (36px)
- **Props**: `isLoading?: boolean`, `icon?: ReactNode`, `iconRight?: ReactNode`, `disabled?: boolean`

```tsx
import { Button } from "./Button.tsx"

<Button variant="primary" size="sm" onClick={handleSave}>Save</Button>
<Button variant="ghost" size="xs" icon={<Play className="w-3.5 h-3.5" />}>Run</Button>
```

### `<Badge>`
Compact status and driver metadata indicator with optional pulsing dot.
- **Location**: `ui/src/components/Badge.tsx`
- **Variants**: `primary` | `success` | `danger` | `warning` | `info` | `neutral` | `driver-http` | `driver-web` | `driver-mobile` | `driver-shell`
- **Sizes**: `xs` | `sm` | `md`
- **Props**: `dot?: boolean`, `pulse?: boolean`, `icon?: ReactNode`

```tsx
import { Badge } from "./Badge.tsx"

<Badge variant="success" dot>passed</Badge>
<Badge variant="driver-web">web</Badge>
```

### `<Select>`
Custom dark popover dropdown with full keyboard navigation (Up/Down/Enter/Escape), checkmark indicators, option icons, and mono font support.
- **Location**: `ui/src/components/Select.tsx`
- **Props**: `options: SelectOption[]`, `value: string`, `onChange: (val: string) => void`, `size?: "xs" | "sm" | "md"`, `mono?: boolean`

```tsx
import { Select } from "./Select.tsx"

<Select
  value={driver}
  onChange={setDriver}
  options={[
    { value: "http", label: "HTTP API" },
    { value: "web", label: "Web (Playwright)" },
  ]}
  size="sm"
/>
```

### `<NumberInput>`
Numeric stepper input with min/max clamping, custom step intervals, keyboard arrow incrementing, and optional prefix/suffix labels.
- **Location**: `ui/src/components/NumberInput.tsx`
- **Controls**: `stepper` (stacked up/down chevrons) | `buttons` (inline minus and plus) | `none`
- **Props**: `value: number`, `onChange: (val: number) => void`, `min?: number`, `max?: number`, `step?: number`, `suffix?: string`, `prefix?: string`

```tsx
import { NumberInput } from "./NumberInput.tsx"

<NumberInput
  value={timeoutMs}
  onChange={setTimeoutMs}
  min={100}
  max={60000}
  step={500}
  suffix="ms"
  controls="stepper"
/>
```

### `<Checkbox>`
Custom dark square checkbox with indeterminate support, accessible hidden native input, and optional label/description layout.
- **Location**: `ui/src/components/Checkbox.tsx`
- **Props**: `checked: boolean | "indeterminate"`, `onCheckedChange: (checked: boolean) => void`, `label?: ReactNode`, `description?: ReactNode`

```tsx
import { Checkbox } from "./Checkbox.tsx"

<Checkbox
  checked={parallel}
  onCheckedChange={setParallel}
  label="Run in parallel"
  description="Execute independent suites concurrently"
/>
```

### `<Panel>`, `<PanelHeader>`, `<PanelBody>`, `<PanelFooter>`
Structural container for cards, views, and inspector panes.
- **Location**: `ui/src/components/Panel.tsx`
- **Variants**: `default` (`bg-sidebar`), `editor` (`bg-editor`), `activity` (`bg-activity`)

```tsx
import { Panel, PanelHeader, PanelBody } from "./Panel.tsx"

<Panel variant="default">
  <PanelHeader title="Artifacts Inspector" actions={<Button size="xs">Export</Button>} />
  <PanelBody noPadding>...</PanelBody>
</Panel>
```

### `<Modal>`
Accessible dialog overlay with blurred backdrop, click-outside dismissal, Escape key handler, and customizable max width. Modals and dialogs are preferred for forms, creation workflows, and editing tasks across the app (suited for a desktop-style application rather than a web page).
- **Location**: `ui/src/components/Modal.tsx`
- **Props**: `isOpen: boolean`, `onClose: () => void`, `title?: string`, `maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl"`
- **Form Input Column Limit**: The maximum number of columns for form inputs inside a modal MUST be 2 (NEVER 3 or more text inputs horizontally side-by-side; 3 horizontal text inputs look cramped and degrade usability).

```tsx
import { Modal } from "./Modal.tsx"

<Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Add Assertion">
  <div>Content</div>
</Modal>
```

### `<Tabs>` & `<TabButton>`
Navigation tab strip and segmented pill tab buttons.
- **Location**: `ui/src/components/Tabs.tsx`
- **Variants**: `pills` (segmented pill tabs for sub-resource navigation) | `editor` | `activity`
- **Hook**: `useUrlTab(paramKey, defaultTab, validTabs)` - synchronizes tab state with URL query parameters (e.g. `?tab=...`).
- **Rule**: All tabs MUST be combined and synchronized with URL query parameters (e.g. `?tab=...`).
- **Icon Color Compatibility**: If a tab uses an icon, ensure the icon color is compatible with the tab's selected/active state. For `variant="pills"` tabs, the active state uses `bg-primary text-white`. Never hardcode `text-primary` or colors matching the active background without handling the active state (e.g. use conditional classes like `active ? "text-white" : "text-primary"` or omit explicit text color classes so the icon inherits `currentColor`/`text-white` when selected).

### `<Toast>` & `useToast`
Global toast notifications context and hook.
- **Location**: `ui/src/components/Toast.tsx`
- **Methods**: `toast.success(msg)`, `toast.error(msg)`, `toast.info(msg)`, `toast.warning(msg)`

### `<CodeBlock>`
Syntax-highlighted log/code viewer with line numbers and copy-to-clipboard functionality.
- **Location**: `ui/src/components/CodeBlock.tsx`

### `<EmptyState>`
Fallback view for empty scenarios, zero run results, or missing artifacts.
- **Location**: `ui/src/components/EmptyState.tsx`

### `<Input>`
Text input controls with unified focus rings and validation error indicators.
- **Location**: `ui/src/components/FormControls.tsx`

### `<Textarea>`
Multiline text inputs with unified focus rings, monospace code support, and validation error indicators.
- **Location**: `ui/src/components/FormControls.tsx`

---

## 3. Rules & Guidelines for AI Coding Agents

1. **Use Existing Primitives**: Always reuse components from `ui/src/components/` (`Button`, `Badge`, `Select`, `NumberInput`, `Checkbox`, `Panel`, `Modal`, `EmptyState`, `TabButton`) instead of writing raw HTML elements or bespoke controls.
2. **`Tabs` & `TabButton`**: Segmented pill tabs (`variant="pills"`) for sub-resource navigation. All tabs MUST be combined and synchronized with URL query parameters (e.g. `?tab=...`). If a tab uses an icon, ensure the icon color is compatible with the tab's selected/active state. For `variant="pills"` tabs, the active state uses `bg-primary text-white`. Never hardcode `text-primary` or colors matching the active background without handling the active state (e.g. use conditional classes like `active ? "text-white" : "text-primary"` or omit explicit text color classes so the icon inherits `currentColor`/`text-white` when selected). An icon must never become invisible or blend into the active tab background.
3. **Capitalized Badges**: Every badge text MUST be capitalized using Title Case (capitalize the first character of each word, e.g. `Passed`, `Failed`, `Running`, `Idle`, not all-caps) across all screens and components.
4. **Use Design Tokens**: Use the theme tokens (`bg-editor`, `bg-sidebar`, `bg-input`, `border-border`, `border-border-focus`, `text-fg`, `text-fg-muted`, `text-primary`, etc.). Never introduce arbitrary hardcoded hex color codes in component styles.
5. **High Density**: The orchestrator GUI is a developer tool. Favor compact spacing (`gap-1.5`, `py-1`, `text-xs`), clear visual boundaries (`border border-border`), and monospace fonts for IDs, file paths, durations, and code identifiers.
6. **Accessible Minimum Font Size (12px / `text-xs`)**: In accordance with WCAG and accessibility standards, the absolute minimum font size anywhere in the UI is **12px (`text-xs`)**. NEVER use arbitrary sub-12px classes (such as `text-[9px]`, `text-[10px]`, or `text-[11px]`) for labels, helper text, captions, or descriptions. Secondary/meta text must be at least `text-xs` (12px) with compliant contrast (`text-fg-muted` or `text-fg`).
7. **Vertical Hierarchy (Titles & Descriptions in Column)**: Whenever a section, card, form control, or header includes both a title/label and a description/hint, they **MUST be stacked vertically in a column** (e.g. `flex flex-col gap-0.5` or `flex flex-col gap-1`), **NEVER placed side-by-side in a horizontal row** (`flex-row` / `justify-between`). Supporting descriptions belong directly underneath their respective titles. Any associated action buttons should be aligned to the right of the container while keeping the title and description vertically grouped together on the left.
8. **Clean, Human-Centric Copy (No Internal Jargon)**: NEVER expose internal runtime implementation details, scoping namespaces, or compiler prefixes (such as `ctx.`, `scope.`, `raw.`, `vars.`, or `json_match`) in user-facing UI labels, descriptions, subtitles, or placeholders (e.g. NEVER write "Reference in steps as ${ctx.varName}" or "Bearer ${ctx.token}"). Always use plain, natural, user-centric terminology (e.g. "Scenario Variables", "Default values and variables used throughout this scenario").
9. **Imports**: Import components directly from their file in `ui/src/components/` (e.g. `import { Button } from "./Button.tsx"`).
10. **Quality & Linting**: Always run `pnpm run lint` and verify there are no Biome diagnostics after any UI modification.
11. **Forms & Modals**: Modals and dialogs are preferred for forms, creation workflows, and editing tasks in this application (suited for a desktop-style application rather than a web page). The maximum number of columns for form inputs inside a modal MUST be 2 (NEVER 3 or more text inputs horizontally side-by-side; 3 horizontal text inputs look cramped and degrade usability).
