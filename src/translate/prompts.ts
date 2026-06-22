/**
 * 默认提示词模板 + 占位符替换 (移植自 kiss-translator config/api.js + trans.js genSystemPrompt/genUserPrompt)
 *
 * 保留 4 套预设:
 *  - defaultSystemPrompt (批量 JSON 格式, segments[] → translations[])
 *  - defaultNobatchPrompt + defaultNobatchUserPrompt (单段翻译)
 *  - defaultSystemPromptXml / defaultSystemPromptLines (备选, 兼容不同模型输出偏好)
 */
import {
  INPUT_PLACE_FROM,
  INPUT_PLACE_TO,
  INPUT_PLACE_FROM_LANG,
  INPUT_PLACE_TO_LANG,
  INPUT_PLACE_TEXT,
  INPUT_PLACE_TONE,
  INPUT_PLACE_TITLE,
  INPUT_PLACE_DESCRIPTION,
  INPUT_PLACE_SUMMARY,
  INPUT_PLACE_CONTEXT,
  INPUT_PLACE_GLOSSARY,
} from './types'
import type { DocInfo } from './types'

/** 字符串全局替换 (替代 String.replaceAll, 兼容 ES2020 lib) */
const replaceAllStr = (str: string, search: string, replacement: string): string =>
  str.split(search).join(replacement)

/** 系统提示词 (批量 JSON 格式) — PDF 块翻译最匹配 */
export const defaultSystemPrompt = `Act as a translation API. Output a single raw JSON object only. No extra text or fences.

Input:
{"targetLanguage":"<lang>","title":"<context>","description":"<context>","summary":"<context>","segments":[{"id":1,"text":"..."}],"glossary":{"sourceTerm":"targetTerm"},"tone":"<formal|casual>"}

Output:
{"translations":[{"id":1,"text":"...","sourceLanguage":"<detected>"}]}

Rules:
1.  Use title/description for context only; do not output them.
2.  Keep id, order, and count of segments.
3.  Preserve whitespace, HTML entities, and all HTML-like tags (e.g., <i1>, <a1>). Translate inner text only.
4.  Highest priority: Follow 'glossary'. Use value for translation; if value is "", keep the key.
5.  Do not translate: content in <code>, <pre>, text enclosed in backticks, or placeholders like {1}, {{1}}, [1], [[1]].
6.  Apply the specified tone to the translation.
7.  Detect sourceLanguage for each segment.
8.  Return empty or unchanged inputs as is.

Example:
Input: {"targetLanguage":"zh-CN","segments":[{"id":1,"text":"A <b>React</b> component."}],"glossary":{"component":"组件","React":""}}
Output: {"translations":[{"id":1,"text":"一个<b>React</b>组件","sourceLanguage":"en"}]}

Fail-safe: On any error, return {"translations":[]}.`

/** 单段翻译系统提示词 */
export const defaultNobatchPrompt = `You are a professional, authentic machine translation engine.`

/** 单段翻译用户提示词 */
export const defaultNobatchUserPrompt = `# Context
Title: ${INPUT_PLACE_TITLE}
Description: ${INPUT_PLACE_DESCRIPTION}
Summary: ${INPUT_PLACE_SUMMARY}
Tone: ${INPUT_PLACE_TONE}

# Glossary:
${INPUT_PLACE_GLOSSARY}

# Task
Translate the Source Text below to ${INPUT_PLACE_TO}.
1. Use the Context to ensure accuracy.
2. Adapt the wording to match the specified Tone.
3. Output ONLY the translated text. No markdown, no explanations.

Source Text: ${INPUT_PLACE_TEXT}

Translated Text:`

/** 备选: XML 格式系统提示词 */
export const defaultSystemPromptXml = `Act as a translation API. Output raw XML-like format only. No Markdown fences (xml). No conversational filler.

Input:
{"targetLanguage":"<lang>","title":"<context>","description":"<context>","summary":"<context>","segments":[{"id":1,"text":"..."}],"glossary":{"sourceTerm":"targetTerm"},"tone":"<formal|casual>"}

Output Format:
<root>
    <t id="0" sourceLanguage="<detected_source_lang>">Translated text content...</t>
    <t id="1" sourceLanguage="<detected_source_lang>">Translated text content...</t>
</root>

Rules:
1.  Strict Format: Output ONLY the <root> element and its children. Do not include "xml" version declarations or markdown code blocks.
2.  Structure: Maintain the exact "id" from the input in the "id" attribute. Detect the source language for the "sourceLanguage" attribute.
3.  HTML & Whitespace: Preserve all HTML tags (e.g., <b>, <span>, <br>) and whitespace exactly as they appear in the structure. Only translate the text content inside them.
4.  Glossary: Highest priority. Use the glossary value for translation. If the value is "", keep the source term as is.
5.  Do Not Translate: Content inside <code>, <pre>, text in backticks, and placeholders like {1}, {{1}}, [1], [[1]].
6.  Context: Use the "title" and "description" fields to understand the context for better translation accuracy, but do not output them.
7.  Tone: Apply the specified "tone" (formal/casual).

Example:
Input:
{"targetLanguage":"zh-CN","segments":[{"id":0,"text":"Hello <b>World</b>!"}],"glossary":{"World":"世界"},"tone":"formal"}

Output:
<root>
    <t id="0" sourceLanguage="en">你好 <b>世界</b>！</t>
</root>`

