import { Code, Globe, Smartphone, Terminal } from "lucide-react"
import type { ReactNode } from "react"
import type { BadgeVariant } from "../../components/Badge.tsx"

export const WEB_ACTION_OPTIONS = [
  // Navigation & Page Lifecycle
  { value: "navigate", label: "Navigate to URL" },
  { value: "reload", label: "Reload Page" },
  { value: "go_back", label: "Go Back (History)" },
  { value: "go_forward", label: "Go Forward (History)" },
  // Mouse & Element Interaction
  { value: "click", label: "Click Element" },
  { value: "dblclick", label: "Double Click Element" },
  { value: "hover", label: "Hover over Element" },
  { value: "focus", label: "Focus Element" },
  { value: "clear", label: "Clear Input / Textarea" },
  { value: "drag_and_drop", label: "Drag and Drop" },
  { value: "scroll_into_view", label: "Scroll into View" },
  // Keyboard & Forms
  { value: "fill", label: "Fill Text (Replace)" },
  { value: "type", label: "Type Text (Keystrokes)" },
  { value: "press", label: "Press Key (e.g. Enter)" },
  { value: "check", label: "Check Checkbox / Radio" },
  { value: "uncheck", label: "Uncheck Checkbox" },
  { value: "select", label: "Select Dropdown Option" },
  { value: "upload_file", label: "Upload File" },
  // Waiting & Synchronization
  { value: "wait_for", label: "Wait for Element or Timeout" },
  { value: "wait_for_url", label: "Wait for URL" },
  { value: "wait_for_load_state", label: "Wait for Load State" },
  // Assertions
  { value: "assert_visible", label: "Assert Element Visible" },
  { value: "assert_not_visible", label: "Assert Element Not Visible" },
  { value: "assert_text", label: "Assert Element Contains Text" },
  { value: "assert_not_text", label: "Assert Element Does Not Contain Text" },
  { value: "assert_value", label: "Assert Input Value" },
  { value: "assert_checked", label: "Assert Checkbox Checked" },
  { value: "assert_not_checked", label: "Assert Checkbox Unchecked" },
  { value: "assert_disabled", label: "Assert Element Disabled" },
  { value: "assert_enabled", label: "Assert Element Enabled" },
  { value: "assert_url", label: "Assert URL Contains" },
  { value: "assert_title", label: "Assert Page Title Contains" },
  // Viewport & Utilities
  { value: "set_viewport", label: "Set Viewport Size" },
  { value: "screenshot", label: "Capture Screenshot" },
  { value: "eval", label: "Evaluate JavaScript" },
]

export const MOBILE_ACTION_OPTIONS = [
  { value: "tap", label: "Tap Element / Text" },
  { value: "type", label: "Type Text" },
  { value: "press", label: "Press Hardware Key" },
  { value: "assert_visible", label: "Assert Element Visible" },
  { value: "assert_not_visible", label: "Assert Not Visible" },
  { value: "swipe", label: "Swipe Screen" },
  { value: "wait", label: "Wait for Element or Timeout" },
  { value: "back", label: "Press Back Button" },
  { value: "hidekeyboard", label: "Hide Keyboard" },
  { value: "launch", label: "Launch Application" },
  { value: "stop", label: "Stop Application" },
]

export const HTTP_ACTION_OPTIONS = [
  { value: "http_get", label: "HTTP GET Request" },
  { value: "http_post", label: "HTTP POST Request" },
  { value: "http_put", label: "HTTP PUT Request" },
  { value: "http_patch", label: "HTTP PATCH Request" },
  { value: "http_delete", label: "HTTP DELETE Request" },
]

export const SHELL_ACTION_OPTIONS = [
  { value: "shell", label: "Run Shell Command" },
]

export const DRIVER_OPTIONS: Array<{
  id: "web" | "mobile" | "http" | "shell"
  title: string
  subtitle: string
  badgeVariant: BadgeVariant
  badgeLabel: string
  icon: ReactNode
  iconBg: string
}> = [
  {
    id: "web",
    title: "Web Browser",
    subtitle: "Automate browser interactions with Playwright (navigate, click, fill, assert)",
    badgeVariant: "driver-web",
    badgeLabel: "Web",
    icon: <Globe className="w-4 h-4 text-token-type" />,
    iconBg: "bg-success-bg/30 border-success-border/50",
  },
  {
    id: "http",
    title: "HTTP / REST API",
    subtitle: "Execute API requests (GET, POST, PUT, DELETE) and validate status & response body",
    badgeVariant: "driver-http",
    badgeLabel: "API",
    icon: <Code className="w-4 h-4 text-token-var" />,
    iconBg: "bg-info-bg/30 border-info-border/50",
  },
  {
    id: "shell",
    title: "Shell Command",
    subtitle: "Run terminal commands and shell scripts, verifying output and exit codes",
    badgeVariant: "driver-shell",
    badgeLabel: "Shell",
    icon: <Terminal className="w-4 h-4 text-token-fn" />,
    iconBg: "bg-warning-bg/30 border-warning-border/50",
  },
  {
    id: "mobile",
    title: "Mobile App",
    subtitle: "Automate Android or iOS mobile applications with Appium touch events",
    badgeVariant: "driver-mobile",
    badgeLabel: "Mobile",
    icon: <Smartphone className="w-4 h-4 text-token-comment" />,
    iconBg: "bg-selection/20 border-selection/40",
  },
]
