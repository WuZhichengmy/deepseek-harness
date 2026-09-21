import { useEffect, useId, useMemo, useState } from 'react'
import clsx from 'clsx'
import { writeClipboard } from '../clipboard.ts'
import { CodeBlock } from './CodeBlock.tsx'
import css from './MermaidBlock.module.css'

/** Properties for {@link MermaidBlock}. */
export interface MermaidBlockProps {
  /** The mermaid diagram definition text. */
  code: string
  /** Localized copy-button idle label. */
  copyLabel: string
  /** Localized copy-button confirmation label. */
  copiedLabel: string
  /** Optional container class name. */
  className?: string
}

let activeTheme: 'dark' | 'light' | null = null

const LIGHT_THEME_VARIABLES: Record<string, string | number> = {
  fontFamily: 'var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
  fontSize: '13px',
  // Node card style
  primaryColor: '#ffffff',
  primaryTextColor: '#0f172a',
  primaryBorderColor: '#cbd5e1',
  lineColor: '#64748b',
  arrowheadColor: '#64748b',
  // Edge label styling
  edgeLabelBackground: '#f8fafc',
  // Secondary / Tertiary
  secondaryColor: '#f8fafc',
  secondaryTextColor: '#334155',
  secondaryBorderColor: '#e2e8f0',
  tertiaryColor: '#f1f5f9',
  tertiaryTextColor: '#475569',
  tertiaryBorderColor: '#e2e8f0',
  // Clusters / Subgraphs
  clusterBkg: '#f8fafc',
  clusterBorder: '#cbd5e1',
  // Overall text & backgrounds
  textColor: '#0f172a',
  mainBkg: '#ffffff',
  nodeBorder: '#cbd5e1',
  nodeTextColor: '#0f172a',
  titleColor: '#0f172a',
  altBackground: '#f8fafc',
  // Actors for sequence diagram
  actorBkg: '#ffffff',
  actorBorder: '#cbd5e1',
  actorTextColor: '#0f172a',
  actorLineColor: '#94a3b8',
  signalColor: '#64748b',
  signalTextColor: '#0f172a',
  labelBoxBkgColor: '#ffffff',
  labelBoxBorderColor: '#cbd5e1',
  labelTextColor: '#0f172a',
  // Flowchart specific
  radius: 10,
}

const DARK_THEME_VARIABLES: Record<string, string | number> = {
  fontFamily: 'var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
  fontSize: '13px',
  // Node card style
  primaryColor: '#1e293b',
  primaryTextColor: '#f8fafc',
  primaryBorderColor: '#475569',
  lineColor: '#94a3b8',
  arrowheadColor: '#94a3b8',
  // Edge label styling
  edgeLabelBackground: '#1e293b',
  // Secondary / Tertiary
  secondaryColor: '#0f172a',
  secondaryTextColor: '#cbd5e1',
  secondaryBorderColor: '#334155',
  tertiaryColor: '#1e293b',
  tertiaryTextColor: '#94a3b8',
  tertiaryBorderColor: '#334155',
  // Clusters / Subgraphs
  clusterBkg: '#0f172a',
  clusterBorder: '#475569',
  // Overall text & backgrounds
  textColor: '#f8fafc',
  mainBkg: '#1e293b',
  nodeBorder: '#475569',
  nodeTextColor: '#f8fafc',
  titleColor: '#f8fafc',
  altBackground: '#0f172a',
  // Actors for sequence diagram
  actorBkg: '#1e293b',
  actorBorder: '#475569',
  actorTextColor: '#f8fafc',
  actorLineColor: '#64748b',
  signalColor: '#94a3b8',
  signalTextColor: '#f8fafc',
  labelBoxBkgColor: '#1e293b',
  labelBoxBorderColor: '#475569',
  labelTextColor: '#f8fafc',
  // Flowchart specific
  radius: 10,
}

