import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import * as difyTool from '../src/index.ts'
import { cleanDifyAnswer } from '../src/client.ts'

describe('dsh-tool-dify', () => {
  const originalFetch = globalThis.fetch
  const testSignal = new AbortController().signal

  async function createTestContext(config: difyTool.Config = {}): Promise<Context> {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(difyTool, {
      toolName: 'dify_chatflow',
      ...config,
    })
    return ctx
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe('cleanDifyAnswer', () => {
    it('strips <processing> and <time_cost> tags while retaining final answer', () => {
      const raw =
        '<processing>问题分析中...</processing>'
        + '<processing>查询分析完成，开始执行知识检索。</processing>'
        + '年终奖的发放资格及金额取决于当年具体的奖金方案。\n'
        + '=== 参考文档 ===\n'
        + 'HR-05-010-S408员工薪资管理规定\n'
        + '<time_cost>28.12 秒</time_cost>'

      const cleaned = cleanDifyAnswer(raw)
      expect(cleaned).not.toContain('<processing>')
      expect(cleaned).not.toContain('</processing>')
      expect(cleaned).not.toContain('<time_cost>')
      expect(cleaned).toContain('年终奖的发放资格及金额取决于当年具体的奖金方案。')
      expect(cleaned).toContain('=== 参考文档 ===')
      expect(cleaned).toContain('HR-05-010-S408员工薪资管理规定')
    })
  })

  describe('tool registration and execution', () => {
    it('registers the `dify_chatflow` tool on ctx.tools as concurrency safe (parallel)', async () => {
      const ctx = await createTestContext({
        endpoint: 'https://api-test.example.com/v1',
        apiKey: 'app-test-key-123',
      })

      const schema = ctx.tools.schemas().find(s => s.name === 'dify_chatflow')
      expect(schema).toBeDefined()
      expect(schema?.description).toContain('Dify Chatflow')
      expect(schema?.description).toContain('parallel')

      const mode = ctx.tools.executionMode({
        signal: testSignal,
        callId: ToolCallId('dify-mode-check'),
        name: 'dify_chatflow',
        arguments: { query: 'test' },
      })
      expect(mode.kind).toBe('parallel')
    })

    it('successfully calls Dify Chatflow and formats output', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          event: 'message',
          task_id: 'task-12345',
          conversation_id: 'conv-67890',
          answer: '<processing>Thinking...</processing>员工薪资由基础薪资和绩效奖金构成。<time_cost>1.2 秒</time_cost>',
        }),
      })
      globalThis.fetch = mockFetch as unknown as typeof fetch

      const ctx = await createTestContext({
        endpoint: 'https://api-test.example.com/v1',
        apiKey: 'app-test-key-123',
        user: 'employee_42',
      })

      const executionResult = await ctx.tools.execute({
        callId: ToolCallId('call-1'),
        name: 'dify_chatflow',
        signal: testSignal,
        arguments: {
          query: '请问薪资结构是什么？',
          conversationId: 'conv-existing',
        },
      })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url, requestInit] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://api-test.example.com/v1/chat-messages')
      expect(requestInit.method).toBe('POST')
      expect(requestInit.headers).toMatchObject({
        'Authorization': 'Bearer app-test-key-123',
        'Content-Type': 'application/json',
      })

      const body = JSON.parse(requestInit.body as string)
      expect(body.query).toBe('请问薪资结构是什么？')
      expect(body.user).toBe('employee_42')
      expect(body.conversation_id).toBe('conv-existing')
      expect(body.inputs).toMatchObject({
        source: '其他',
        sys_type: 'PC端',
      })

      const textBlocks = executionResult.content.filter(c => c.type === 'text')
      expect(textBlocks[0]?.text).toBe('员工薪资由基础薪资和绩效奖金构成。')
    })

    it('returns error result when query is empty', async () => {
      const ctx = await createTestContext({
        endpoint: 'https://api-test.example.com/v1',
        apiKey: 'app-test-key-123',
      })

      const res = await ctx.tools.execute({
        callId: ToolCallId('call-2'),
        name: 'dify_chatflow',
        signal: testSignal,
        arguments: { query: '   ' },
      })

      expect(res.isError).toBe(true)
      expect(res.error?.message).toContain('`query` must be a non-empty string')
    })

    it('handles Dify API error responses gracefully', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ message: 'Invalid API Key' }),
      })
      globalThis.fetch = mockFetch as unknown as typeof fetch

      const ctx = await createTestContext({
        endpoint: 'https://api-test.example.com/v1',
        apiKey: 'app-bad-key',
      })

      const res = await ctx.tools.execute({
        callId: ToolCallId('call-3'),
        name: 'dify_chatflow',
        signal: testSignal,
        arguments: { query: '查询年假' },
      })

      expect(res.isError).toBe(true)
      expect(res.error?.message).toContain('Dify Chatflow API request failed: Invalid API Key')
    })

    it('infers email action and style from query', () => {
      expect(difyTool.inferEmailUserRequest('请帮我总结这封项目邮件')).toBe('总结')
      expect(difyTool.inferEmailUserRequest('回复客户关于发货时间的咨询')).toBe('回复')
      expect(difyTool.inferEmailUserRequest('帮我润色一下英文邮件')).toBe('润色')
      expect(difyTool.inferEmailUserRequest('检查邮件里的语法和拼写错误')).toBe('检查语法')
      expect(difyTool.inferEmailUserRequest('把邮件翻译成中文')).toBe('翻译')
      expect(difyTool.inferEmailUserRequest('写一封给张经理的感谢信')).toBe('代写')

      expect(difyTool.inferHowPolish('请简化表达')).toBe('简化')
      expect(difyTool.inferHowPolish('让内容更精简缩短一点')).toBe('缩短')
      expect(difyTool.inferHowPolish('请详细扩写增长内容')).toBe('增长')
      expect(difyTool.inferHowPolish('以我的语气重写')).toBe('以我的语气重写')
      expect(difyTool.inferHowPolish('提升清晰度')).toBe('提升表达的清晰度')
    })

    it('mounts and executes dify_email_assistant with mapped inputs and fallback', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          event: 'message',
          task_id: 'email-task-1',
          conversation_id: 'email-conv-1',
          answer: '尊敬的张经理：您好！感谢您上周对项目的指导。',
        }),
      })
      globalThis.fetch = mockFetch as unknown as typeof fetch

      const ctx = await createTestContext({
        toolName: 'dify_email_assistant',
        endpoint: 'https://api-test.example.com/v1',
        apiKey: 'app-email-key-456',
      })

      const schema = ctx.tools.schemas().find(s => s.name === 'dify_email_assistant')
      expect(schema).toBeDefined()
      expect(schema?.description).toContain('Email Assistant')

      const res = await ctx.tools.execute({
        callId: ToolCallId('email-call-1'),
        name: 'dify_email_assistant',
        signal: testSignal,
        arguments: {
          query: '代写一封正式的感谢邮件',
          user_request: '代写',
          input_text: '感谢张经理上周对项目的指导',
        },
      })

      expect(res.isError).toBe(false)
      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [, req] = mockFetch.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(req.body as string)
      expect(body.inputs).toMatchObject({
        user_request: '代写',
        Input_Text: '感谢张经理上周对项目的指导',
      })
    })

    it('allows mounting multiple Dify tools concurrently with separate configs', async () => {
      const ctx = new Context()
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)

      await ctx.plugin(difyTool, {
        toolName: 'dify_knowledge_qa',
        endpoint: 'https://api-test.example.com/v1',
        apiKey: 'app-knowledge-key',
      })
      await ctx.plugin(difyTool, {
        toolName: 'dify_email_assistant',
        endpoint: 'https://api-test.example.com/v1',
        apiKey: 'app-email-key',
      })

      const schemas = ctx.tools.schemas()
      const knowledgeTool = schemas.find(s => s.name === 'dify_knowledge_qa')
      const emailTool = schemas.find(s => s.name === 'dify_email_assistant')

      expect(knowledgeTool).toBeDefined()
      expect(emailTool).toBeDefined()
      expect(knowledgeTool?.description).toContain('HR policies')
      expect(emailTool?.description).toContain('Email Assistant')

      // Verify that parameter schemas are isolated per tool
      const knowledgeProps = (knowledgeTool?.parameters as { properties?: Record<string, unknown> })?.properties ?? {}
      const emailProps = (emailTool?.parameters as { properties?: Record<string, unknown> })?.properties ?? {}
      expect(knowledgeProps.query).toBeDefined()
      expect(knowledgeProps.user_request).toBeUndefined()
      expect(knowledgeProps.input_text).toBeUndefined()

      expect(emailProps.query).toBeDefined()
      expect(emailProps.user_request).toBeDefined()
      expect(emailProps.input_text).toBeDefined()
      expect(emailProps.how_polish).toBeDefined()
    })

    it('loads and registers declarative tools automatically from dify-tools.yaml', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          event: 'message',
          task_id: 'declarative-task-1',
          conversation_id: 'conv-dec-1',
          answer: '邮件内容：感谢您的支持。',
        }),
      })
      globalThis.fetch = mockFetch as unknown as typeof fetch

      const ctx = new Context()
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(difyTool)

      const schemas = ctx.tools.schemas()
      const knowledgeTool = schemas.find(s => s.name === 'dify_knowledge_qa')
      const emailTool = schemas.find(s => s.name === 'dify_email_assistant')
      const jomooRagTool = schemas.find(s => s.name === 'dify_jomoo_rag')

      expect(knowledgeTool).toBeDefined()
      expect(emailTool).toBeDefined()
      expect(jomooRagTool).toBeDefined()
      expect(jomooRagTool?.description).toContain('九牧知识库RAG')

      process.env.DIFY_EMAIL_API_KEY = 'app-test-email'
      process.env.DIFY_JOMOO_RAG_API_KEY = 'app-test-jomoo-rag'
      process.env.DIFY_API_ENDPOINT = 'https://api-test.example.com/v1'

      const res = await ctx.tools.execute({
        callId: ToolCallId('dec-call-1'),
        name: 'dify_email_assistant',
        signal: testSignal,
        arguments: {
          query: '请帮我写一封感谢信：感谢上周支持',
        },
      })

      expect(res.isError).toBe(false)
      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [, req] = mockFetch.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(req.body as string)
      expect(body.inputs.user_request).toBe('代写')
      expect(body.inputs.Input_Text).toBe('请帮我写一封感谢信：感谢上周支持')

      const ragRes = await ctx.tools.execute({
        callId: ToolCallId('dec-call-2'),
        name: 'dify_jomoo_rag',
        signal: testSignal,
        arguments: {
          query: '九牧卫浴智能马桶安装规范',
        },
      })

      expect(ragRes.isError).toBe(false)
      expect(mockFetch).toHaveBeenCalledTimes(2)
      const [, ragReq] = mockFetch.mock.calls[1] as [string, RequestInit]
      const ragBody = JSON.parse(ragReq.body as string)
      expect(ragBody.inputs).toMatchObject({
        chatType: 'JM_RAG',
        search_model: '0',
        deepSearch: '0',
      })
    })

    it('registers system prompt guidance section including todo tracking and ask_user_question confirmation gate when systemPrompt service is present', async () => {
      const ctx = new Context()
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(difyTool)

      const assembly = await ctx.systemPrompt.assemble()
      const difySection = assembly.sections.find(s => s.name === 'tool:dify:guidance')
      expect(difySection).toBeDefined()
      expect(difySection?.text).toContain('Dify Enterprise Tools Guidance')
      expect(difySection?.text).toContain('Visual DAG Orchestration')
      expect(difySection?.text).toContain('Mermaid flowchart')
      expect(difySection?.text).toContain('ask_user_question')
      expect(difySection?.text).toContain('确认执行 (Recommended)')
      expect(difySection?.text).toContain('todo_write')
      expect(difySection?.text).toContain('dify_knowledge_qa')
      expect(difySection?.text).toContain('dify_jomoo_rag')
      expect(difySection?.text).toContain('dify_email_assistant')
    })
  })
})
