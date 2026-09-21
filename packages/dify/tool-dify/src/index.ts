import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { callDifyChatflow, DEFAULT_CHATFLOW_INPUTS } from './client.ts'
import {
  compileToolParameters,
  loadDeclarativeConfig,
  prepareDeclarativeInputs,
  type DeclarativeToolEntry,
} from './schema-loader.ts'
import { Config, type DifyToolResult } from './types.ts'

export { Config } from './types.ts'
export type { DifyToolArgs, DifyToolResult } from './types.ts'
export { callDifyChatflow, cleanDifyAnswer, DEFAULT_CHATFLOW_INPUTS } from './client.ts'
export {
  loadDeclarativeTools,
  loadDeclarativeConfig,
  compileToolParameters,
  prepareDeclarativeInputs,
} from './schema-loader.ts'
export type {
  DeclarativeToolEntry,
  DeclarativeToolsFile,
  DeclarativeParameterSpec,
  DeclarativeInferRule,
} from './schema-loader.ts'

/** Cordis plugin name recognized by the Loader. */
export const name = 'tool-dify'

/** Required services for tool registration. */
export const inject = ['tools']

const DEFAULT_TOOL_NAME = 'dify_chatflow'
const DEFAULT_TOOL_DESCRIPTION =
  'Query enterprise knowledge base, HR policies, employee salary regulations, '
  + 'annual bonus criteria, probation, and internal guidelines via the Dify Chatflow. '
  + 'Use this tool whenever the user inquires about company policies, benefit calculations, '
  + 'or institutional rules. When the user asks about multiple distinct or independent topics, '
  + 'you can and should invoke this tool multiple times in parallel within the same turn to query them concurrently.'

/**
 * Infer the email action for the Chatflow start node from user query when omitted.
 * @param query - The natural language instruction.
 * @returns One of the valid user_request options.
 */
export function inferEmailUserRequest(query: string): string {
  if (/总结|摘要|概括|提炼/i.test(query)) return '总结'
  if (/回复|回信|答复/i.test(query)) return '回复'
  if (/润色|优化表达|改写|修饰/i.test(query)) return '润色'
  if (/语法|错别字|纠错|拼写/i.test(query)) return '检查语法'
  if (/翻译/i.test(query)) return '翻译'
  return '代写'
}

/**
 * Infer the polishing style for the Chatflow start node from user query when omitted.
 * @param query - The natural language instruction.
 * @returns One of the valid how_polish options.
 */
export function inferHowPolish(query: string): string {
  if (/清晰|通顺/i.test(query)) return '提升表达的清晰度'
  if (/缩短|精简|简短|简要/i.test(query)) return '缩短'
  if (/增长|丰富|扩写|详细/i.test(query)) return '增长'
  if (/简化|通俗/i.test(query)) return '简化'
  if (/语气|风格/i.test(query)) return '以我的语气重写'
  return '提升表达的清晰度'
}

/**
 * Helper to lazily load .env if credentials are not already set in process.env.
 */
function ensureEnvLoaded(): void {
  if (process.env.DIFY_API_KEY && process.env.DIFY_API_ENDPOINT) return
  try {
    // Node.js 20.6+ native env loader
    if (typeof process.loadEnvFile === 'function') {
      process.loadEnvFile()
    }
  } catch {
    // Silently continue if .env does not exist; credentials may be passed in config
  }
}

/**
 * Register a single declarative tool entry into `ctx.tools`.
 * @param ctx - The Cordis context carrying the `tools` registry.
 * @param entry - Declarative tool configuration entry.
 */
function registerDeclarativeTool(ctx: Context, entry: DeclarativeToolEntry): void {
  const toolName = entry.name
  const description = entry.description
  const timeoutMs = entry.timeoutMs ?? 120_000
  const parameters = compileToolParameters(entry)

  ctx.tools.register(
    defineTool({
      name: toolName,
      description,
      parameters,
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            answer: { type: 'string', required: true },
            conversationId: { type: 'string', required: true },
            taskId: { type: 'string' },
          },
        },
        render: (_args, value: DifyToolResult) => [{ type: 'text', text: value.answer }],
      },
      timeoutMs,
      // Read-only queries to knowledge bases and stateless assistants do not mutate agent session state
      isConcurrencySafe: () => true,
      async execute(args, exec): Promise<DifyToolResult> {
        const raw = args as Record<string, unknown>
        const query = typeof raw.query === 'string' ? raw.query.trim() : ''
        if (!query) {
          throw new Error(`${toolName}: \`query\` must be a non-empty string`)
        }

        const endpoint = entry.endpoint
          || (entry.endpointEnv ? process.env[entry.endpointEnv] : undefined)
          || process.env.DIFY_API_ENDPOINT
        const apiKey = entry.apiKey
          || (entry.apiKeyEnv ? process.env[entry.apiKeyEnv] : undefined)
          || process.env.DIFY_API_KEY

        if (!endpoint || !apiKey) {
          throw new Error(
            `${toolName}: Missing Dify credentials. `
            + `Please provide \`endpoint\`/\`apiKey\` or set \`${entry.apiKeyEnv ?? 'DIFY_API_KEY'}\` in .env.`,
          )
        }

        const finalInputs = prepareDeclarativeInputs(entry, raw, query)

        return await callDifyChatflow(
          {
            endpoint,
            apiKey,
            user: entry.user ?? 'dsh-user',
            timeoutMs,
            defaultInputs: entry.defaultInputs,
          },
          {
            query,
            inputs: finalInputs,
            ...(typeof raw.conversationId === 'string' ? { conversationId: raw.conversationId } : {}),
          },
          exec.signal,
        )
      },
    }),
  )
}