const LIGHT_THEME_CSS = `
  .node rect, .node circle, .node ellipse, .node polygon, .node path {
    stroke-width: 1.25px !important;
    rx: 8px !important;
    ry: 8px !important;
  }
  .node .label {
    font-weight: 500 !important;
    line-height: 1.45 !important;
  }
  .node .label code {
    font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace) !important;
    font-size: 11px !important;
    padding: 1px 5px !important;
    border-radius: 4px !important;
    background: rgba(99, 102, 241, 0.08) !important;
    color: #4f46e5 !important;
    font-weight: 600 !important;
  }
  .flowchart-link {
    stroke-width: 1.5px !important;
  }
  .marker {
    fill: #64748b !important;
    stroke: #64748b !important;
  }
  .edgeLabel {
    background-color: transparent !important;
  }
  .edgeLabel rect {
    opacity: 0.95 !important;
    rx: 5px !important;
    ry: 5px !important;
    stroke: #cbd5e1 !important;
    stroke-width: 1px !important;
  }
  .edgeLabel span, .edgeLabel p {
    font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace) !important;
    font-size: 11px !important;
    font-weight: 500 !important;
    color: #475569 !important;
    padding: 2px 6px !important;
  }
  .cluster rect {
    rx: 10px !important;
    ry: 10px !important;
    stroke-width: 1.25px !important;
    stroke-dasharray: 4 4 !important;
  }
`

const DARK_THEME_CSS = `
  .node rect, .node circle, .node ellipse, .node polygon, .node path {
    stroke-width: 1.25px !important;
    rx: 8px !important;
    ry: 8px !important;
  }
  .node .label {
    font-weight: 500 !important;
    line-height: 1.45 !important;
  }
  .node .label code {
    font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace) !important;
    font-size: 11px !important;
    padding: 1px 5px !important;
    border-radius: 4px !important;
    background: rgba(129, 140, 248, 0.18) !important;
    color: #a5b4fc !important;
    font-weight: 600 !important;
  }
  .flowchart-link {
    stroke-width: 1.5px !important;
  }
  .marker {
    fill: #94a3b8 !important;
    stroke: #94a3b8 !important;
  }
  .edgeLabel {
    background-color: transparent !important;
  }
  .edgeLabel rect {
    opacity: 0.95 !important;
    rx: 5px !important;
    ry: 5px !important;
    stroke: #475569 !important;
    stroke-width: 1px !important;
    fill: #1e293b !important;
  }
  .edgeLabel span, .edgeLabel p {
    font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace) !important;
    font-size: 11px !important;
    font-weight: 500 !important;
    color: #cbd5e1 !important;
    padding: 2px 6px !important;
  }
  .cluster rect {
    rx: 10px !important;
    ry: 10px !important;
    stroke-width: 1.25px !important;
    stroke-dasharray: 4 4 !important;
  }
`

/**
 * Render mermaid diagram source into an SVG string.
 * @param id - DOM id used for mermaid rendering container.
 * @param code - The mermaid flowchart or diagram definition.
 * @returns The rendered SVG string.
 */
async function renderMermaidSvg(id: string, code: string): Promise<string> {
  const { default: mermaid } = await import('mermaid')
  const isDark = typeof document !== 'undefined'
    && (document.documentElement.getAttribute('data-theme') === 'dark'
      || document.documentElement.classList.contains('dark')
      || (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches))
  const targetTheme = isDark ? 'dark' : 'light'

  if (activeTheme !== targetTheme) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      themeVariables: isDark ? DARK_THEME_VARIABLES : LIGHT_THEME_VARIABLES,
      themeCSS: isDark ? DARK_THEME_CSS : LIGHT_THEME_CSS,
      fontFamily: 'inherit',
      htmlLabels: true,
      flowchart: {
        curve: 'basis',
        padding: 16,
        nodeSpacing: 45,
        rankSpacing: 45,
      },
    })
    activeTheme = targetTheme
  }

  const cleanId = id.replace(/[^a-zA-Z0-9_-]/g, '_')
  const { svg } = await mermaid.render(cleanId, code.trim())
  return svg
}