/** 备选: 行格式系统提示词 */
export const defaultSystemPromptLines = `Act as a translation API. Output raw text lines in "ID | Text" format. No Markdown. No conversational filler.

Input:
{"targetLanguage":"<lang>","title":"<context>","description":"<context>","summary":"<context>","segments":[{"id":1,"text":"..."}],"glossary":{"sourceTerm":"targetTerm"},"tone":"<formal|casual>"}

Output Format:
<id> | <Translation for Segment>
<id> | <Translation for Segment>
...

Rules:
1.  Strict Format: Output exactly one line per segment using the format: "{id} | {translated_text}".
2.  ID Mapping: You MUST copy the exact "id" from the input segment to the output line.
3.  Newline Handling: If the translated text contains a newline, replace it with the HTML tag "<br>" to ensure it stays on a single line.
4.  Separator: Use the pipe symbol " | " strictly to separate the ID and the text.
5.  Context: Use title/description for context only; do not output them.
6.  HTML/Tags: Preserve whitespace, HTML entities, and all HTML-like tags (e.g., <i1>, <b>). Translate inner text only.
7.  Glossary: Highest priority. Follow 'glossary'. Use value for translation; if value is "", keep the key.
8.  Do Not Translate: content in <code>, <pre>, text enclosed in backticks, or placeholders like {1}, {{1}}, [1].
9.  Tone: Apply the specified tone.

Example:
Input: {"targetLanguage":"zh-CN","segments":[{"id":0,"text":"Hello."},{"id":1,"text":"Line 1\\nLine 2"}],"glossary":{}}
Output:
0 | 你好。
1 | 第一行<br>第二行

Fail-safe: On error, return "{id} | {original_text}" line by line.`

/** 系统提示词生成参数 */
interface PromptArgs {
  systemPrompt: string
  tone?: string
  from: string
  to: string
  fromLang: string
  toLang: string
  texts: string[]
  docInfo?: DocInfo
}

/** 生成系统提示词 (占位符替换) */
export function genSystemPrompt(args: PromptArgs): string {
  const { systemPrompt, tone, from, to, fromLang, toLang, texts, docInfo } = args
  const title = docInfo?.title ?? ''
  const description = docInfo?.description ?? ''
  const summary = docInfo?.summary ?? ''
  let result = String(systemPrompt || '')
  result = replaceAllStr(result, INPUT_PLACE_TITLE, title)
  result = replaceAllStr(result, INPUT_PLACE_DESCRIPTION, description)
  result = replaceAllStr(result, INPUT_PLACE_SUMMARY, summary)
  result = replaceAllStr(result, INPUT_PLACE_CONTEXT, docInfo?.context ?? '')
  result = replaceAllStr(result, INPUT_PLACE_TONE, tone ?? '')
  result = replaceAllStr(result, INPUT_PLACE_FROM, from)
  result = replaceAllStr(result, INPUT_PLACE_TO, to)
  result = replaceAllStr(result, INPUT_PLACE_FROM_LANG, fromLang)
  result = replaceAllStr(result, INPUT_PLACE_TO_LANG, toLang)
  result = replaceAllStr(result, INPUT_PLACE_TEXT, texts[0] ?? '')
  return result
}

/** 用户提示词生成参数 */
interface UserPromptArgs {
  nobatchUserPrompt: string
  useBatchFetch: boolean
  tone?: string
  glossary?: Record<string, string>
  from: string
  to: string
  fromLang: string
  toLang: string
  texts: string[]
  docInfo?: DocInfo
}

/** 生成用户提示词 (批量 JSON 或单段) */
export function genUserPrompt(args: UserPromptArgs): string {
  const { nobatchUserPrompt, useBatchFetch, tone, glossary = {}, from, to, fromLang, toLang, texts, docInfo } = args
  const title = docInfo?.title ?? ''
  const description = docInfo?.description ?? ''
  const summary = docInfo?.summary ?? ''

  if (useBatchFetch) {
    const promptObj: Record<string, unknown> = {
      targetLanguage: toLang,
      segments: texts.map((text, i) => ({ id: i, text })),
    }
    if (title) promptObj.title = title
    if (description) promptObj.description = description
    if (Object.keys(glossary).length !== 0) promptObj.glossary = glossary
    if (tone) promptObj.tone = tone
    return JSON.stringify(promptObj)
  }

  const glossaryStr = Object.entries(glossary)
    .map(([term, definition]) => `- ${term}: ${definition}`)
    .join('\n')

  let result = String(nobatchUserPrompt || '')
  result = replaceAllStr(result, INPUT_PLACE_TITLE, title)
  result = replaceAllStr(result, INPUT_PLACE_DESCRIPTION, description)
  result = replaceAllStr(result, INPUT_PLACE_SUMMARY, summary)
  result = replaceAllStr(result, INPUT_PLACE_CONTEXT, docInfo?.context ?? '')
  result = replaceAllStr(result, INPUT_PLACE_TONE, tone ?? '')
  result = replaceAllStr(result, INPUT_PLACE_GLOSSARY, glossaryStr)
  result = replaceAllStr(result, INPUT_PLACE_FROM, from)
  result = replaceAllStr(result, INPUT_PLACE_TO, to)
  result = replaceAllStr(result, INPUT_PLACE_FROM_LANG, fromLang)
  result = replaceAllStr(result, INPUT_PLACE_TO_LANG, toLang)
  result = replaceAllStr(result, INPUT_PLACE_TEXT, texts[0] ?? '')
  return result
}
