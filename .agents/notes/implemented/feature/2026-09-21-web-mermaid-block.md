# Agent Note: Web Mermaid diagram rendering and interactive toggle

Status: implemented

English | [中文](2026-09-21-web-mermaid-block.zh.md)

## Problem

Assistant responses often provide workflow graphs, state machines, and sequence charts formatted as ````mermaid` code blocks. Previously, the Web UI treated `mermaid` code blocks as generic syntax-highlighted code blocks, requiring users to copy the raw syntax into external viewers or tools to inspect the visual topology.

In streaming turns, rendering incomplete mermaid syntax as an SVG produces parse exceptions and jarring layout thrashing as tokens arrive. When settled turns contain invalid Mermaid syntax, replacing the entire block with an error state prevents the user from inspecting or copying the source code.

## Decision

The Markdown renderer mounts a dedicated `MermaidBlock` component for settled (non-streaming) ````mermaid` code blocks.

1. **SVG Diagram and Code Toggle**: The block defaults to rendering an SVG diagram. The header banner features toggle tabs (`图表` / `代码` or `Diagram` / `Code`) allowing users to switch between the graphical diagram and raw syntax at any time.
2. **Dynamic Lazy Loading**: Mermaid runtime assets are loaded asynchronously via dynamic `import('mermaid')` only when a mermaid block is actually rendered, keeping initial page load bundle weight unaffected.
3. **Streaming Protection**: During active streaming (`context.streaming === true`), markdown code blocks with language `mermaid` remain rendered as lightweight, syntax-highlighted `CodeBlock` elements. Once the turn completes and streaming ends, the component transitions to `MermaidBlock`.
4. **Syntax Error Fallback**: When diagram parsing fails, the component surfaces an error badge and message while automatically switching to the raw code view, ensuring the user can always read and copy the code.
5. **Theme Adaptation**: Mermaid rendering automatically detects document dark mode (`data-theme="dark"` or class `dark`) and configures Mermaid with the matching theme (`dark` or `default`).

## Alternatives considered

**Render mermaid during streaming.** Rejected because incomplete mermaid syntax inevitably throws parse errors on nearly every intermediate token, causing severe performance degradation and DOM flicker.

**Pre-bundle Mermaid into the initial vendor chunk.** Rejected because Mermaid and its graph layout engines (dagre, cytoscape) are heavy (~600 KB minified), which would unnecessarily penalize initial application load time for sessions without diagrams.

## Testing

- Unit tests in `packages/client/ui-primitives/tests/mermaid-block.client.spec.tsx` verify SVG rendering, header tab switching, copy button clipboard actions, syntax error fallback to code view, and loading state transitions.
- Parity tests in `packages/client/ui-primitives/tests/markdown.client.spec.tsx` and DOM parity tests verify that settled markdown correctly routes `mermaid` fences to `MermaidBlock`.
- Built web application verification verifies that `pnpm run build:web` emits dynamic chunks and that `dsh web` serves the compiled assets.