/**
 * Interactive Mermaid code block component.
 * Renders an SVG diagram by default, with an interactive header toggle allowing
 * users to switch between the graphical diagram and raw source code.
 *
 * @param props - Component properties conforming to {@link MermaidBlockProps}.
 * @returns The rendered Mermaid block element.
 */
export function MermaidBlock({
  code,
  copyLabel,
  copiedLabel,
  className,
}: MermaidBlockProps) {
  const rawId = useId()
  const id = useMemo(
    () => `dsh_mermaid_${rawId.replace(/[^a-zA-Z0-9]/g, '_')}_${Math.random().toString(36).slice(2, 7)}`,
    [rawId],
  )

  const [viewMode, setViewMode] = useState<'diagram' | 'code'>('diagram')
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  const isZh = copyLabel.includes('复制')
  const diagramLabel = isZh ? '图表' : 'Diagram'
  const codeLabel = isZh ? '代码' : 'Code'

  const trimmed = code.trim()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    renderMermaidSvg(id, trimmed)
      .then((renderedSvg) => {
        if (!cancelled) {
          setSvg(renderedSvg)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err)
          setError(msg)
          setLoading(false)
          // Automatically switch to code view when syntax parsing fails
          setViewMode('code')
          if (typeof document !== 'undefined') {
            const dangling = document.getElementById(id) ?? document.getElementById(`d${id}`)
            dangling?.remove()
          }
        }
      })

    return () => {
      cancelled = true
    }
  }, [id, trimmed])

  const onCopy = () => {
    if (copied) return
    void writeClipboard(trimmed).then((ok) => {
      if (!ok) return
      setCopied(true)
      window.setTimeout(() => { setCopied(false) }, 1000)
    })
  }

  return (
    <div className={clsx(css.block, 'md-mermaid-block', className)} data-mermaid-block>
      <div className={css.bannerWrap}>
        <div className={css.banner} data-code-block-banner>
          <div className={css.leftControls}>
            <span className={css.infostring}>mermaid</span>
            <div className={css.toggleTabs} role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'diagram'}
                className={clsx(css.tabButton, viewMode === 'diagram' && css.activeTab)}
                onClick={() => { setViewMode('diagram') }}
                disabled={error !== null}
                title={error !== null ? (isZh ? '语法解析失败，无法查看图表' : 'Syntax error in diagram') : undefined}
              >
                {diagramLabel}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'code'}
                className={clsx(css.tabButton, viewMode === 'code' && css.activeTab)}
                onClick={() => { setViewMode('code') }}
              >
                {codeLabel}
              </button>
            </div>
          </div>
          <div className={css.action}>
            <button type="button" className={css.copyButton} onClick={onCopy}>
              {copied ? copiedLabel : copyLabel}
            </button>
          </div>
        </div>
      </div>

      {error !== null && (
        <div className={css.errorBanner} role="alert">
          <span className={css.errorBadge}>{isZh ? '语法错误' : 'Syntax Error'}</span>
          <span>{error}</span>
        </div>
      )}

      {viewMode === 'diagram' && error === null && (
        <div className={css.diagramBody} data-mermaid-diagram>
          {loading ? (
            <div className={css.loading}>
              <div className={css.spinner} />
              <span>{isZh ? '正在渲染图表...' : 'Rendering diagram...'}</span>
            </div>
          ) : svg !== null ? (
            <div
              className={css.diagramSvg}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : null}
        </div>
      )}

      {(viewMode === 'code' || error !== null) && (
        <div className={css.codeBody}>
          <CodeBlock
            code={code}
            lang="mermaid"
            showHeader={false}
            copyLabel={copyLabel}
            copiedLabel={copiedLabel}
          />
        </div>
      )}
    </div>
  )
}
