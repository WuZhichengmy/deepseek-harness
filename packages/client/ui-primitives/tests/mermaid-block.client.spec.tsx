// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MarkdownText } from './markdown-test-components.tsx'
import { MermaidBlock } from '../src/markdown/MermaidBlock.tsx'

const mockRender = vi.fn()

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: (...args: unknown[]): Promise<{ svg: string }> => mockRender(...args) as Promise<{ svg: string }>,
  },
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

beforeEach(() => {
  mockRender.mockResolvedValue({ svg: '<svg class="test-mermaid-svg"><g id="node1">A</g></svg>' })
})

describe('MermaidBlock', () => {
  const sampleCode = 'flowchart TD\n  A[Start] --> B[End]'

  it('renders SVG diagram on successful parse and initializes mermaid', async () => {
    const { container } = render(
      <MermaidBlock
        code={sampleCode}
        copyLabel="复制"
        copiedLabel="已复制"
      />,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(mockRender).toHaveBeenCalledTimes(1)
    expect(container.querySelector('.test-mermaid-svg')).not.toBeNull()
    expect(container.querySelector('[data-mermaid-diagram]')).not.toBeNull()
  })

  it('supports interactive toggle between diagram view and code view', async () => {
    const { container } = render(
      <MermaidBlock
        code={sampleCode}
        copyLabel="复制"
        copiedLabel="已复制"
      />,
    )

    await act(async () => {
      await Promise.resolve()
    })

    const diagramTab = screen.getByRole('tab', { name: '图表' })
    const codeTab = screen.getByRole('tab', { name: '代码' })

    expect(diagramTab.getAttribute('aria-selected')).toBe('true')
    expect(codeTab.getAttribute('aria-selected')).toBe('false')
    expect(container.querySelector('[data-mermaid-diagram]')).not.toBeNull()

    // Switch to code view
    fireEvent.click(codeTab)
    expect(diagramTab.getAttribute('aria-selected')).toBe('false')
    expect(codeTab.getAttribute('aria-selected')).toBe('true')
    expect(container.querySelector('[data-code-block-content]')).not.toBeNull()
    expect(container.textContent).toContain('flowchart TD')

    // Switch back to diagram view
    fireEvent.click(diagramTab)
    expect(diagramTab.getAttribute('aria-selected')).toBe('true')
    expect(container.querySelector('[data-mermaid-diagram]')).not.toBeNull()
  })

  it('handles syntax errors gracefully and falls back to code view with an alert', async () => {
    mockRender.mockRejectedValueOnce(new Error('Parse error on line 2: unexpected token'))

    const { container } = render(
      <MermaidBlock
        code="invalid mermaid syntax"
        copyLabel="复制"
        copiedLabel="已复制"
      />,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(container.textContent).toContain('Parse error on line 2')
    // Fallback shows code view
    expect(container.querySelector('[data-code-block-content]')).not.toBeNull()
  })

  it('copies mermaid source code to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    render(
      <MermaidBlock
        code={sampleCode}
        copyLabel="复制"
        copiedLabel="已复制"
      />,
    )

    await act(async () => {
      await Promise.resolve()
    })

    const copyBtn = screen.getByRole('button', { name: '复制' })
    await act(async () => {
      fireEvent.click(copyBtn)
    })

    expect(writeText).toHaveBeenCalledWith(sampleCode.trim())
  })
})

describe('MarkdownText integration with Mermaid', () => {
  it('renders MermaidBlock when settled and code block is mermaid', async () => {
    const doc = '```mermaid\nflowchart TD\n  A --> B\n```'
    const { container } = render(<MarkdownText text={doc} streaming={false} />)

    await act(async () => {
      await Promise.resolve()
    })

    expect(container.querySelector('[data-mermaid-block]')).not.toBeNull()
  })

  it('renders as standard CodeBlock during streaming', () => {
    const doc = '```mermaid\nflowchart TD\n  A -->'
    const { container } = render(<MarkdownText text={doc} streaming={true} />)

    expect(container.querySelector('[data-mermaid-block]')).toBeNull()
    expect(container.querySelector('[data-code-block-content]')).not.toBeNull()
  })
})
