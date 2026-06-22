/**
 * 翻译引擎统一导出 (移植自 kiss-translator)
 *
 * 模块结构:
 *  - types.ts    类型定义 (ApiType, TranslationEngine, TranslateRequest/Result, TranslateError)
 *  - config.ts   服务商常量 + 语言映射 + 默认配置 + injectThinking
 *  - prompts.ts  默认提示词模板 + genSystemPrompt/genUserPrompt
 *  - engine.ts   genOpenAI + parseAIRes + parseTransRes + OpenAICompatibleEngine
 */
export * from './types'
export * from './config'
export * from './prompts'
export {
  OpenAICompatibleEngine,
  engine,
  translate,
  genOpenAI,
  genInit,
  parseAIRes,
  parseTransRes,
  stripMarkdownCodeBlock,
  decodeHTMLEntities,
} from './engine'
