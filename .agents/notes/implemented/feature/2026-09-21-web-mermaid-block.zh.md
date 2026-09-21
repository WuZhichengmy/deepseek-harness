# Agent 记录：Web 端 Mermaid 图表渲染与交互切换

状态：已实现

[English](2026-09-21-web-mermaid-block.md) | 中文

## 问题

助手在回复复杂任务时，经常会生成 ````mermaid` 代码块形式的工作流编排图、状态机或时序图。此前，Web UI 将 `mermaid` 代码块作为普通的语法高亮代码块展示，用户必须将原始语法复制到外部工具才能查看可视化拓扑结构。

在流式输出过程中，未完成的 Mermaid 语法必然导致解析异常，并在增量字符到达时引发剧烈的布局抖动。如果已结束的轮次中存在无效的 Mermaid 语法，若直接以错误占位符替换整个区块，将导致用户无法查看或复制原始代码。

## 决策

Markdown 渲染管线为 settled（非流式）的 ````mermaid` 代码块挂载专门的 `MermaidBlock` 组件：

1. **SVG 图表与代码切换**：区块默认渲染为 SVG 矢量图。顶部栏提供 `图表` / `代码`（英文环境下为 `Diagram` / `Code`）切换标签，用户可随时在图形视图和原始代码之间自由切换。
2. **动态按需加载**：Mermaid 运行时资源通过动态 `import('mermaid')` 异步加载，仅在实际渲染 Mermaid 代码块时才拉取，不影响前端初始页面的首屏体积。
3. **流式安全保护**：在模型流式生成期间（`context.streaming === true`），语言为 `mermaid` 的代码块保持以轻量高亮的 `CodeBlock` 展示；待该轮交互结算结束（streaming 结束）后，平滑过渡为 `MermaidBlock` 视图。
4. **语法错误回退**：当图表语法解析失败时，组件保留错误提示横幅，并自动降级切换至代码视图，确保用户始终能查看并一键复制源码。
5. **主题自适应**：Mermaid 渲染自动检测文档的深色模式（`data-theme="dark"` 或 class `dark`），并为 Mermaid 配置对应的主题（`dark` 或 `default`）。

## 备选方案

**流式输出期间直接渲染 Mermaid。** 否决。未完成的代码语法必然在每个增量字符输出时抛出解析错误，导致严重的性能卡顿和 DOM 闪烁。

**将 Mermaid 预打包至初始 Vendor Chunk。** 否决。Mermaid 及其布局引擎（dagre、cytoscape）体积庞大（压缩后约 600 KB），将其放入入口 chunk 会显著拖慢无需渲染图表的常规会话的首屏加载速度。

## 测试

- `packages/client/ui-primitives/tests/mermaid-block.client.spec.tsx` 中的单元测试覆盖了 SVG 图表渲染、标签切换、复制按钮剪贴板操作、语法错误自动回退到代码视图以及加载状态转换。
- `packages/client/ui-primitives/tests/markdown.client.spec.tsx` 和 DOM 一致性测试验证了非流式 Markdown 正确将 `mermaid` 块路由至 `MermaidBlock`。
- 构建验证确认 `pnpm run build:web` 生成了预期的动态 chunk，且本地 `dsh web` 能够正常提供编译后的静态资源。
