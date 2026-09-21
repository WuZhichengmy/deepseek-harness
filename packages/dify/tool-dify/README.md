---
description: "Model-facing dify_chatflow tool over Dify Chatflow APIs: enterprise knowledge query, policy lookup, and chatflow integration."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-dify

English | [中文](README.zh.md)

## Summary

`dsh-tool-dify` gives the agent a model-facing `dify_chatflow` tool to interact with enterprise Dify Chatflows and knowledge bases. When the agent receives inquiries regarding institutional guidelines, HR policies, benefits, or custom company workflows, it can invoke `dify_chatflow` to query Dify and receive cleaned, structured answers. The tool strips processing markers, formats multi-turn session IDs, and handles network or API error conditions gracefully.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)

-----

<a id="use-this-package"></a>
## Use this package

Mount `@deepseek-ai/dsh-tool-dify` in your agent presets (e.g. `packages/preset/agent-presets/presets/standard/agent.cordis.yml`) or bundle configuration to provide the agent with the `dify_chatflow` tool.

### Configuration

The tool reads `DIFY_API_ENDPOINT` and `DIFY_API_KEY` from the environment (or project `.env`) by default, or accepts explicit configuration in `cordis.yml`:

```yaml
- name: '@deepseek-ai/dsh-tool-dify'
  config:
    endpoint: 'https://api-test-jmai.jomoo.com/v1'
    apiKey: 'app-Cm19L4P2mujz6mOoZkdqgRBK'
    timeoutMs: 120000
    user: 'dsh-user'
```

| Field | Default | Description |
|---|---|---|
| `endpoint` | `process.env.DIFY_API_ENDPOINT` | Dify API base URL |
| `endpointEnv` | `'DIFY_API_ENDPOINT'` | Environment variable name for Dify endpoint |
| `apiKey` | `process.env.DIFY_API_KEY` | Dify application secret key (`app-...`) |
| `apiKeyEnv` | `'DIFY_API_KEY'` | Environment variable name for Dify API key |
| `timeoutMs` | `120000` | HTTP request timeout in milliseconds |
| `user` | `'dsh-user'` | User identifier passed in Dify request body |
| `toolName` | `'dify_chatflow'` | Tool name exposed to the model |
| `toolDescription` | built-in HR policy prompt | Tool description exposed to the model |
| `defaultInputs` | Chatflow start node defaults | Optional default inputs for Chatflow start node |

### Multi-instance Tool Configuration

You can mount `@deepseek-ai/dsh-tool-dify` multiple times under different IDs to expose distinct Dify Chatflows as separate tools:

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
## Understand the implementation

1. **Tag Stripping**: Dify chatflows may wrap thinking or processing status in `<processing>...</processing>` and `<time_cost>...</time_cost>` XML tags. The client utility cleanses these before presenting the final text to the agent.
2. **Multi-turn Continuity**: Every call returns `conversationId`, allowing the agent to pass it back in subsequent queries to maintain conversation context within Dify.
3. **Execution Guardrails**: The tool validates inputs, bounds request timeouts with `AbortSignal`, and catches upstream errors to return structured error messages rather than unhandled rejections.
4. **Parallel Tool Calling**: The tool declares `isConcurrencySafe: () => true`. When an agent requests multiple Dify queries in a single step, the DSH agent loop rolling scheduler executes them concurrently rather than serially.
5. **Smart Parameter Alignment**: For workflow/chatflow apps like Email Assistant that require specific start-node inputs (`user_request`, `Input_Text`, `how_polish`), the plugin automatically normalizes and infers form variables from the model's instructions.

-----

<a id="model-experience"></a>
## Model Experience

The model receives registered Dify tools (e.g. `dify_knowledge_qa`, `dify_email_assistant`) with `query`, optional `conversationId`, and tool-specific fields (`user_request`, `input_text`, `how_polish`, `inputs`). Results are structured with `answer` and `conversationId`.
