/**
 * 翻译服务商常量 + 语言映射 + 默认配置 (移植自 kiss-translator config/api.js)
 *
 * 仅保留 OpenAI 兼容协议族与 AI 翻译相关部分; 机器翻译 (Google/MS/DeepL/Baidu) 不移植。
 */
import type { ApiType, ThinkingMode, TranslationEngineConfig } from './types'

/** 服务商元数据: 默认 URL + 模型 + 是否 OpenAI 兼容 */
export interface ProviderMeta {
  apiType: ApiType
  label: string
  defaultUrl: string
  defaultModel: string
  /** 是否在 v1 通过 genOpenAI 覆盖 (true=已支持, false=预留) */
  supported: boolean
}

/** OpenAI 兼容协议族服务商清单 */
export const PROVIDERS: ProviderMeta[] = [
  { apiType: 'OpenAI', label: 'OpenAI', defaultUrl: 'https://api.openai.com/v1/chat/completions', defaultModel: 'gpt-4', supported: true },
  { apiType: 'DeepSeek', label: 'DeepSeek', defaultUrl: 'https://api.deepseek.com/chat/completions', defaultModel: 'deepseek-chat', supported: true },
  { apiType: 'SiliconFlow', label: 'SiliconFlow 硅基流动', defaultUrl: 'https://api.siliconflow.cn/v1/chat/completions', defaultModel: 'Pro/zai-org/GLM-4.7', supported: true },
  { apiType: 'AliyunBailian', label: '阿里百炼', defaultUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', defaultModel: 'qwen-plus', supported: true },
  { apiType: 'Zai', label: '智谱 GLM', defaultUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', defaultModel: 'glm-4.6', supported: true },
  { apiType: 'Cerebras', label: 'Cerebras', defaultUrl: 'https://api.cerebras.ai/v1/chat/completions', defaultModel: 'gpt-oss-120b', supported: true },
  { apiType: 'OpenRouter', label: 'OpenRouter', defaultUrl: 'https://openrouter.ai/api/v1/chat/completions', defaultModel: 'openai/gpt-4o', supported: true },
  { apiType: 'Ollama', label: 'Ollama (本地)', defaultUrl: 'http://localhost:11434/v1/chat/completions', defaultModel: 'llama3.1', supported: true },
  { apiType: 'Gemini2', label: 'Gemini (OpenAI 兼容)', defaultUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', defaultModel: 'gemini-2.0-flash', supported: true },
  { apiType: 'ePhoneAI', label: 'ePhoneAI', defaultUrl: 'https://api.ephone.ai/v1/chat/completions', defaultModel: '', supported: true },
  { apiType: 'XiaomiMimo', label: '小米米莫', defaultUrl: 'https://api.xiaomimimo.com/v1/chat/completions', defaultModel: 'mimo-v2.5-pro', supported: true },
  { apiType: 'Custom', label: '自定义 (OpenAI 兼容)', defaultUrl: '', defaultModel: '', supported: true },
]

/** apiType → ProviderMeta 映射 */
export const PROVIDER_MAP: Record<string, ProviderMeta> = Object.fromEntries(
  PROVIDERS.map((p) => [p.apiType, p]),
)

/** 目标语言选项 [code, label] */
export const TARGET_LANGS: [string, string][] = [
  ['en', 'English'],
  ['zh-CN', '简体中文'],
  ['zh-TW', '繁體中文'],
  ['ja', '日本語'],
  ['ko', '한국어'],
  ['fr', 'Français'],
  ['de', 'Deutsch'],
  ['es', 'Español'],
  ['ru', 'Русский'],
  ['pt', 'Português'],
  ['it', 'Italiano'],
  ['ar', 'العربية'],
  ['th', 'ไทย'],
  ['vi', 'Tiếng Việt'],
]

/** 源语言选项 (含自动检测) */
export const SOURCE_LANGS: [string, string][] = [
  ['auto', '自动检测'],
  ...TARGET_LANGS,
]

/**
 * 语言代码 → 语言名称映射 (AI 服务商用语言名称而非代码)
 * 例如 OpenAI/DeepSeek 用 "Simplified Chinese" 而非 "zh-CN"
 * 这是 kiss-translator 的踩坑经验: 各 AI 服务商对 zh-CN 写法不同, 统一用名称最稳。
 */
export const LANG_NAME_MAP: Map<string, string> = new Map([
  ['en', 'English'],
  ['zh-CN', 'Simplified Chinese'],
  ['zh-TW', 'Traditional Chinese'],
  ['ja', 'Japanese'],
  ['ko', 'Korean'],
  ['fr', 'French'],
  ['de', 'German'],
  ['es', 'Spanish'],
  ['ru', 'Russian'],
  ['pt', 'Portuguese'],
  ['it', 'Italian'],
  ['ar', 'Arabic'],
  ['th', 'Thai'],
  ['vi', 'Vietnamese'],
  ['auto', 'AutoDetect'],
])

/** 推理参数映射 (各厂商推理链配置统一注入) */
export interface ThinkingParamEntry {
  type: 'deepseek' | 'aliyunbailian' | 'siliconflow' | 'cerebras' | 'openai' | 'openrouter'
  efforts: { value: string; label: string }[] | null
  disableSupported?: boolean
}

export const THINKING_PARAM_MAP: Partial<Record<ApiType, ThinkingParamEntry>> = {
  DeepSeek: {
    type: 'deepseek',
    efforts: [
      { value: 'max', label: 'Max' },
      { value: 'high', label: 'High' },
    ],
  },
  SiliconFlow: {
    type: 'siliconflow',
    efforts: [
      { value: 'max', label: 'Max (32768)' },
      { value: 'high', label: 'High (16384)' },
      { value: 'medium', label: 'Medium (8192)' },
      { value: 'low', label: 'Low (4096)' },
      { value: 'minimal', label: 'Minimal (2048)' },
    ],
  },
  XiaomiMimo: { type: 'deepseek', efforts: null },
  AliyunBailian: { type: 'aliyunbailian', efforts: null },
  Cerebras: {
    type: 'cerebras',
    efforts: [
      { value: 'high', label: 'High' },
      { value: 'medium', label: 'Medium' },
      { value: 'low', label: 'Low' },
    ],
  },
  Zai: { type: 'deepseek', efforts: null },
  ePhoneAI: {
    type: 'openai',
    efforts: [
      { value: 'xhigh', label: 'X-High' },
      { value: 'high', label: 'High' },
      { value: 'medium', label: 'Medium' },
      { value: 'low', label: 'Low' },
      { value: 'minimal', label: 'Minimal' },
    ],
  },
  OpenAI: {
    type: 'openai',
    efforts: [
      { value: 'xhigh', label: 'X-High' },
      { value: 'high', label: 'High' },
      { value: 'medium', label: 'Medium' },
      { value: 'low', label: 'Low' },
      { value: 'minimal', label: 'Minimal' },
    ],
  },
  Gemini2: {
    type: 'openai',
    efforts: [
      { value: 'xhigh', label: 'X-High' },
      { value: 'high', label: 'High' },
      { value: 'medium', label: 'Medium' },
      { value: 'low', label: 'Low' },
      { value: 'minimal', label: 'Minimal' },
    ],
  },
  OpenRouter: {
    type: 'openrouter',
    disableSupported: false,
    efforts: [
      { value: 'high', label: 'High' },
      { value: 'medium', label: 'Medium' },
      { value: 'low', label: 'Low' },
      { value: 'minimal', label: 'Minimal' },
    ],
  },
}

/** 硅基流动思考 tokens 额度映射 */
const SILICONFLOW_EFFORT_MAP: Record<string, number> = {
  max: 32768,
  high: 16384,
  medium: 8192,
  low: 4096,
  minimal: 2048,
}

/** 注入推理参数到请求 body (移植自 trans.js injectThinking) */
export function injectThinking(
  body: Record<string, unknown>,
  apiType: ApiType,
  thinkingMode: ThinkingMode,
  thinkingEffort: string,
): void {
  if (thinkingMode === 'auto') return
  const param = THINKING_PARAM_MAP[apiType]
  if (!param) return
  const hasEffort = thinkingEffort && thinkingEffort !== '_default'

  switch (param.type) {
    case 'deepseek':
      ;(body as any).thinking = { type: thinkingMode === 'enabled' ? 'enabled' : 'disabled' }
      if (thinkingMode === 'enabled' && hasEffort) {
        ;(body as any).reasoning_effort = thinkingEffort
      }
      break
    case 'aliyunbailian':
      ;(body as any).enable_thinking = thinkingMode === 'enabled'
      break
    case 'siliconflow':
      ;(body as any).enable_thinking = thinkingMode === 'enabled'
      if (thinkingMode === 'enabled' && hasEffort) {
        ;(body as any).thinking_budget = SILICONFLOW_EFFORT_MAP[thinkingEffort] || 8192
      }
      break
    case 'cerebras':
      if (thinkingMode === 'disabled') {
        ;(body as any).reasoning_effort = 'none'
      } else if (hasEffort) {
        ;(body as any).reasoning_effort = thinkingEffort
      }
      break
    case 'openai':
      if (thinkingMode === 'disabled') {
        ;(body as any).reasoning_effort = 'none'
      } else if (thinkingMode === 'enabled' && hasEffort) {
        ;(body as any).reasoning_effort = thinkingEffort
      }
      break
    case 'openrouter':
      if (hasEffort) {
        ;(body as any).reasoning = { effort: thinkingEffort }
      }
      break
  }
}

/** 默认引擎配置 (v1: 逐段非流式, thinkingMode=auto) */
export const DEFAULT_ENGINE_CONFIG: TranslationEngineConfig = {
  apiType: 'DeepSeek',
  apiUrl: 'https://api.deepseek.com/chat/completions',
  apiKey: '',
  model: 'deepseek-chat',
  temperature: 0.2,
  maxTokens: 4096,
  useBatchFetch: false,
  thinkingMode: 'auto',
  thinkingEffort: '_default',
}

/** 根据 apiType 获取默认 URL + Model */
export function getProviderDefaults(apiType: string): { url: string; model: string } {
  const p = PROVIDER_MAP[apiType]
  return { url: p?.defaultUrl ?? '', model: p?.defaultModel ?? '' }
}
