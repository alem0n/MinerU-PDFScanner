/**
 * parseAIRes 单元测试 (移植验证)
 *
 * 验证 parseAIRes 对大模型返回的三种格式 (JSON/XML/行格式) 均能正确解析,
 * 以及对混杂 Markdown 代码块包裹、引导语、未闭合 JSON 的纠错能力。
 *
 * 运行: npx vitest run src/translate/parseAIRes.test.ts
 */
import { describe, it, expect } from 'vitest'
import { parseAIRes, stripMarkdownCodeBlock, decodeHTMLEntities } from './engine'

describe('stripMarkdownCodeBlock', () => {
  it('剥离 ```json 代码块包裹', () => {
    expect(stripMarkdownCodeBlock('```json\n{"a":1}\n```')).toBe('{"a":1}')
  })
  it('剥离 ```xml 代码块包裹', () => {
    expect(stripMarkdownCodeBlock('```xml\n<root></root>\n```')).toBe('<root></root>')
  })
  it('startOnly 仅剥离开头', () => {
    expect(stripMarkdownCodeBlock('```json\n{"a":1}\n```', true)).toBe('{"a":1}\n```')
  })
  it('空文本返回空字符串', () => {
    expect(stripMarkdownCodeBlock('')).toBe('')
  })
})

describe('decodeHTMLEntities', () => {
  it('解码常见实体', () => {
    expect(decodeHTMLEntities('&amp;')).toBe('&')
    expect(decodeHTMLEntities('&lt;')).toBe('<')
    expect(decodeHTMLEntities('&gt;')).toBe('>')
  })
  it('非字符串原样返回', () => {
    expect(decodeHTMLEntities('' as string)).toBe('')
  })
})

describe('parseAIRes - 单段模式 (useBatchFetch=false)', () => {
  it('直接包装返回原文', () => {
    const result = parseAIRes('你好世界', false)
    expect(result).toHaveLength(1)
    expect(result[0][0]).toBe('你好世界')
  })

  it('空文本返回空数组', () => {
    expect(parseAIRes('', false)).toHaveLength(0)
  })
})

describe('parseAIRes - 批量 JSON 格式', () => {
  it('标准 translations 数组', () => {
    const raw = JSON.stringify({
      translations: [
        { id: 1, text: '你好', sourceLanguage: 'en' },
        { id: 2, text: '世界', sourceLanguage: 'en' },
      ],
    })
    const result = parseAIRes(raw, true)
    expect(result).toHaveLength(2)
    expect(result[0][0]).toBe('你好')
    expect(result[0][1]).toBe('en')
    expect(result[1][0]).toBe('世界')
  })

  it('剥离 ```json 代码块包裹', () => {
    const raw = '```json\n{"translations":[{"id":1,"text":"你好","sourceLanguage":"en"}]}\n```'
    const result = parseAIRes(raw, true)
    expect(result).toHaveLength(1)
    expect(result[0][0]).toBe('你好')
  })

  it('带引导语的 JSON 提取', () => {
    const raw = '好的, 这是翻译结果:\n{"translations":[{"id":1,"text":"你好"}]}'
    const result = parseAIRes(raw, true)
    expect(result).toHaveLength(1)
    expect(result[0][0]).toBe('你好')
  })

  it('裸数组格式', () => {
    const raw = JSON.stringify([{ text: '你好', sourceLanguage: 'en' }])
    const result = parseAIRes(raw, true)
    expect(result).toHaveLength(1)
    expect(result[0][0]).toBe('你好')
  })
})

describe('parseAIRes - XML 标签格式', () => {
  it('解析 <t> 标签', () => {
    const raw = '<root><t id="0" sourceLanguage="en">你好</t><t id="1" sourceLanguage="en">世界</t></root>'
    const result = parseAIRes(raw, true)
    expect(result).toHaveLength(2)
    expect(result[0][0]).toBe('你好')
    expect(result[0][1]).toBe('en')
  })

  it('解析 <seg> 标签', () => {
    const raw = '<seg sourceLanguage="en">你好</seg>'
    const result = parseAIRes(raw, true)
    expect(result).toHaveLength(1)
    expect(result[0][0]).toBe('你好')
  })
})

describe('parseAIRes - 行格式兜底', () => {
  it('带序号和管道符格式', () => {
    const raw = '0 | 你好\n1 | 世界'
    const result = parseAIRes(raw, true)
    expect(result).toHaveLength(2)
    expect(result[0][0]).toBe('你好')
    expect(result[1][0]).toBe('世界')
  })

  it('纯文本按行切割', () => {
    const raw = '你好\n世界'
    const result = parseAIRes(raw, true)
    expect(result).toHaveLength(2)
    expect(result[0][0]).toBe('你好')
    expect(result[1][0]).toBe('世界')
  })

  it('<br> 标签转换为换行', () => {
    const raw = '第一行<br>第二行'
    const result = parseAIRes(raw, true)
    expect(result).toHaveLength(1)
    expect(result[0][0]).toBe('第一行\n第二行')
  })
})

describe('parseAIRes - 边界', () => {
  it('空文本返回空数组', () => {
    expect(parseAIRes('', true)).toHaveLength(0)
  })

  it('未闭合 JSON 降级到行格式', () => {
    const raw = '{"translations":[{"id":1,"text":"你好"}'
    const result = parseAIRes(raw, true)
    // JSON 解析失败, 降级到行格式
    expect(result.length).toBeGreaterThan(0)
  })
})
