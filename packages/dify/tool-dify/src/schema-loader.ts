/**
 * Declarative YAML schema loader and argument mapping engine for Dify tools.
 * @module @deepseek-ai/dsh-tool-dify/schema-loader
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import yaml from 'js-yaml'
import type { ParameterSchemaSpec } from '@deepseek-ai/dsh-tools'

/**
 * Pattern-based inference rule for auto-completing input variables.
 */
export interface DeclarativeInferRule {
  /** Optional condition gate before executing pattern match (e.g. `user_request === '润色'`). */
  when?: string
  /** Map of target value to regex string tested against query. */
  pattern?: Record<string, string>
  /** Fallback value when no regex matches. */
  default?: string
}

/**
 * Field specification for an extra parameter declared in YAML.
 */
export interface DeclarativeParameterSpec {
  /** Primitive parameter type. */
  type: 'string' | 'number' | 'integer' | 'boolean' | 'object'
  /** Whether this parameter is mandatory. Default is false. */
  required?: boolean
  /** Optional enum constraint of allowed values. */
  enum?: readonly string[]
  /** Documentation describing the parameter for the model. */
  description?: string
  /** Corresponding variable name in Dify start node inputs (e.g. `Input_Text`). */
  targetInput?: string
  /** If true, falls back to the user query string when the model omits this parameter. */
  fallbackToQuery?: boolean
  /** Automatic intent classification rule based on query text. */
  infer?: DeclarativeInferRule
}

/**
 * Entry definition for a single Dify tool declared in `dify-tools.yaml`.
 */
export interface DeclarativeToolEntry {
  /** Unique model-facing tool name (e.g. `dify_knowledge_qa`, `dify_email_assistant`). */
  name: string
  /** Description provided to the model explaining what this tool does. */
  description: string
  /** Optional Dify API base endpoint. Defaults to `DIFY_API_ENDPOINT` env. */
  endpoint?: string
  /** Environment variable name containing Dify API endpoint. */
  endpointEnv?: string
  /** Optional Dify Application API key. Defaults to `DIFY_API_KEY` env. */
  apiKey?: string
  /** Environment variable name containing Dify Application API key. */
  apiKeyEnv?: string
  /** Default user identifier passed in request body. */
  user?: string
  /** Request timeout in milliseconds. */
  timeoutMs?: number
  /** Default inputs passed to Dify Chatflow start node. */
  defaultInputs?: Record<string, unknown>
  /** Extra parameters exposed to the model and mapped into Dify inputs. */
  parameters?: Record<string, DeclarativeParameterSpec>
}

/**
 * Top-level structure of `dify-tools.yaml`.
 */
export interface DeclarativeToolsFile {
  /** Optional system prompt guidance appended to the agent's system prompt. */
  systemPrompt?: string
  /** List of configured Dify tool entries. */
  tools: DeclarativeToolEntry[]
}

/** Default candidate paths where `dify-tools.yaml` may reside. */
export const DEFAULT_CONFIG_CANDIDATES: readonly string[] = Object.freeze([
  'dify-tools.yaml',
  'dify-tools.yml',
  'config/dify-tools.yaml',
  'config/dify-tools.yml',
])

/**
 * Locate and read the full `dify-tools.yaml` configuration from the filesystem.
 * @param customPath - Optional explicit configuration file path.
 * @param cwd - Working directory for relative path resolution. Defaults to `process.cwd()`.
 * @returns Parsed declarative tools configuration file, or null if no configuration file was found.
 */
