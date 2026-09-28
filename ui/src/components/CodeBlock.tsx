import { Check, Copy } from "lucide-react"
import { useState } from "react"

export interface CodeBlockProps {
  code: string
  language?: string
  showLineNumbers?: boolean
  maxHeight?: string
  className?: string
  header?: React.ReactNode
}

export function CodeBlock({
  code,
  language = "json",
  showLineNumbers = true,
  maxHeight = "360px",
  className = "",
  header,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  const lines = code.split("\n")

  return (
    <div
      className={`rounded-sm border border-border bg-editor overflow-hidden flex flex-col font-mono text-xs ${className}`}
    >
      <div className="flex items-center justify-between px-3 py-1.5 bg-titlebar/80 border-b border-border text-fg-muted">
        <div className="flex items-center gap-2 text-xs">
          {header || <span className="uppercase tracking-wider">{language}</span>}
        </div>
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs text-xs hover:text-fg-bright hover:bg-hover transition-colors cursor-pointer text-fg-muted"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-success" />
              <span className="text-success">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      <div
        className="overflow-x-auto overflow-y-auto p-3 leading-relaxed text-fg selection:bg-selection selection:text-white"
        style={{ maxHeight }}
      >
        <pre className="flex">
          {showLineNumbers && (
            <div className="select-none text-right pr-4 text-fg-muted/60 opacity-60 shrink-0 font-mono">
              {lines.map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
          )}
          <code className="flex-1 whitespace-pre">{code}</code>
        </pre>
      </div>
    </div>
  )
}
