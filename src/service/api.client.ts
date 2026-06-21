/**
 * API 客户端层
 *
 * 统一封装新后端的所有 HTTP 接口调用：
 * - GET  /health
 * - POST /tasks
 * - GET  /tasks/{task_id}
 * - GET  /tasks/{task_id}/result
 * - POST /file_parse
 *
 * 所有请求动态读取 configService 中的 baseUrl，支持运行时切换服务地址。
 * 请求使用 fetch API，multipart 上传通过 FormData 构造。
 */

import { configService } from "./config.service";
import type { ParseTaskParams, TaskSubmitResponse, TaskStatusResponse } from "./task.model";

/**
 * API 请求异常，携带后端返回的错误描述
 */
export class ApiError extends Error {
  /** HTTP 状态码 */
  public status: number;
  /** 后端返回的原始错误体（可能包含 detail 字段） */
  public body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/**
 * 将 ParseTaskParams 对象中的有效字段写入 FormData
 * @param fd  目标 FormData
 * @param params  解析任务参数（可选字段）
 */
function appendParamsToFormData(fd: FormData, params: ParseTaskParams): void {
  const entries = Object.entries(params) as [keyof ParseTaskParams, unknown][];
  for (const [key, value] of entries) {
    if (value === undefined || value === null) {
      continue; // 跳过未设置的字段，由后端使用默认值
    }
    if (key === "lang_list" && Array.isArray(value)) {
      // lang_list 为数组，逐个 append 以便后端解析
      for (const lang of value) {
        fd.append("lang_list", lang);
      }
    } else {
      fd.append(key, String(value));
    }
  }

  // 不再强制覆盖；默认值由 DEFAULT_PARAMS（前端 UI）或上层调用方传入
}

/**
 * 获取后端基础 URL（末尾不含斜杠）
 *
 * 自动检测运行环境：
 * - 开发模式（纯浏览器 `npm run dev` 或 `tauri dev`）→ 走 Vite proxy（/proxy-api）
 * - 生产模式（Tauri 构建包）→ 直连后端（无 CORS 限制）
 *
 * 设计要点：
 * - import.meta.env.DEV 在 Vite 开发模式（含 tauri dev）下为 true
 * - 开发模式下 Vite 开发服务器始终在运行，可以代理请求
 * - 生产模式下需要读取用户配置的 baseUrl，因为 Vite 代理不可用
 */
async function getBaseUrl(): Promise<string> {
  // 开发模式（含纯浏览器 dev + tauri dev）：走 Vite proxy，避免跨域
  if (import.meta.env.DEV) {
    return "/proxy-api";
  }

  // 生产环境（Tauri 构建包）：直连后端，Tauri webview 无 CORS 限制
  try {
    const config = await configService.get();
    return (config.baseUrl ?? "http://127.0.0.1:8000").replace(/\/+$/, "");
  } catch {
    // 配置读取失败时使用默认值
    return "http://127.0.0.1:8000";
  }
}

/**
 * 从失败的 Response 中提取错误信息
 * @param resp  fetch Response 对象
 * @returns  解析后的错误消息
 */
async function extractError(resp: Response): Promise<string> {
  try {
    const body = await resp.json();
    if (body?.detail) {
      // FastAPI 验证错误时为数组或字符串
      if (Array.isArray(body.detail)) {
        return body.detail.map((d: { msg: string }) => d.msg).join("; ");
      }
      return String(body.detail);
    }
    return `HTTP ${resp.status}: ${resp.statusText}`;
  } catch {
    return `HTTP ${resp.status}: ${resp.statusText}`;
  }
}

/**
 * 通用 fetch 包装：校验状态码、统一错误处理
 * @param input    请求 URL
 * @param init     fetch 配置项
 * @returns        解析后的 JSON 响应体
 */
async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(input, init);
  if (!resp.ok) {
    const message = await extractError(resp);
    throw new ApiError(message, resp.status, resp);
  }
  return resp.json() as Promise<T>;
}

/**
 * 通用 fetch 包装：返回二进制 Blob
 * @param input    请求 URL
 * @param init     fetch 配置项
 * @returns        二进制 Blob
 */
