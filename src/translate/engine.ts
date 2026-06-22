/**
 * 翻译引擎核心 (移植自 kiss-translator apis/trans.js)
 *
 * 保留: genOpenAI, parseAIRes, parseTransRes, genInit, injectThinking
 * 不取: genClaude/genGemini/genOllama (v2 按需加), genTransReq 的 Hook 系统, stream.js, fetch.js
 * HTTP: 使用 webview 原生 fetch
 */
import { injectThinking, LANG_NAME_MAP } from './config'
import { defaultSystemPrompt, defaultNobatchPrompt, defaultNobatchUserPrompt, genSystemPrompt, genUserPrompt } from './prompts'
import {
  type ApiType,
  type TranslateRequest,
  type TranslateResult,
  type TranslationEngine,
  type GenOpenAIArgs,
  type FetchInit,
  TranslateError,
} from './types'

const logger = {
  info: (msg: string, ...args: unknown[]) => console.info(`[translate/engine] ${msg}`, ...args),
  warn: (msg: string, ...args: unknown[]) => console.warn(`[translate/engine] ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(`[translate/engine] ${msg}`, ...args),
}

/** 剥离 Markdown 代码块标记 (```json ... ```) */
export function stripMarkdownCodeBlock(text: string, startOnly = false): string {
  if (!text) return ''
  let result = text.replace(/^```[a-z]*\s*\n?/i, '')
  if (!startOnly) {
    result = result.replace(/\n?```$/i, '')
  }
  return result
}

/** 解码 HTML 实体 (移植自 html.js, 去除 trustedTypesHelper) */
export function decodeHTMLEntities(str: string): string {
  if (!str || typeof str !== 'string') return str
  const parser = new DOMParser()
  const doc = parser.parseFromString(str, 'text/html')
  return doc.documentElement.textContent || ''
}

/**
 * 强健的大模型翻译结果解析器 (AI Response Robust Parser)
 * 完美解决大模型在翻译时常混杂的 Markdown、未闭合 JSON、XML、数字列表及无规换行文本的纠错与规避。
 * @param raw 大模型返回的原始字符串内容
 * @param useBatchFetch 是否为批量翻译模式
 * @returns 解析后的双元组列表 [译文, 源语言检测结果]
 */
export function parseAIRes(raw: string, useBatchFetch = true): Array<[string, string]> {
  if (!raw) return []

  // 纯覆盖单段模式, 直接包装返回
  if (!useBatchFetch) {
    return [[decodeHTMLEntities(raw), '']]
  }

  // 剥离 Markdown 常用的 ```json...``` 代码块包裹
  const content = stripMarkdownCodeBlock(raw).trim()

  // 1. 尝试以 JSON 格式提取与纠错
  try {
    const start = content.search(/(\{|\[)/)
    // 取 } 和 ] 的最右位置, 兼容 JSON 对象和数组两种形式
    const end = Math.max(content.lastIndexOf('}'), content.lastIndexOf(']'))
    if (start > -1 && end > -1) {
      const jsonStr = content.substring(start, end + 1)
      const parsed = JSON.parse(jsonStr)
      const list = Array.isArray(parsed)
        ? parsed
        : parsed.translations || (parsed.result ? [parsed.result] : [parsed])
      if (list.length > 0 && (list[0].text !== undefined || list[0].translations)) {
        return list.map((item: any) => [
          decodeHTMLEntities(String(item.text || '')),
          String(item.sourceLanguage || ''),
        ])
      }
    }
  } catch {
    // 忽略异常, 平滑降级到 XML 尝试
  }

  // 2. 尝试以 XML 标签格式解析 (如 <t>...</t> 或 <seg>...</seg> 块)
  const xmlTagPattern = /<(t|item|seg)\b/i
  if (xmlTagPattern.test(content)) {
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(content, 'text/html')
      const elements = doc.querySelectorAll('t, item, seg')
      if (elements.length > 0) {
        return Array.from(elements).map((el) => [
          (el as HTMLElement).innerHTML.trim(),
          el.getAttribute('sourceLanguage') || '',
        ])
      }
    } catch {
      // 忽略, 降级到纯文本多级备用
    }
  }

  // 3. 兜底策略: 纯文本单行/带序号和管道符按行切割解析 (例如 "1 | 译文" 格式)
  return content.split('\n').map((line) => {
    const pipeMatch = line.match(/^\d+\s*\|\s*(.*)/)
    if (pipeMatch) {
      return [decodeHTMLEntities(pipeMatch[1].trim()), '']
    }
    const text = decodeHTMLEntities(line.replace(/<br\s*\/?>/gi, '\n').trim())
    return [text, '']
  })
}

/**
 * 构建 OpenAI 兼容协议请求 (覆盖 10+ 服务商)
 */
export function genOpenAI(args: GenOpenAIArgs): { url: string; body: Record<string, unknown>; headers: Record<string, string>; userMsg: { role: string; content: string } } {
  const { url, key, systemPrompt, userPrompt, model, temperature, maxTokens, useStream = false, apiType, thinkingMode, thinkingEffort } = args
  const userMsg = { role: 'user', content: userPrompt }
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      userMsg,
    ],
    temperature,
    max_completion_tokens: maxTokens,
    stream: useStream,
  }

  injectThinking(body, apiType, thinkingMode, thinkingEffort)

  const headers: Record<string, string> = {
    'Content-type': 'application/json',
    Authorization: `Bearer ${key}`,
  }

  return { url, body, headers, userMsg }
}

/**
 * 构建统一的 Fetch init 对象
 */
export function genInit({ url, body, headers, userMsg, method = 'POST' }: {
  url: string
  body?: Record<string, unknown> | null
  headers?: Record<string, string>
  userMsg?: { role: string; content: string }
  method?: string
}): FetchInit {
  if (!url) throw new TranslateError('genInit: url is empty', 'config')
  const init: RequestInit = { method, headers: headers || {} }
  if (method !== 'GET' && method !== 'HEAD' && body) {
    init.body = JSON.stringify(body)
  }
  return { url, init, userMsg }
}

/**
 * 解析翻译接口返回数据 (按 apiType 分发)
 * 仅保留 OpenAI 兼容协议族解析; 机器翻译分支已移除。
 */
export async function parseTransRes(
  res: any,
  opts: { useBatchFetch: boolean; apiType: ApiType },
): Promise<Array<[string, string]>> {
  const { useBatchFetch, apiType } = opts

  switch (apiType) {
    case 'OpenAI':
    case 'DeepSeek':
    case 'SiliconFlow':
    case 'XiaomiMimo':
    case 'AliyunBailian':
    case 'Cerebras':
    case 'Zai':
    case 'ePhoneAI':
    case 'OpenRouter':
    case 'Ollama':
    case 'Gemini2':
    case 'Custom': {
      const modelMsg = res?.choices?.[0]?.message
      return parseAIRes(modelMsg?.content ?? '', useBatchFetch)
    }
    default:
      throw new TranslateError(`parse translate result: apiType "${apiType}" not matched`, 'parse')
  }
}

/** 将语言代码映射为服务商所需的语言名称 (AI 服务商用名称) */
function resolveLangSpec(code: string): string {
  return LANG_NAME_MAP.get(code) || code
}

/** OpenAI 兼容协议引擎实现 */
export class OpenAICompatibleEngine implements TranslationEngine {
  async translate(input: TranslateRequest): Promise<TranslateResult[]> {
    const { texts, sourceLang, targetLang, config, signal, docInfo, tone, glossary } = input

    logger.info(`[engine.translate] ═══ 进入 ═══ texts.length=${texts.length}, targetLang=${targetLang}, sourceLang=${sourceLang}, apiType=${config.apiType}, model=${config.model}, useBatchFetch=${config.useBatchFetch}`)
    logger.info(`[engine.translate] apiUrl=${config.apiUrl}, apiKey=${config.apiKey ? '已设置(长度' + config.apiKey.length + ')' : '未设置'}`)
    logger.info(`[engine.translate] texts预览: "${texts[0]?.slice(0, 60)}..."`)

    if (!config.apiUrl) throw new TranslateError('翻译引擎未配置 API URL', 'config')
    if (!config.apiKey && config.apiType !== 'Ollama') {
      throw new TranslateError('翻译引擎未配置 API Key', 'config')
    }
    if (texts.length === 0) return []

    const fromLang = sourceLang || 'auto'
    const toLang = targetLang
    const from = resolveLangSpec(fromLang)
    const to = resolveLangSpec(toLang)

    // 构建提示词
    const systemPrompt = genSystemPrompt({
      systemPrompt: config.useBatchFetch ? defaultSystemPrompt : defaultNobatchPrompt,
      tone,
      from,
      to,
      fromLang,
      toLang,
      texts,
      docInfo,
    })
    const userPrompt = genUserPrompt({
      nobatchUserPrompt: defaultNobatchUserPrompt,
      useBatchFetch: config.useBatchFetch,
      tone,
      glossary,
      from,
      to,
      fromLang,
      toLang,
      texts,
      docInfo,
    })

    logger.info(`[engine.translate] 提示词构建完成: systemPrompt长度=${systemPrompt.length}, userPrompt长度=${userPrompt.length}, systemPrompt预览="${systemPrompt.slice(0, 80)}..."`)
    logger.info(`[engine.translate] userPrompt预览="${userPrompt.slice(0, 80)}..."`)

    // 构建请求
    const { url, body, headers, userMsg } = genOpenAI({
      url: config.apiUrl,
      key: config.apiKey,
      systemPrompt,
      userPrompt,
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      useStream: false,
      apiType: config.apiType,
      thinkingMode: config.thinkingMode,
      thinkingEffort: config.thinkingEffort,
    })

    const { init } = genInit({ url, body, headers, userMsg })

    logger.info(`[engine.translate] 请求URL=${url}`)
    logger.info(`[engine.translate] 请求body(序列化前): model=${body.model}, temperature=${body.temperature}, maxTokens=${body.max_tokens}, messages.length=${(body.messages as any[])?.length}`)
    const bodyStr = JSON.stringify(body)
    logger.info(`[engine.translate] 请求body大小=${bodyStr.length}字符`)

    // 发起请求
    let response: Response
    try {
      logger.info(`[engine.translate] 开始fetch请求...`)
      const fetchStart = Date.now()
      response = await fetch(url, init)
      const fetchElapsed = Date.now() - fetchStart
      logger.info(`[engine.translate] fetch请求完成: 耗时=${fetchElapsed}ms, status=${response.status}, statusText=${response.statusText}, ok=${response.ok}`)
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        logger.warn(`[engine.translate] fetch被abort`)
        throw err
      }
      logger.error(`[engine.translate] 网络请求失败: ${err?.message || err}`)
      throw new TranslateError(`网络请求失败: ${err?.message || err}`, 'network')
    }

    if (signal?.aborted) {
      logger.warn(`[engine.translate] 收到信号后signal已aborted`)
      throw new DOMException('The operation was aborted.', 'AbortError')
    }

    // 处理 HTTP 状态码
    if (!response.ok) {
      const status = response.status
      let code: TranslateError['code'] = 'unknown'
      let msg = `HTTP ${status}`
      if (status === 401 || status === 403) {
        code = 'auth'
        msg = `鉴权失败 (${status}), 请检查 API Key`
      } else if (status === 429) {
        code = 'rate_limit'
        msg = `请求被限流 (429), 请稍后重试`
      } else if (status >= 500) {
        code = 'network'
        msg = `服务端错误 (${status})`
      }
      // 尝试读取错误体
      try {
        const errBody = await response.text()
        if (errBody) {
          const truncated = errBody.slice(0, 500)
          msg += `: ${truncated}`
          logger.error(`[engine.translate] HTTP错误响应体: ${truncated}`)
        }
      } catch { /* ignore */ }
      logger.error(`[engine.translate] HTTP错误: code=${code}, status=${status}, msg="${msg.slice(0, 300)}"`)
      throw new TranslateError(msg, code, status)
    }

    // 解析响应
    let resJson: any
    let rawText: string
    try {
      logger.info(`[engine.translate] 开始解析响应JSON...`)
      rawText = await response.text()
      resJson = JSON.parse(rawText)
      logger.info(`[engine.translate] 响应JSON解析成功: 原始大小=${rawText.length}字符`)
      logger.info(`[engine.translate] 响应结构keys=${Object.keys(resJson).join(', ')}`)
      if (resJson.usage) {
        logger.info(`[engine.translate] token用量: ${JSON.stringify(resJson.usage)}`)
      }
      if (resJson.choices) {
        logger.info(`[engine.translate] choices数量=${resJson.choices.length}`)
        resJson.choices.forEach((c: any, i: number) => {
          logger.info(`[engine.translate] choice[${i}]: finish_reason=${c.finish_reason}, content长度=${c.message?.content?.length || 0}`)
        })
      }
    } catch (err: any) {
      logger.error(`[engine.translate] 响应JSON解析失败: ${err?.message || err}`)
      throw new TranslateError(`响应 JSON 解析失败: ${err?.message || err}`, 'parse')
    }

    if (signal?.aborted) {
      logger.warn(`[engine.translate] 解析后signal已aborted`)
      throw new DOMException('The operation was aborted.', 'AbortError')
    }

    const parseStart = Date.now()
    const result = await parseTransRes(resJson, {
      useBatchFetch: config.useBatchFetch,
      apiType: config.apiType,
    })
    logger.info(`[engine.translate] parseTransRes完成: 耗时=${Date.now() - parseStart}ms, 结果数=${result.length}`)

    if (!result || result.length === 0) {
      logger.error(`[engine.translate] 未返回有效译文, 抛出empty错误`)
      throw new TranslateError('未返回有效译文', 'empty')
    }

    // 映射为 TranslateResult[]
    const mapped = result.map(([text, detected]) => ({
      text: text || '',
      detectedSourceLang: detected || undefined,
    }))

    logger.info(`[engine.translate] 翻译完成: 返回${mapped.length}条结果, 首条译文预览="${mapped[0]?.text?.slice(0, 60)}..."`)
    return mapped
  }
}

/** 单例引擎实例 (v1 仅 OpenAI 兼容) */
export const engine = new OpenAICompatibleEngine()

/** 简易翻译入口 (供 service 层调用) */
export async function translate(input: TranslateRequest): Promise<TranslateResult[]> {
  return engine.translate(input)
}

// 防止 logger 被误判为未使用
void logger
