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

let mermaidInitialized = false

/**
 * Render mermaid diagram source into an SVG string.
 * @param id - DOM id used for mermaid rendering container.
 * @param code - The mermaid flowchart or diagram definition.
 * @returns The rendered SVG string.
 */
async function renderMermaidSvg(id: string, code: string): Promise<string> {
  const { default: mermaid } = await import('mermaid')
  if (!mermaidInitialized) {
    const isDark = typeof document !== 'undefined'
      && (document.documentElement.getAttribute('data-theme') === 'dark'
        || document.documentElement.classList.contains('dark'))
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: isDark ? 'dark' : 'default',
      fontFamily: 'inherit',
    })
    mermaidInitialized = true
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
