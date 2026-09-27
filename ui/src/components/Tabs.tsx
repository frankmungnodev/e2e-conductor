import type React from "react"
import { useCallback, useEffect, useState } from "react"

export interface TabButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
  variant?: "editor" | "activity" | "pills"
  icon?: React.ReactNode
  badge?: React.ReactNode
}

export function TabButton({
  children,
  active = false,
  variant = "pills",
  icon,
  badge,
  disabled = false,
  className = "",
  ...props
}: TabButtonProps) {
  const variantStyles = {
    pills: active
      ? "bg-primary text-white shadow-xs [&_svg]:text-white"
      : "text-fg-muted hover:text-fg hover:bg-hover",
    activity: active
      ? "bg-sidebar text-fg-bright border-b-2 border-primary shadow-xs"
      : "text-fg-muted hover:text-fg hover:bg-hover",
    editor: active
      ? "bg-editor text-fg-bright border-t-2 border-t-primary"
      : "bg-sidebar/60 text-fg-muted hover:bg-hover hover:text-fg",
  }

  const basePadding = {
    pills: "px-2.5 py-1 text-xs gap-1.5",
    activity: "px-3 py-1.5 text-xs gap-2",
    editor: "px-3.5 py-2 text-xs gap-2 border-r border-border",
  }

  return (
    <button
      type="button"
      disabled={disabled}
      className={`inline-flex items-center font-medium rounded-xs transition-all cursor-pointer ${basePadding[variant]} ${variantStyles[variant]} ${
        disabled ? "opacity-40 cursor-not-allowed" : ""
      } ${className}`}
      {...props}
    >
      {icon && <span className="w-3.5 h-3.5 shrink-0">{icon}</span>}
      {children && <span>{children}</span>}
      {badge && <span className="ml-1 shrink-0">{badge}</span>}
    </button>
  )
}


/**
 * Hook to synchronize tab state with URL query parameters.
 * Preserves other parameters and updates URL history.
 */
export function useUrlTab<T extends string>(
  paramKey: string,
  defaultTab: T,
  validTabs?: readonly T[],
): [T, (tab: T) => void] {
  const getTabFromUrl = useCallback((): T => {
    try {
      const params = new URLSearchParams(window.location.search)
      const val = params.get(paramKey) as T | null
      if (val && (!validTabs || (validTabs as readonly string[]).includes(val))) {
        return val
      }
    } catch {
      // ignore
    }
    return defaultTab
  }, [paramKey, defaultTab, validTabs])

  const [currentTab, setCurrentTab] = useState<T>(getTabFromUrl)

  const setTab = useCallback(
    (newTab: T) => {
      setCurrentTab(newTab)
      try {
        const url = new URL(window.location.href)
        url.searchParams.set(paramKey, newTab)
        window.history.pushState({}, "", url.toString())
      } catch {
        // ignore
      }
    },
    [paramKey],
  )

  useEffect(() => {
    const handlePopState = () => {
      setCurrentTab(getTabFromUrl())
    }
    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [getTabFromUrl])

  return [currentTab, setTab]
}