/**
 * Register a single legacy tool into `ctx.tools`.
 * @param ctx - The Cordis context carrying the `tools` registry.
 * @param config - Plugin configuration options.
 */
function registerSingleTool(ctx: Context, config: Config): void {
  const toolName = config.toolName || DEFAULT_TOOL_NAME
  const description = config.toolDescription || DEFAULT_TOOL_DESCRIPTION
  const timeoutMs = config.timeoutMs ?? 120_000

  ctx.tools.register(
    defineTool({
      name: toolName,
      description,
      parameters: {
        query: {
          type: 'string',
          required: true,
          description: 'The natural language question or query to send to the Dify Chatflow.',
        },
        conversationId: {
          type: 'string',
          description: 'Optional Dify conversation ID to continue an ongoing conversation.',
        },
        inputs: {
          type: 'object',
          additionalProperties: true,
          description: 'Optional custom variables for the Chatflow start node.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            answer: { type: 'string', required: true },
            conversationId: { type: 'string', required: true },
            taskId: { type: 'string' },
          },
        },
        render: (_args, value: DifyToolResult) => [{ type: 'text', text: value.answer }],
      },
      timeoutMs,
      isConcurrencySafe: () => true,
      async execute(args, exec): Promise<DifyToolResult> {
        const raw = args as { query?: string; conversationId?: string; inputs?: Record<string, unknown> }
        const query = typeof raw.query === 'string' ? raw.query.trim() : ''
        if (!query) {
          throw new Error(`${toolName}: \`query\` must be a non-empty string`)
        }

        const endpoint = config.endpoint
          || (config.endpointEnv ? process.env[config.endpointEnv] : undefined)
          || process.env.DIFY_API_ENDPOINT
        const apiKey = config.apiKey
          || (config.apiKeyEnv ? process.env[config.apiKeyEnv] : undefined)
          || (toolName === 'dify_knowledge_qa' ? process.env.DIFY_KNOWLEDGE_API_KEY : undefined)
          || process.env.DIFY_API_KEY

        if (!endpoint || !apiKey) {
          throw new Error(
            `${toolName}: Missing Dify credentials. `
            + 'Please provide `endpoint`/`apiKey` in plugin config or set DIFY_API_ENDPOINT and DIFY_API_KEY in .env.',
          )
        }

        const effectiveDefaultInputs = (config.defaultInputs && Object.keys(config.defaultInputs).length > 0)
          ? config.defaultInputs
          : DEFAULT_CHATFLOW_INPUTS

        const finalInputs: Record<string, unknown> = {
          ...effectiveDefaultInputs,
          ...(raw.inputs ?? {}),
        }

        return await callDifyChatflow(
          {
            endpoint,
            apiKey,
            user: config.user ?? 'dsh-user',
            timeoutMs,
            defaultInputs: effectiveDefaultInputs,
          },
          {
            query,
            inputs: finalInputs,
            ...(raw.conversationId !== undefined ? { conversationId: raw.conversationId } : {}),
          },
          exec.signal,
        )
      },
    }),
  )
}

/**
 * Register Dify tools into `ctx.tools`.
 * Automatically reads and mounts tools from `dify-tools.yaml` if available;
 * otherwise registers a single tool based on `config`.
 * @param ctx - The Cordis context carrying the `tools` registry.
 * @param config - Plugin configuration options.
 */
export function apply(ctx: Context, config: Config = {}): void {
  ensureEnvLoaded()

  // 1. Try loading declarative configuration from dify-tools.yaml
  const declarativeConfig = loadDeclarativeConfig(config.configFile)
  const declarativeEntries = declarativeConfig?.tools

  // 2. Register system prompt guidance if provided
  const promptText = config.systemPrompt ?? declarativeConfig?.systemPrompt
  if (promptText && promptText.trim().length > 0) {
    ctx.inject(['systemPrompt'], (promptCtx) => {
      const sectionName = config.toolName
        ? `tool:dify:guidance:${config.toolName}`
        : 'tool:dify:guidance'
      const order = typeof promptCtx.systemPrompt.getSectionOrder === 'function'
        ? promptCtx.systemPrompt.getSectionOrder('TOOLS_SDK')
        : 5000
      promptCtx.effect(() => promptCtx.systemPrompt.section({
        name: sectionName,
        order: Number.isFinite(order) ? order : 5000,
        text: promptText.trim(),
      }), 'tool-dify.systemPrompt')
    })
  }

  if (declarativeEntries && declarativeEntries.length > 0) {
    if (config.toolName) {
      const matchingEntry = declarativeEntries.find(e => e.name === config.toolName)
      if (matchingEntry) {
        const mergedEntry: DeclarativeToolEntry = {
          ...matchingEntry,
          ...(config.toolDescription ? { description: config.toolDescription } : {}),
          ...(config.endpoint ? { endpoint: config.endpoint } : {}),
          ...(config.endpointEnv ? { endpointEnv: config.endpointEnv } : {}),
          ...(config.apiKey ? { apiKey: config.apiKey } : {}),
          ...(config.apiKeyEnv ? { apiKeyEnv: config.apiKeyEnv } : {}),
          ...(config.user ? { user: config.user } : {}),
          ...(config.timeoutMs ? { timeoutMs: config.timeoutMs } : {}),
          ...(config.defaultInputs ? { defaultInputs: config.defaultInputs } : {}),
        }
        registerDeclarativeTool(ctx, mergedEntry)
        return
      }
      registerSingleTool(ctx, config)
      return
    }

    // No specific toolName: register all tools declared in YAML
    for (const entry of declarativeEntries) {
      registerDeclarativeTool(ctx, entry)
    }
    return
  }

  // 3. Inline / single tool registration
  registerSingleTool(ctx, config)
}