async function requestBlob(input: string, init?: RequestInit): Promise<Blob> {
  const resp = await fetch(input, init);
  if (!resp.ok) {
    const message = await extractError(resp);
    throw new ApiError(message, resp.status, resp);
  }
  return resp.blob();
}

/**
 * API 客户端
 *
 * 职责范围：
 * 1. 封装全部 5 个新后端接口
 * 2. 统一错误处理与超时控制
 * 3. 动态获取 baseUrl，不绑定固定地址
 *
 * 使用方式：
 * ```typescript
 * import { apiClient } from "@/service/api.client";
 * const result = await apiClient.submitTask(files, { backend: "pipeline" });
 * ```
 */
export class ApiClient {
  // ---- 健康检查 ----

  /**
   * 健康检查
   * GET /health
   *
   * 向后端发送存活检查请求，5 秒超时。
   * @returns 后端返回的健康状态对象
   */
  async healthCheck(): Promise<Record<string, unknown>> {
    const baseUrl = await getBaseUrl();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    try {
      return await requestJson<Record<string, unknown>>(`${baseUrl}/health`, {
        method: "GET",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  // ---- 异步任务提交 ----

  /**
   * 提交异步解析任务
   * POST /tasks
   *
   * 上传文件并提交后台解析任务，请求立即返回 task_id。
   * 后续通过 getTaskStatus / downloadTaskResult 获取结果。
   *
   * @param files   待解析的文件列表（支持 PDF、图片、DOCX、PPTX、XLSX）
   * @param params  解析参数（全部可选，后端提供默认值）
   * @returns       包含 task_id 的响应
   */
  async submitTask(
    files: File[],
    params: ParseTaskParams = {},
  ): Promise<TaskSubmitResponse> {
    const baseUrl = await getBaseUrl();
    const fd = new FormData();

    // 逐个添加文件（字段名 "files" 对应后端多文件数组接收）
    for (const file of files) {
      fd.append("files", file);
    }

    // 添加解析参数
    appendParamsToFormData(fd, params);

    return requestJson<TaskSubmitResponse>(`${baseUrl}/tasks`, {
      method: "POST",
      body: fd,
    });
  }

  // ---- 任务状态查询 ----

  /**
   * 查询异步任务状态
   * GET /tasks/{task_id}
   *
   * @param taskId  任务 ID
   * @returns       包含当前状态、排队信息、时间戳的完整状态对象
   */
  async getTaskStatus(taskId: string): Promise<TaskStatusResponse> {
    const baseUrl = await getBaseUrl();
    return requestJson<TaskStatusResponse>(`${baseUrl}/tasks/${taskId}`, {
      method: "GET",
    });
  }

  // ---- 异步结果下载 ----

  /**
   * 下载异步任务解析结果
   * GET /tasks/{task_id}/result
   *
   * 返回 ZIP 文件流，由调用方决定如何处理（保存/解压等）。
   *
   * @param taskId  任务 ID
   * @returns       ZIP 文件的 Blob
   */
  async downloadTaskResult(taskId: string): Promise<Blob> {
    const baseUrl = await getBaseUrl();
    return requestBlob(`${baseUrl}/tasks/${taskId}/result`, {
      method: "GET",
    });
  }

  // ---- 同步解析 ----

  /**
   * 同步解析文件（阻塞等待）
   * POST /file_parse
   *
   * 上传文件并等待后端完成解析后返回最终结果。
   * 适用于小文件或需要即时获取结果的场景。
   *
   * @param files   待解析的文件列表
   * @param params  解析参数（全部可选）
   * @returns       解析结果文件流（ZIP 或 JSON，取决于 response_format_zip）
   */
  async syncParseFile(
    files: File[],
    params: ParseTaskParams = {},
  ): Promise<Blob> {
    const baseUrl = await getBaseUrl();
    const fd = new FormData();

    for (const file of files) {
      fd.append("files", file);
    }
    appendParamsToFormData(fd, params);

    return requestBlob(`${baseUrl}/file_parse`, {
      method: "POST",
      body: fd,
    });
  }
}

/**
 * ApiClient 全局单例
 * 所有模块通过此实例调用后端 API
 */
export const apiClient = new ApiClient();
