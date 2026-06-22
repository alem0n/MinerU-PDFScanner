/**
 * 翻译服务层 (TranslateService)
 *
 * 职责: 配置持久化、请求缓存、并发控制、重试机制、超时控制、用户取消。
 * 对 UI 层只暴露 translateService, 不直接接触 translate/ 引擎层。
 *
 * 遵循项目现有 service 模式: 类 + 单例 + SettingsStore 持久化。
 */
import { SettingsStore } from '@/lib/storage'
import { clearCache } from 'ahooks'
import {
  type TranslationEngineConfig,
  type TranslateRequest,
  type TranslateResult,
  type ApiType,
  TranslateError,
  getProviderDefaults,
  engine,
} from '@/translate'
import { createLogger } from '@/utils/logger'

const logger = createLogger('TranslateService')

/** 用户可配置的翻译设置 (持久化到 SettingsStore('translate')) */
export interface TranslateConfig {
  /** 是否启用翻译功能 */
  enabled: boolean
  /** 服务商类型 */
  apiType: ApiType
  /** API URL */
  apiUrl: string
  /** API Key */
  apiKey: string
  /** 模型名称 */
  model: string
  /** 源语言代码 (空=自动检测) */
  sourceLang: string
  /** 目标语言代码 */
  targetLang: string
  /** 温度 (翻译需稳定, 默认 0.2) */
  temperature: number
  /** 最大 tokens */
  maxTokens: number
  /** 是否批量翻译 (v1 默认 false, 逐段更稳) */
  useBatchFetch: boolean
  /** 并发数 */
  concurrency: number
  /** 单请求超时 (ms) */
  timeoutMs: number
  /** 重试次数 */
  retryTimes: number
  /** 超长文本分段阈值 (字符数) */
  maxChunkChars: number
  /** 推理模式 */
  thinkingMode: 'auto' | 'enabled' | 'disabled'
  /** 推理强度 */
  thinkingEffort: string
}

/** 默认翻译配置 */
export const DEFAULT_TRANSLATE_CONFIG: TranslateConfig = {
  enabled: false,
  apiType: 'DeepSeek',
  apiUrl: 'https://api.deepseek.com/chat/completions',
  apiKey: '',
  model: 'deepseek-chat',
  sourceLang: 'auto',
  targetLang: 'zh-CN',
  temperature: 0.2,
  maxTokens: 4096,
  useBatchFetch: false,
  concurrency: 3,
  timeoutMs: 30000,
  retryTimes: 3,
  maxChunkChars: 3000,
  thinkingMode: 'auto',
  thinkingEffort: '_default',
}

/** 翻译选项 (每次调用可覆盖配置) */
export interface TranslateOptions {
  /** 取消信号 */
  signal?: AbortSignal
  /** 文档上下文 */
  docInfo?: import('@/translate').DocInfo
  /** 翻译风格 */
  tone?: string
  /** 术语表 */
  glossary?: Record<string, string>
  /** 是否跳过缓存 (强制重译) */
  skipCache?: boolean
}

/** 简易并发信号量 */
class Semaphore {
  private running = 0
  private queue: Array<() => void> = []
  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.max) {
      this.running++
      return
    }
    await new Promise<void>((resolve) => this.queue.push(resolve))
    this.running++
  }

  release(): void {
    this.running--
    const next = this.queue.shift()
    if (next) next()
  }

  /** 动态调整并发上限 */
  setMax(max: number): void {
    this.max = max
  }
}

export class TranslateService {
  private store: SettingsStore<TranslateConfig>
  private requestCache: Map<string, TranslateResult[]>
  private semaphore: Semaphore

  constructor() {
    this.store = new SettingsStore<TranslateConfig>('translate')
    this.requestCache = new Map()
    this.semaphore = new Semaphore(DEFAULT_TRANSLATE_CONFIG.concurrency)
  }

  /** 加载翻译配置 (从持久化存储读取，带默认值合并) */
  async getConfig(): Promise<TranslateConfig> {
    const data = await this.store.get()
    const cfg = { ...DEFAULT_TRANSLATE_CONFIG, ...data }
    // 同步并发上限
    this.semaphore.setMax(cfg.concurrency)
    logger.info(`config loaded: apiType=${cfg.apiType}, targetLang=${cfg.targetLang}`)
    return cfg
  }

  /** 保存翻译配置 (写入持久化存储) */
  async saveConfig(config: TranslateConfig): Promise<void> {
    logger.info(`config saved: apiType=${config.apiType}, targetLang=${config.targetLang}`)
    this.semaphore.setMax(config.concurrency)
    clearCache('TRANSLATE_CONFIG')
    await this.store.set(config)
  }

