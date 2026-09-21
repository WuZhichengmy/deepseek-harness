/**
 * Type declarations and Schemastery config for the Dify tool package.
 * @module @deepseek-ai/dsh-tool-dify/types
 */

import z from '@deepseek-ai/schemastery'

/**
 * Configuration options for the Dify tool plugin.
 */
export interface Config {
  /**
   * The Dify API base endpoint (e.g. `https://api-test-jmai.jomoo.com/v1`).
   * If omitted, falls back to `process.env[endpointEnv]` or `process.env.DIFY_API_ENDPOINT`.
   */
  endpoint?: string
  /**
   * Name of the environment variable containing the Dify API endpoint.
   * @default 'DIFY_API_ENDPOINT'
   */
  endpointEnv?: string
  /**
   * The Dify Application API Key (starts with `app-`).
   * If omitted, falls back to `process.env[apiKeyEnv]` or `process.env.DIFY_API_KEY`.
   */
  apiKey?: string
  /**
   * Name of the environment variable containing the Dify API key.
   * Prefer this over `apiKey` so credentials stay out of configuration files.
   * @default 'DIFY_API_KEY'
   */
  apiKeyEnv?: string
  /**
   * Default user identifier passed in Dify request body.
   * @default 'dsh-user'
   */
  user?: string
  /**
   * Request timeout in milliseconds.
   * @default 60000
   */
  timeoutMs?: number
  /**
   * Name of the tool exposed to the model.
   * @default 'dify_chatflow'
   */
  toolName?: string
  /**
   * Custom tool description to override the default prompt.
   */
  toolDescription?: string
  /**
   * Optional default input variables passed to the Chatflow start node.
   */
  defaultInputs?: Record<string, unknown>
  /**
   * Path to standalone declarative YAML configuration file (e.g. `dify-tools.yaml`).
   */
  configFile?: string
  /**
   * Optional system prompt instructions appended to the agent's system prompt.
   * If omitted, falls back to `systemPrompt` defined in `dify-tools.yaml`.
   */
  systemPrompt?: string
}

/**
 * Schemastery schema for {@link Config}.
 */
export const Config: z<Config> = z.object({
  endpoint: z.string().description('Dify API base URL'),
  endpointEnv: z.string().description('Environment variable name for Dify endpoint'),
  apiKey: z.string().description('Dify Application API key'),
  apiKeyEnv: z.string().description('Environment variable name for Dify API key'),
  user: z.string().default('dsh-user').description('Default user identifier'),
  timeoutMs: z.number().default(120_000).description('Request timeout in milliseconds'),
  toolName: z.string().description('Model-facing tool name'),
  toolDescription: z.string().description('Optional custom tool description'),
  defaultInputs: z.dict(z.any()).description('Optional default inputs for Chatflow start node'),
  configFile: z.string().description('Path to dify-tools.yaml configuration file'),
  systemPrompt: z.string().description('Optional system prompt guidance appended to ctx.systemPrompt'),
})

/**
 * Input arguments accepted by the `dify_chatflow` tool.
 */
export interface DifyToolArgs {
  /** The natural language query or question to send to the Dify Chatflow. */
  query: string
  /** Optional conversation ID to continue an ongoing conversation session. */
  conversationId?: string | undefined
  /** Action to perform for email assistant: 总结, 回复, 代写, 润色, 检查语法, 翻译. */
  user_request?: string | undefined
  /** Email content or text to process/draft for email assistant. */
  input_text?: string | undefined
  /** How to polish email when user_request is 润色: 提升表达的清晰度, 缩短, 增长, 简化, 以我的语气重写. */
  how_polish?: string | undefined
  /** Optional custom input variables passed to the start node of the Chatflow. */
  inputs?: Record<string, unknown> | undefined
}

/**
 * Result returned by the Dify tool execution.
 */
export interface DifyToolResult {
  /** Cleaned text response from the Chatflow. */
  answer: string
  /** Conversation ID for multi-turn tracking. */
  conversationId: string
  /** Task ID returned by Dify. */
  taskId?: string
}

/**
 * Request payload sent to Dify `/chat-messages` endpoint.
 */
export interface DifyChatMessageRequest {
  inputs: Record<string, unknown>
  query: string
  response_mode: 'blocking' | 'streaming'
  user: string
  conversation_id?: string | undefined
}

/**
 * Standard blocking response returned by Dify `/chat-messages`.
 */
export interface DifyChatMessageResponse {
  event?: string
  task_id?: string
  id?: string
  message_id?: string
  conversation_id?: string
  mode?: string
  answer?: string
  created_at?: number
  message?: string
  status?: number
}
