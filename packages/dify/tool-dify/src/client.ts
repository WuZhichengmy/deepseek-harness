/**
 * Dify Chatflow HTTP client and response parsing utilities.
 * @module @deepseek-ai/dsh-tool-dify/client
 */

import type {
  DifyChatMessageRequest,
  DifyChatMessageResponse,
  DifyToolArgs,
  DifyToolResult,
} from './types.ts'

/** Default input variables matching the verified Chatflow start node schema. */
export const DEFAULT_CHATFLOW_INPUTS: Readonly<Record<string, unknown>> = Object.freeze({
  nisbos_auth_token: null,
  source: '其他',
  noAuthMenu: null,
  sys_type: 'PC端',
})

/**
 * Remove Dify-internal processing and performance tags from raw response text.
 * @param raw - The raw answer text returned by Dify.
 * @returns Cleaned readable text.
 */
export function cleanDifyAnswer(raw: string): string {
  return raw
    .replace(/<processing>[\s\S]*?<\/processing>/g, '')
    .replace(/<time_cost>[\s\S]*?<\/time_cost>/g, '')
    .trim()
}

/** Client options for invoking the Dify API. */
export interface DifyClientOptions {
  /** Dify API base endpoint (e.g. `https://api-test-jmai.jomoo.com/v1`). */
  endpoint: string
  /** Dify Application API key (starts with `app-`). */
  apiKey: string
  /** Default user identifier. */
  user?: string | undefined
  /** Request timeout in milliseconds. */
  timeoutMs?: number | undefined
  /** Default inputs to merge into request payload. */
  defaultInputs?: Record<string, unknown> | undefined
}

/**
 * Call the Dify Chatflow API with the specified query and parameters.
 * @param options - Client credentials and network options.
 * @param args - Tool invocation arguments.
 * @param signal - Optional cancellation signal.
 * @returns Formatted tool result with cleaned answer and conversation tracking.
 */
export async function callDifyChatflow(
  options: DifyClientOptions,
  args: DifyToolArgs,
  signal?: AbortSignal,
): Promise<DifyToolResult> {
  const normalizedEndpoint = options.endpoint.replace(/\/+$/, '')
  const url = `${normalizedEndpoint}/chat-messages`

  const initialInputs = options.defaultInputs !== undefined
    ? options.defaultInputs
    : DEFAULT_CHATFLOW_INPUTS

  const payload: DifyChatMessageRequest = {
    inputs: {
      ...initialInputs,
      ...(args.inputs ?? {}),
    },
    query: args.query,
    response_mode: 'blocking',
    user: options.user ?? 'dsh-user',
    ...(args.conversationId ? { conversation_id: args.conversationId } : {}),
  }

  const timeoutMs = options.timeoutMs ?? 120_000
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  const effectiveSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: effectiveSignal,
  })

  if (!response.ok) {
    let errorDetail: string
    try {
      const errJson = (await response.json()) as { message?: string }
      errorDetail = errJson.message ?? `HTTP ${response.status} ${response.statusText}`
    } catch {
      errorDetail = `HTTP ${response.status} ${response.statusText}`
    }
    throw new Error(`Dify Chatflow API request failed: ${errorDetail}`)
  }

  const data = (await response.json()) as DifyChatMessageResponse
  const rawAnswer = data.answer ?? ''
  const cleaned = cleanDifyAnswer(rawAnswer)

  return {
    answer: cleaned.length > 0 ? cleaned : rawAnswer,
    conversationId: data.conversation_id ?? '',
    ...(data.task_id ? { taskId: data.task_id } : {}),
  }
}
