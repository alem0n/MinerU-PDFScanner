/**
 * 翻译引擎类型定义 (移植自 kiss-translator)
 *
 * 仅保留 OpenAI 兼容协议族所需类型；Claude/Gemini 原生协议留待 v2 扩展。
 */

/** 翻译服务商标识 (OpenAI 兼容协议族 + 预留) */
export type ApiType =
  | 'OpenAI'
  | 'DeepSeek'
  | 'SiliconFlow'
  | 'XiaomiMimo'
  | 'AliyunBailian'
  | 'Cerebras'
  | 'Zai'
  | 'ePhoneAI'
  | 'OpenRouter'
  | 'Ollama'
  | 'Gemini2'
  | 'Custom'

/** 推理模式 */
export type ThinkingMode = 'auto' | 'enabled' | 'disabled'

/** 推理强度 */
export type ThinkingEffort = '_default' | 'max' | 'xhigh' | 'high' | 'medium' | 'low' | 'minimal'

/** 引擎配置 (持久化到 SettingsStore) */
export interface TranslationEngineConfig {
  apiType: ApiType
  apiUrl: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
  useBatchFetch: boolean
  thinkingMode: ThinkingMode
  thinkingEffort: ThinkingEffort
}

/** 翻译请求 */
export interface TranslateRequest {
  /** 待翻译文本数组 (单段或批量) */
  texts: string[]
  /** 源语言代码, 空字符串=自动检测 */
  sourceLang: string
  /** 目标语言代码, 如 "zh-CN" */
  targetLang: string
  /** 引擎配置 */
  config: TranslationEngineConfig
  /** 取消信号 */
  signal?: AbortSignal
  /** 文档上下文 (可选, 用于提升翻译质量) */
  docInfo?: DocInfo
  /** 翻译风格 (可选) */
  tone?: string
  /** 术语表 (可选) */
  glossary?: Record<string, string>
}

/** 文档上下文 */
export interface DocInfo {
  title?: string
  description?: string
  summary?: string
  context?: string
}

/** 单条翻译结果 */
export interface TranslateResult {
  /** 译文 */
  text: string
  /** 检测到的源语言 */
  detectedSourceLang?: string
}

/** 翻译引擎接口 (可替换扩展点) */
export interface TranslationEngine {
  /** 执行翻译, 返回与输入 texts 等长的结果数组 */
  translate(input: TranslateRequest): Promise<TranslateResult[]>
}

/** 内部: genOpenAI 请求构建参数 */
export interface GenOpenAIArgs {
  url: string
  key: string
  systemPrompt: string
  userPrompt: string
  model: string
  temperature: number
  maxTokens: number
  useStream?: boolean
  apiType: ApiType
  thinkingMode: ThinkingMode
  thinkingEffort: ThinkingEffort
}

/** 内部: fetch init */
export interface FetchInit {
  url: string
  init: RequestInit
  userMsg?: { role: string; content: string }
}

/** 翻译错误类型 */
export class TranslateError extends Error {
  readonly code: 'config' | 'network' | 'timeout' | 'parse' | 'auth' | 'rate_limit' | 'empty' | 'unknown'
  readonly status?: number
  constructor(
    message: string,
    code: TranslateError['code'] = 'unknown',
    status?: number,
  ) {
    super(message)
    this.name = 'TranslateError'
    this.code = code
    this.status = status
  }
}

/** 提示词占位符常量 */
export const INPUT_PLACE_FROM = '{{from}}'
export const INPUT_PLACE_TO = '{{to}}'
export const INPUT_PLACE_FROM_LANG = '{{fromLang}}'
export const INPUT_PLACE_TO_LANG = '{{toLang}}'
export const INPUT_PLACE_TEXT = '{{text}}'
export const INPUT_PLACE_TONE = '{{tone}}'
export const INPUT_PLACE_TITLE = '{{title}}'
export const INPUT_PLACE_DESCRIPTION = '{{description}}'
export const INPUT_PLACE_SUMMARY = '{{summary}}'
export const INPUT_PLACE_CONTEXT = '{{context}}'
export const INPUT_PLACE_GLOSSARY = '{{glossary}}'
