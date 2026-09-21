---
description: "面向模型的 dify_chatflow 工具包：企业知识库、制度规则与 Dify Chatflow 工作流集成。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-dify

[English](README.md) | 中文

## 概述

`dsh-tool-dify` 为智能体提供面向模型的 `dify_chatflow` 工具，用于直接对接企业 Dify Chatflow 对话流与知识库。当用户向智能体咨询企业规章制度、HR 人事薪酬政策、年终奖福利计算或特定业务流程时，模型可自主调用该工具向 Dify 发起查询并获得清洗后的结构化解答。工具会自动剥离 Dify 流中的处理标记、维护多轮会话上下文，并优雅处理网络或接口异常。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)

-----

<a id="use-this-package"></a>
## 使用本包

在 Agent Preset（如 `packages/preset/agent-presets/presets/standard/agent.cordis.yml`）或全局 Bundle 补丁中挂载 `@deepseek-ai/dsh-tool-dify` 即可为智能体注入该工具。

### 配置说明

工具默认读取环境变量（或根目录 `.env`）中的 `DIFY_API_ENDPOINT` 与 `DIFY_API_KEY`，也支持在 `cordis.yml` 中显式配置：

```yaml
- name: '@deepseek-ai/dsh-tool-dify'
  config:
    endpoint: 'https://api-test-jmai.jomoo.com/v1'
    apiKey: 'app-Cm19L4P2mujz6mOoZkdqgRBK'
    timeoutMs: 120000
    user: 'dsh-user'
```

| 字段 | 默认值 | 描述 |
|---|---|---|
| `endpoint` | `process.env.DIFY_API_ENDPOINT` | Dify API 服务端点 |
| `endpointEnv` | `'DIFY_API_ENDPOINT'` | 存放服务端点的环境变量名称 |
| `apiKey` | `process.env.DIFY_API_KEY` | Dify 应用密钥（以 `app-` 开头） |
| `apiKeyEnv` | `'DIFY_API_KEY'` | 存放应用密钥的环境变量名称 |
| `timeoutMs` | `120000` | HTTP 请求超时时间（毫秒） |
| `user` | `'dsh-user'` | 请求载荷中的用户标识符 |
| `toolName` | `'dify_chatflow'` | 面向模型的工具名称 |
| `toolDescription` | 内置人事政策提示 | 面向模型的工具功能说明 |
| `defaultInputs` | 对应 Chatflow 开始节点默认入参 | 可选的开始节点默认输入变量 |

### 多工具实例挂载

可以通过指定不同的 ID 在 Cordis 配置中多次挂载 `@deepseek-ai/dsh-tool-dify`，将不同的 Dify Chatflow 暴露为相互独立的 Agent 工具：

```yaml
- id: tool-dify-knowledge
  name: '@deepseek-ai/dsh-tool-dify'
  config:
    toolName: dify_knowledge_qa
    apiKeyEnv: DIFY_KNOWLEDGE_API_KEY

- id: tool-dify-email
  name: '@deepseek-ai/dsh-tool-dify'
  config:
    toolName: dify_email_assistant
    apiKeyEnv: DIFY_EMAIL_API_KEY
```

-----

<a id="understand-the-implementation"></a>
## 理解实现

1. **处理标记清洗**：Dify Chatflow 返回的文本中常包含 `<processing>...</processing>` 和 `<time_cost>...</time_cost>` 等流程标签，客户端会在将答案递交给模型前自动将其剔除。
2. **多轮对话连续性**：每次执行均会返回 `conversationId`，模型可在后续提问中携带此 ID 以延续 Dify 端的上下文。
3. **调用防护**：对空查询进行参数校验，通过 `AbortSignal` 限制调用耗时，并捕获服务端错误转为结构化结果而非导致未捕获异常。
4. **原生并发支持**：工具声明了 `isConcurrencySafe: () => true`。当智能体在单轮对话中针对多个主题同时发起多个 Dify 调用时，DSH 的 Agent Loop 调度器会自动通过滚动并发池并发执行这些调用，而非串行阻塞等待。
5. **智能参数适配**：针对邮件助手等需要特定开始节点表单（`user_request`、`Input_Text`、`how_polish`）的 Chatflow，插件支持顶层参数直传与自然语言指令自动推断，避免因表单缺失导致 Dify 校验失败。

-----

<a id="model-experience"></a>
## 模型体验

模型接收到的 Dify 工具（如 `dify_knowledge_qa`、`dify_email_assistant`）参数包含 `query`、可选的 `conversationId` 以及专用参数（`user_request`、`input_text`、`how_polish`、`inputs`）。执行结果返回结构化的 `answer` 与 `conversationId`。