export function loadDeclarativeConfig(
  customPath?: string,
  cwd: string = process.cwd(),
): DeclarativeToolsFile | null {
  const candidatePaths = customPath ? [customPath] : DEFAULT_CONFIG_CANDIDATES

  for (const candidate of candidatePaths) {
    const fullPath = resolve(cwd, candidate)
    if (existsSync(fullPath)) {
      try {
        const rawContent = readFileSync(fullPath, 'utf8')
        const parsed = yaml.load(rawContent) as DeclarativeToolsFile | null
        if (parsed && Array.isArray(parsed.tools)) {
          return parsed
        }
      } catch (error) {
        throw new Error(
          `Failed to parse Dify declarative tools config at ${fullPath}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    }
  }

  return null
}

/**
 * Locate and read the `dify-tools.yaml` file from the filesystem.
 * @param customPath - Optional explicit configuration file path.
 * @param cwd - Working directory for relative path resolution. Defaults to `process.cwd()`.
 * @returns Parsed list of declarative tool entries, or null if no configuration file was found.
 */
export function loadDeclarativeTools(
  customPath?: string,
  cwd: string = process.cwd(),
): DeclarativeToolEntry[] | null {
  return loadDeclarativeConfig(customPath, cwd)?.tools ?? null
}

/**
 * Compile declarative parameter definitions into a `ParameterSchemaSpec` for `defineTool`.
 * @param entry - The declarative tool entry.
 * @returns Unified parameter schema spec accepted by `defineTool`.
 */
export function compileToolParameters(entry: DeclarativeToolEntry): ParameterSchemaSpec {
  const schema: ParameterSchemaSpec = {
    query: {
      type: 'string',
      required: true,
      description: 'The natural language prompt, instruction, or query for the Dify Chatflow.',
    },
  }

  if (entry.parameters) {
    for (const [key, spec] of Object.entries(entry.parameters)) {
      if (spec.type === 'string') {
        schema[key] = {
          type: 'string',
          ...(spec.required ? { required: true } : {}),
          ...(spec.description ? { description: spec.description } : {}),
          ...(spec.enum ? { enum: spec.enum } : {}),
        }
      } else if (spec.type === 'number') {
        schema[key] = {
          type: 'number',
          ...(spec.required ? { required: true } : {}),
          ...(spec.description ? { description: spec.description } : {}),
        }
      } else if (spec.type === 'integer') {
        schema[key] = {
          type: 'integer',
          ...(spec.required ? { required: true } : {}),
          ...(spec.description ? { description: spec.description } : {}),
        }
      } else if (spec.type === 'boolean') {
        schema[key] = {
          type: 'boolean',
          ...(spec.required ? { required: true } : {}),
          ...(spec.description ? { description: spec.description } : {}),
        }
      } else {
        schema[key] = {
          type: 'object',
          additionalProperties: true,
          ...(spec.required ? { required: true } : {}),
          ...(spec.description ? { description: spec.description } : {}),
        }
      }
    }
  }

  schema.conversationId = {
    type: 'string',
    description: 'Optional Dify conversation ID to continue an ongoing conversation.',
  }

  schema.inputs = {
    type: 'object',
    additionalProperties: true,
    description: 'Optional custom variables for the Chatflow start node.',
  }

  return schema
}

/**
 * Map model-provided arguments into Dify start node input variables according to declarations.
 * @param entry - The declarative tool entry.
 * @param rawArgs - Raw arguments object passed by the model.
 * @param query - The normalized query string.
 * @returns Normalized inputs dictionary ready for Dify Chatflow request.
 */
export function prepareDeclarativeInputs(
  entry: DeclarativeToolEntry,
  rawArgs: Record<string, unknown>,
  query: string,
): Record<string, unknown> {
  const finalInputs: Record<string, unknown> = {
    ...(entry.defaultInputs ?? {}),
    ...(typeof rawArgs.inputs === 'object' && rawArgs.inputs !== null
      ? (rawArgs.inputs as Record<string, unknown>)
      : {}),
  }

  if (!entry.parameters) {
    return finalInputs
  }

  // 1. Map explicitly provided arguments
  for (const [paramName, spec] of Object.entries(entry.parameters)) {
    const targetKey = spec.targetInput ?? paramName
    const userVal = rawArgs[paramName]
    if (userVal !== undefined) {
      finalInputs[targetKey] = userVal
    }
  }

  // 2. Apply automatic pattern inference
  for (const [paramName, spec] of Object.entries(entry.parameters)) {
    const targetKey = spec.targetInput ?? paramName
    if (finalInputs[targetKey] === undefined && spec.infer) {
      let shouldInfer = true
      if (spec.infer.when) {
        // Evaluate simple conditions like "user_request === '润色'"
        const match = spec.infer.when.match(/^(\w+)\s*===?\s*['"](.+)['"]$/)
        if (match && match[1] && match[2]) {
          const depField = match[1]
          const depVal = match[2]
          if (finalInputs[depField] !== depVal && rawArgs[depField] !== depVal) {
            shouldInfer = false
          }
        }
      }

      if (shouldInfer && spec.infer.pattern) {
        let matched = false
        for (const [val, patternStr] of Object.entries(spec.infer.pattern)) {
          const reg = new RegExp(patternStr, 'i')
          if (reg.test(query)) {
            finalInputs[targetKey] = val
            matched = true
            break
          }
        }
        if (!matched && spec.infer.default !== undefined) {
          finalInputs[targetKey] = spec.infer.default
        }
      } else if (shouldInfer && spec.infer.default !== undefined) {
        finalInputs[targetKey] = spec.infer.default
      }
    }
  }

  // 3. Apply fallback to query
  for (const [paramName, spec] of Object.entries(entry.parameters)) {
    const targetKey = spec.targetInput ?? paramName
    if (finalInputs[targetKey] === undefined && spec.fallbackToQuery) {
      finalInputs[targetKey] = query
    }
  }

  return finalInputs
}