  /** 检查引擎是否可用 (配置完整) */
  async isConfigured(): Promise<boolean> {
    const cfg = await this.getConfig()
    if (!cfg.enabled) return false
    if (!cfg.apiUrl) return false
    if (!cfg.apiKey && cfg.apiType !== 'Ollama') return false
    return true
  }

  /** 构建 TranslationEngineConfig */
  private buildEngineConfig(cfg: TranslateConfig): TranslationEngineConfig {
    return {
      apiType: cfg.apiType,
      apiUrl: cfg.apiUrl,
      apiKey: cfg.apiKey,
      model: cfg.model,
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
      useBatchFetch: cfg.useBatchFetch,
      thinkingMode: cfg.thinkingMode,
      thinkingEffort: cfg.thinkingEffort as any,
    }
  }

  /** 生成缓存键 */
  private cacheKey(text: string, targetLang: string, cfg: TranslateConfig): string {
    return `${text}::${targetLang}::${cfg.apiType}::${cfg.model}`
  }

  /**
   * 翻译入口 (带缓存、并发、重试、超时)
   * @param texts 待翻译文本数组
   * @param options 翻译选项
   * @returns 与 texts 等长的 TranslateResult 数组
   */
  async translate(texts: string[], options: TranslateOptions = {}): Promise<TranslateResult[]> {
    if (texts.length === 0) return []

    const cfg = await this.getConfig()
    if (!(await this.isConfigured())) {
      throw new TranslateError('翻译引擎未配置, 请先在设置中配置', 'config')
    }

    // 单段翻译: 检查缓存
    if (texts.length === 1 && !options.skipCache) {
      const key = this.cacheKey(texts[0], cfg.targetLang, cfg)
      const cached = this.requestCache.get(key)
      if (cached) {
        logger.debug(`cache hit: "${texts[0].slice(0, 30)}..."`)
        return cached
      }
    }

    // 并发控制
    await this.semaphore.acquire()
    try {
      const result = await this.translateWithRetry(texts, cfg, options)

      // 写入缓存 (单段)
      if (texts.length === 1) {
        const key = this.cacheKey(texts[0], cfg.targetLang, cfg)
        this.requestCache.set(key, result)
      }

      return result
    } finally {
      this.semaphore.release()
    }
  }

  /** 带重试的翻译 */
  private async translateWithRetry(
    texts: string[],
    cfg: TranslateConfig,
    options: TranslateOptions,
  ): Promise<TranslateResult[]> {
    const { retryTimes, timeoutMs } = cfg
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= retryTimes; attempt++) {
      // 检查取消
      if (options.signal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError')
      }

      // 构建带超时的 AbortController
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

      // 链接外部 signal
      const externalSignal = options.signal
      const onExternalAbort = () => controller.abort()
      if (externalSignal) {
        if (externalSignal.aborted) controller.abort()
        else externalSignal.addEventListener('abort', onExternalAbort, { once: true })
      }

      try {
        const request: TranslateRequest = {
          texts,
          sourceLang: cfg.sourceLang,
          targetLang: cfg.targetLang,
          config: this.buildEngineConfig(cfg),
          signal: controller.signal,
          docInfo: options.docInfo,
          tone: options.tone,
          glossary: options.glossary,
        }

        const result = await engine.translate(request)
        clearTimeout(timeoutId)
        if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort)
        return result
      } catch (err: any) {
        clearTimeout(timeoutId)
        if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort)

        // AbortError 不重试
        if (err?.name === 'AbortError') {
          if (externalSignal?.aborted) throw err
          // 超时 abort → 可重试
        }

        // 鉴权错误不重试
        if (err instanceof TranslateError && err.code === 'auth') {
          throw err
        }

        lastError = err
        logger.warn(`translate attempt ${attempt + 1}/${retryTimes + 1} failed: ${err?.message || err}`)

        // 最后一次不等待
        if (attempt < retryTimes) {
          const isRateLimit = err instanceof TranslateError && err.code === 'rate_limit'
          const baseDelay = isRateLimit ? 4000 : 1000
          const delay = baseDelay * Math.pow(2, attempt)
          await new Promise((r) => setTimeout(r, delay))
        }
      }
    }

    throw lastError || new TranslateError('翻译失败: 重试次数耗尽', 'unknown')
  }

  /** 清除请求缓存 */
  clearCache(): void {
    this.requestCache.clear()
    logger.info('request cache cleared')
  }

  /** 选择服务商时自动填入默认 URL/Model */
  applyProviderDefaults(apiType: ApiType, current: Partial<TranslateConfig>): { apiUrl: string; model: string } {
    const defaults = getProviderDefaults(apiType)
    return {
      apiUrl: current.apiUrl || defaults.url,
      model: current.model || defaults.model,
    }
  }
}

/** 单例 */
export const translateService = new TranslateService()
