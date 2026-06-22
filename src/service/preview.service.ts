/**
 * Preview 服务 — 基于 Tauri 文件系统 API 的数据接入层
 *
 * 替代源项目中的 Electron IPC 调用（api/tasks.ts、api/collections.ts）。
 * 提供 Preview 组件所需的：PDF 文件查找、block_list.json 读写、文件夹打开、收藏等。
 */
import { readDir, readTextFile, writeFile, exists } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'
import { open } from '@tauri-apps/plugin-shell'
import { convertFileSrc } from '@tauri-apps/api/core'
import type { BlockListData } from '@/shared/types'
import { createLogger } from '@/utils/logger'

const logger = createLogger('preview-service')

/**
 * 在输出目录中查找 PDF 文件。
 * 优先查找 *_origin.pdf（与 blocklist.json 同目录的 origin.pdf 后缀文件），
 * 否则回退到目录中任意 .pdf 文件。
 *
 * @param outputPath 解压输出目录路径
 * @returns { path, url } 或 null（未找到时）
 */
export async function findPdfFile(outputPath: string): Promise<{ path: string; url: string } | null> {
  if (!outputPath) {
    logger.warn('findPdfFile: outputPath is empty')
    return null
  }

  let entries: { name?: string }[]
  try {
    entries = await readDir(outputPath)
  } catch (e) {
    logger.error(`findPdfFile: cannot read directory "${outputPath}"`, e)
    return null
  }

  const files = entries.filter(e => e.name).map(e => e.name!)

  // 1. 优先查找 *_origin.pdf
  const originPdf = files.find(f => f.endsWith('_origin.pdf') || f === 'origin.pdf')
  if (originPdf) {
    const filePath = await join(outputPath, originPdf)
    const url = convertFileSrc(filePath)
    logger.info(`findPdfFile: found origin PDF "${filePath}"`)
    return { path: filePath, url }
  }

  // 2. 回退：任意 .pdf 文件
  const anyPdf = files.find(f => f.endsWith('.pdf'))
  if (anyPdf) {
    const filePath = await join(outputPath, anyPdf)
    const url = convertFileSrc(filePath)
    logger.info(`findPdfFile: found fallback PDF "${filePath}"`)
    return { path: filePath, url }
  }

  logger.warn(`findPdfFile: no PDF found in "${outputPath}"`)
  return null
}

/**
 * 读取 block_list.json 文件并解析为 BlockListData。
 *
 * @param outputPath 解压输出目录路径
 * @returns BlockListData 或 null（文件不存在/解析失败时）
 */
export async function readBlockList(outputPath: string): Promise<BlockListData | null> {
  if (!outputPath) {
    logger.warn('readBlockList: outputPath is empty')
    return null
  }

  const blockListPath = await join(outputPath, 'block_list.json')

  try {
    const fileExists = await exists(blockListPath)
    if (!fileExists) {
      logger.warn(`readBlockList: file does not exist "${blockListPath}"`)
      return null
    }

    const raw = await readTextFile(blockListPath)
    const parsed = JSON.parse(raw) as BlockListData
    logger.info(`readBlockList: loaded ${parsed.pdfData?.length ?? 0} pages from "${blockListPath}"`)
    return {
      pdfData: parsed.pdfData || [],
      mergeConnections: parsed.mergeConnections || [],
    }
  } catch (e) {
    logger.error(`readBlockList: failed to read/parse "${blockListPath}"`, e)
    return null
  }
}

/**
 * 保存块编辑到 block_list.json 文件。
 *
 * 在 block_list.json 中找到 blockPosition 对应的块，更新其 text/content 字段，
 * 然后将修改后的完整 JSON 写回磁盘。
 *
 * @param blockListPath block_list.json 的完整路径
 * @param blockPosition 块位置标识（block_position 字段）
 * @param content 新内容
 * @param updateKey 要更新的字段键（默认 "text"）
 * @returns { success: boolean, error?: string }
 */
export async function saveBlockEdit(
  blockListPath: string,
  blockPosition: string,
  content: string,
  updateKey: string = 'text',
): Promise<{ success: boolean; error?: string }> {
  logger.info(`saveBlockEdit: path="${blockListPath}", blockPosition="${blockPosition}", updateKey="${updateKey}"`)

  try {
    const fileExists = await exists(blockListPath)
    if (!fileExists) {
      return { success: false, error: `block_list.json 不存在: ${blockListPath}` }
    }

    const raw = await readTextFile(blockListPath)
    const data = JSON.parse(raw) as BlockListData

    let found = false
    for (const page of data.pdfData) {
      for (const block of page) {
        if (block.block_position === blockPosition) {
          ;(block as any)[updateKey] = content
          if (updateKey === 'text' && block.content !== undefined) {
            block.content = content
          }
          found = true
          break
        }
      }
      if (found) break
    }

    if (!found) {
      logger.warn(`saveBlockEdit: block "${blockPosition}" not found in block_list.json`)
      return { success: false, error: `未找到块: ${blockPosition}` }
    }

    const jsonStr = JSON.stringify(data, null, 2)
    await writeFile(blockListPath, new TextEncoder().encode(jsonStr))
    logger.info(`saveBlockEdit: saved successfully (${jsonStr.length} bytes)`)
    return { success: true }
  } catch (e: any) {
    logger.error(`saveBlockEdit: error`, e)
    return { success: false, error: e?.message || String(e) }
  }
}

/**
 * 在系统文件管理器中打开指定文件夹。
 *
 * @param folderPath 要打开的文件夹路径
 */
export async function openFolder(folderPath: string): Promise<void> {
  logger.info(`openFolder: "${folderPath}"`)
  try {
    await open(folderPath)
    logger.info(`openFolder: opened successfully`)
  } catch (e) {
    logger.error(`openFolder: failed to open "${folderPath}"`, e)
  }
}

/**
 * 构建 block_list.json 的完整路径。
 */
export async function getBlockListPath(outputPath: string): Promise<string> {
  return await join(outputPath, 'block_list.json')
}

/**
 * 读取 full.md 文件内容（Markdown 渲染组件使用）。
 *
 * @param outputPath 解压输出目录路径
 * @returns Markdown 文本或空字符串
 */
export async function readFullMarkdown(outputPath: string): Promise<string> {
  if (!outputPath) return ''
  try {
    const mdPath = await join(outputPath, 'full.md')
    const fileExists = await exists(mdPath)
    if (!fileExists) {
      logger.warn(`readFullMarkdown: full.md not found at "${mdPath}"`)
      return ''
    }
    const text = await readTextFile(mdPath)
    logger.info(`readFullMarkdown: loaded ${text.length} chars from "${mdPath}"`)
    return text
  } catch (e) {
    logger.error(`readFullMarkdown: failed`, e)
    return ''
  }
}
