import type React from "react"

export interface TabItem<T extends string = string> {
  id: T
  label: React.ReactNode
  icon?: React.ReactNode
  badge?: React.ReactNode
  disabled?: boolean
}

export interface TabsProps<T extends string = string> {
  tabs: TabItem<T>[]
  activeTab: T
  onChange: (tabId: T) => void
  variant?: "editor" | "activity" | "pills"
  className?: string
}

export function Tabs<T extends string = string>({
  tabs,
  activeTab,
  onChange,
  variant = "editor",
  className = "",
}: TabsProps<T>) {
  if (variant === "activity") {
    return (
      <div className={`flex items-center gap-1 bg-activity p-1 border-b border-border ${className}`}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              disabled={tab.disabled}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-xs transition-colors cursor-pointer ${
                isActive
                  ? "bg-sidebar text-fg-bright border-b-2 border-primary shadow-xs"
                  : "text-fg-muted hover:text-fg hover:bg-hover"
              } ${tab.disabled ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              {tab.icon && <span className="w-3.5 h-3.5 shrink-0">{tab.icon}</span>}
              <span>{tab.label}</span>
              {tab.badge && <span className="ml-1 shrink-0">{tab.badge}</span>}
            </button>
          )
        })}
      </div>
    )
  }

  if (variant === "pills") {
    return (
      <div className={`inline-flex items-center p-0.5 rounded-sm bg-activity border border-border ${className}`}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              disabled={tab.disabled}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-xs transition-all cursor-pointer ${
                isActive
                  ? "bg-primary text-white shadow-xs"
                  : "text-fg-muted hover:text-fg hover:bg-hover"
              } ${tab.disabled ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              {tab.icon && <span className="w-3.5 h-3.5 shrink-0">{tab.icon}</span>}
              <span>{tab.label}</span>
              {tab.badge && <span className="ml-1 shrink-0">{tab.badge}</span>}
            </button>
          )
        })}
      </div>
    )
  }

  // Default: VS Code Editor Tabs
  return (
    <div className={`flex items-stretch overflow-x-auto bg-sidebar border-b border-border select-none ${className}`}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            disabled={tab.disabled}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium border-r border-border transition-colors cursor-pointer relative ${
              isActive
                ? "bg-editor text-fg-bright border-t-2 border-t-primary"
                : "bg-sidebar/60 text-fg-muted hover:bg-hover hover:text-fg"
            } ${tab.disabled ? "opacity-40 cursor-not-allowed" : ""}`}
          >
            {tab.icon && <span className="w-3.5 h-3.5 shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.badge && <span className="ml-1 shrink-0">{tab.badge}</span>}
          </button>
        )
      })}
    </div>
  )
}
