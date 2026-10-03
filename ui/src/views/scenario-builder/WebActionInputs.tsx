import { Input, Textarea } from "../../components/FormControls.tsx"
import { NumberInput } from "../../components/NumberInput.tsx"
import { Select } from "../../components/Select.tsx"
import type { StepDriver } from "../../targetDriver.ts"
import type { StepAction } from "../../types.ts"

export interface ActionInputsProps {
  act: StepAction
  actType: string
  stepDriver: StepDriver
  onUpdate: (updates: Partial<StepAction>) => void
}

/** Inputs for browser actions, plus the wait action shared with mobile steps. */
export function WebActionInputs({ act, actType, stepDriver, onUpdate }: ActionInputsProps) {
  return (
    <>
      {/* Web: Navigate */}
      {(actType === "navigate" || actType === "goto") && (
        <Input
          size="xs"
          label="URL / Path"
          value={act.url ?? (typeof act.value === "string" ? act.value : "")}
          onChange={(e) =>
            onUpdate({
              url: e.target.value,
              value: e.target.value,
            })
          }
          placeholder="e.g. /login, /checkout, or https://example.com"
          mono
        />
      )}

      {/* Web: Reload Page */}
      {stepDriver === "web" && actType === "reload" && (
        <div className="flex flex-col gap-1 p-2 rounded-xs border border-border/40 bg-input/20">
          <span className="text-xs font-medium text-fg">Reload Active Page</span>
          <span className="text-xs text-fg-muted">Reloads the current browser page and waits for it to refresh.</span>
        </div>
      )}

      {/* Web: Go Back */}
      {stepDriver === "web" && actType === "go_back" && (
        <div className="flex flex-col gap-1 p-2 rounded-xs border border-border/40 bg-input/20">
          <span className="text-xs font-medium text-fg">Navigate Back in History</span>
          <span className="text-xs text-fg-muted">Navigates the browser back one step in session history.</span>
        </div>
      )}

      {/* Web: Go Forward */}
      {stepDriver === "web" && actType === "go_forward" && (
        <div className="flex flex-col gap-1 p-2 rounded-xs border border-border/40 bg-input/20">
          <span className="text-xs font-medium text-fg">Navigate Forward in History</span>
          <span className="text-xs text-fg-muted">Navigates the browser forward one step in session history.</span>
        </div>
      )}

      {/* Web: Single Element Selector Actions */}
      {stepDriver === "web" &&
        [
          "click",
          "dblclick",
          "hover",
          "focus",
          "clear",
          "scroll_into_view",
          "check",
          "uncheck",
          "assert_visible",
          "assert_not_visible",
          "assert_hidden",
          "assert_checked",
          "assert_not_checked",
          "assert_disabled",
          "assert_enabled",
        ].includes(actType) && (
          <Input
            size="xs"
            label={
              actType === "click"
                ? "Element Selector"
                : actType === "dblclick"
                  ? "Element Selector to Double Click"
                  : actType === "hover"
                    ? "Element Selector to Hover"
                    : actType === "focus"
                      ? "Element Selector to Focus"
                      : actType === "clear"
                        ? "Input / Textarea Selector to Clear"
                        : actType === "scroll_into_view"
                          ? "Element Selector to Scroll into View"
                          : actType === "check"
                            ? "Checkbox / Radio Selector to Check"
                            : actType === "uncheck"
                              ? "Checkbox Selector to Uncheck"
                              : actType === "assert_visible"
                                ? "Element Selector to Assert Visible"
                                : actType === "assert_not_visible" || actType === "assert_hidden"
                                  ? "Element Selector to Assert Hidden / Not Visible"
                                  : actType === "assert_checked"
                                    ? "Checkbox Selector to Assert Checked"
                                    : actType === "assert_not_checked"
                                      ? "Checkbox Selector to Assert Unchecked"
                                      : actType === "assert_disabled"
                                        ? "Element Selector to Assert Disabled"
                                        : "Element Selector to Assert Enabled"
            }
            value={act.selector ?? ""}
            onChange={(e) => onUpdate({ selector: e.target.value })}
            placeholder={
              actType.includes("check")
                ? "e.g. input[type='checkbox']#agree, #remember-me"
                : actType === "clear"
                  ? "e.g. input#username, textarea#comment"
                  : "e.g. button[type='submit'], #login-btn, .nav-item"
            }
            mono
          />
        )}

      {/* Web: Fill / Type */}
      {stepDriver === "web" && (actType === "fill" || actType === "type") && (
        <div className="grid grid-cols-2 gap-2">
          <Input
            size="xs"
            label="Element Selector"
            value={act.selector ?? ""}
            onChange={(e) => onUpdate({ selector: e.target.value })}
            placeholder="e.g. #email, input[name='username']"
            mono
          />
          <Input
            size="xs"
            label={actType === "fill" ? "Input Value (Replace)" : "Text to Type (Keystrokes)"}
            value={act.value ?? ""}
            onChange={(e) => onUpdate({ value: e.target.value })}
            placeholder="e.g. admin@example.com"
            mono
          />
        </div>
      )}

      {/* Web: Drag and Drop */}
      {stepDriver === "web" && actType === "drag_and_drop" && (
        <div className="grid grid-cols-2 gap-2">
          <Input
            size="xs"
            label="Source Element Selector"
            value={act.selector ?? ""}
            onChange={(e) => onUpdate({ selector: e.target.value })}
            placeholder="e.g. #draggable-item, .card"
            mono
          />
          <Input
            size="xs"
            label="Target Drop Selector"
            value={act.target_selector ?? (typeof act.value === "string" ? act.value : "")}
            onChange={(e) =>
              onUpdate({
                target_selector: e.target.value,
                value: e.target.value,
              })
            }
            placeholder="e.g. #dropzone, .target-column"
            mono
          />
        </div>
      )}

      {/* Web: Upload File */}
      {stepDriver === "web" && (actType === "upload_file" || actType === "set_input_files") && (
        <div className="grid grid-cols-2 gap-2">
          <Input
            size="xs"
            label="File Input Selector"
            value={act.selector ?? ""}
            onChange={(e) => onUpdate({ selector: e.target.value })}
            placeholder="e.g. input[type='file'], #avatar-upload"
            mono
          />
          <Input
            size="xs"
            label="File Path on Disk"
            value={act.value ?? ""}
            onChange={(e) => onUpdate({ value: e.target.value })}
            placeholder="e.g. ./fixtures/sample.pdf"
            mono
          />
        </div>
      )}

      {/* Web: Press Key */}
      {stepDriver === "web" && actType === "press" && (
        <div className="grid grid-cols-2 gap-2">
          <Input
            size="xs"
            label="Key to Press"
            value={act.key ?? (typeof act.value === "string" ? act.value : "Enter")}
            onChange={(e) => onUpdate({ key: e.target.value })}
            placeholder="e.g. Enter, Tab, Escape, ArrowDown"
            mono
          />
          <Input
            size="xs"
            label="Selector (Optional)"
            value={act.selector ?? ""}
            onChange={(e) => onUpdate({ selector: e.target.value })}
            placeholder="e.g. #search-input (default: page)"
            mono
          />
        </div>
      )}

      {/* Web: Assert Text & Assert Not Text */}
      {stepDriver === "web" && (actType === "assert_text" || actType === "assert_not_text") && (
        <div className="grid grid-cols-2 gap-2">
          <Input
            size="xs"
            label="Element Selector"
            value={act.selector ?? ""}
            onChange={(e) => onUpdate({ selector: e.target.value })}
            placeholder="e.g. .status-badge, #message"
            mono
          />
          <Input
            size="xs"
            label={actType === "assert_text" ? "Expected Text (Contains)" : "Forbidden Text (Must Not Contain)"}
            value={act.value ?? ""}
            onChange={(e) => onUpdate({ value: e.target.value })}
            placeholder="e.g. Order Placed Successfully"
            mono
          />
        </div>
      )}

      {/* Web: Assert Input Value */}
      {stepDriver === "web" && actType === "assert_value" && (
        <div className="grid grid-cols-2 gap-2">
          <Input
            size="xs"
            label="Input / Textarea Selector"
            value={act.selector ?? ""}
            onChange={(e) => onUpdate({ selector: e.target.value })}
            placeholder="e.g. input#username, select#country"
            mono
          />
          <Input
            size="xs"
            label="Expected Value"
            value={act.value ?? ""}
            onChange={(e) => onUpdate({ value: e.target.value })}
            placeholder="e.g. admin"
            mono
          />
        </div>
      )}

      {/* Web: Assert Page URL */}
      {stepDriver === "web" && actType === "assert_url" && (
        <Input
          size="xs"
          label="Expected URL Substring"
          value={act.url ?? (typeof act.value === "string" ? act.value : "")}
          onChange={(e) =>
            onUpdate({
              url: e.target.value,
              value: e.target.value,
            })
          }
          placeholder="e.g. /dashboard or https://example.com"
          mono
        />
      )}

      {/* Web: Assert Page Title */}
      {stepDriver === "web" && actType === "assert_title" && (
        <Input
          size="xs"
          label="Expected Page Title Substring"
          value={act.value ?? ""}
          onChange={(e) => onUpdate({ value: e.target.value })}
          placeholder="e.g. Dashboard - Acme App"
          mono
        />
      )}

      {/* Web: Select Dropdown */}
      {stepDriver === "web" && (actType === "select" || actType === "select_option") && (
        <div className="grid grid-cols-2 gap-2">
          <Input
            size="xs"
            label="Select Element Selector"
            value={act.selector ?? ""}
            onChange={(e) => onUpdate({ selector: e.target.value })}
            placeholder="e.g. select#country, select[name='role']"
            mono
          />
          <Input
            size="xs"
            label="Option Value / Label"
            value={act.value ?? ""}
            onChange={(e) => onUpdate({ value: e.target.value })}
            placeholder="e.g. US, admin"
            mono
          />
        </div>
      )}

      {/* Web & Mobile: Wait / Delay */}
      {["wait_for", "wait"].includes(actType) && (
        <div className="grid grid-cols-2 gap-2 items-start">
          <Input
            size="xs"
            label="Wait for Selector (Optional)"
            value={act.selector ?? ""}
            onChange={(e) => onUpdate({ selector: e.target.value })}
            placeholder="e.g. .spinner or #modal"
            mono
          />
          <NumberInput
            size="xs"
            label="Delay (ms)"
            value={act.ms ?? 1000}
            onChange={(val) => onUpdate({ ms: val })}
            min={100}
            step={500}
          />
        </div>
      )}

      {/* Web: Wait for URL */}
      {stepDriver === "web" && actType === "wait_for_url" && (
        <div className="grid grid-cols-2 gap-2 items-start">
          <Input
            size="xs"
            label="URL Pattern / Substring"
            value={act.url ?? (typeof act.value === "string" ? act.value : "")}
            onChange={(e) =>
              onUpdate({
                url: e.target.value,
                value: e.target.value,
              })
            }
            placeholder="e.g. **/dashboard, /orders/**"
            mono
          />
          <NumberInput
            size="xs"
            label="Timeout (ms)"
            value={act.timeout_ms ?? 15000}
            onChange={(val) => onUpdate({ timeout_ms: val })}
            min={500}
            step={1000}
          />
        </div>
      )}

      {/* Web: Wait for Load State */}
      {stepDriver === "web" && actType === "wait_for_load_state" && (
        <div className="grid grid-cols-2 gap-2 items-start">
          <Select
            size="xs"
            label="Load State Event"
            value={typeof act.value === "string" ? act.value : "load"}
            onChange={(val) => onUpdate({ value: val })}
            options={[
              { value: "load", label: "load (Full Page Loaded)" },
              { value: "domcontentloaded", label: "domcontentloaded (DOM Content Ready)" },
              { value: "networkidle", label: "networkidle (No Network Requests for 500ms)" },
            ]}
          />
          <NumberInput
            size="xs"
            label="Timeout (ms)"
            value={act.timeout_ms ?? 15000}
            onChange={(val) => onUpdate({ timeout_ms: val })}
            min={500}
            step={1000}
          />
        </div>
      )}

      {/* Web: Set Viewport Size */}
      {stepDriver === "web" && actType === "set_viewport" && (
        <div className="grid grid-cols-2 gap-2 items-start">
          <NumberInput
            size="xs"
            label="Viewport Width (px)"
            value={act.width ?? 1280}
            onChange={(val) => onUpdate({ width: val })}
            min={320}
            max={3840}
            step={40}
          />
          <NumberInput
            size="xs"
            label="Viewport Height (px)"
            value={act.height ?? 720}
            onChange={(val) => onUpdate({ height: val })}
            min={240}
            max={2160}
            step={40}
          />
        </div>
      )}

      {/* Web: Screenshot */}
      {actType === "screenshot" && (
        <Input
          size="xs"
          label="Screenshot File Path (Optional)"
          value={act.value ?? ""}
          onChange={(e) => onUpdate({ value: e.target.value })}
          placeholder="Leave blank for automatic run artifact capture"
          mono
        />
      )}

      {/* Web: JavaScript Expression */}
      {actType === "eval" && (
        <Textarea
          size="xs"
          label="JavaScript Expression"
          rows={2}
          value={act.value ?? ""}
          onChange={(e) => onUpdate({ value: e.target.value })}
          placeholder="e.g. document.title, window.scrollTo(0, 500)"
          mono
        />
      )}
    </>
  )
}
