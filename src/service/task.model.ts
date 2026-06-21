/**
 * 任务数据模型
 * 定义 Task 实体以及所有 API 请求/响应类型
 */

/**
 * 旧版 Task 实体（数据库持久化）
 * 注：部分字段将在后续迁移中逐步废弃
 */
export interface Task {
    /** 任务ID */
    task_id: string;
    /** 文件名 */
    file_name: string;
    /** PDF文件的URL */
    pdf_url: string;
    /** Markdown文件的URL */
    md_url: string;
    /** 图像数据 */
    images: string;
    /** 模型的JSON数据 */
    model_json: string;
    /** 中间处理的JSON数据 */
    middle_json: string;
    /** 内容列表的JSON数据 */
    content_list_json: string;
    /** 任务状态 */
    status: string;
}

/**
 * 后端支持的语言选项
 * 用于 pipeline 后端 OCR 时指定文档语言以提高识别精度
 */
export type LangOption =
  | "ch" | "ch_server" | "korean"
  | "ta" | "te" | "ka" | "th" | "el"
  | "arabic" | "east_slavic" | "cyrillic" | "devanagari";

/**
 * 后端引擎类型
 */
export type BackendOption =
  | "pipeline"
  | "vlm-engine"
  | "hybrid-engine"
  | "vlm-http-client"
  | "hybrid-http-client";

/**
 * 混合引擎解析力度
 */
export type EffortOption = "medium" | "high";

/**
 * PDF 解析方式
 */
export type ParseMethodOption = "auto" | "txt" | "ocr";

/**
 * 提交解析任务的全部可选参数
 * 映射自 openapi.json Body_submit_parse_task_tasks_post
 * 所有参数均为可选，后端提供默认值
 */
export interface ParseTaskParams {
  /** （仅 pipeline 后端）文档语言列表，提高 OCR 精度 */
  lang_list?: LangOption[];
  /** 解析后端引擎，默认 hybrid-engine */
  backend?: BackendOption;
  /** （仅 hybrid 后端）解析力度，默认 medium */
  effort?: EffortOption;
  /** （仅 pipeline / hybrid 后端）PDF解析方式，默认 auto */
  parse_method?: ParseMethodOption;
  /** 启用公式解析，默认 true */
  formula_enable?: boolean;
  /** 启用表格解析，默认 true */
  table_enable?: boolean;
  /** 启用图片/图表分析（VLM/hybrid 后端），默认 true */
  image_analysis?: boolean;
  /** （仅 vlm/hybrid-http-client 后端）兼容 OpenAI 的服务地址 */
  server_url?: string | null;
  /** 返回 Markdown 内容，默认 true */
  return_md?: boolean;
  /** 返回中间 JSON，默认 false */
  return_middle_json?: boolean;
  /** 返回模型输出 JSON，默认 false */
  return_model_output?: boolean;
  /** 返回内容列表 JSON，默认 false */
  return_content_list?: boolean;
  /** 返回提取的图片，默认 false */
  return_images?: boolean;
  /** 以 ZIP 格式返回结果，默认 false */
  response_format_zip?: boolean;
  /** 在 ZIP 结果中包含原始输入文件，默认 false；仅在 response_format_zip=true 时生效 */
  return_original_file?: boolean;
  /** 将最终 Markdown/内容列表生成延迟到客户端，默认 false */
  client_side_output_generation?: boolean;
  /** PDF 解析起始页码（从 0 开始），默认 0 */
  start_page_id?: number;
  /** PDF 解析结束页码（从 0 开始），默认 99999 */
  end_page_id?: number;
}

/**
 * POST /tasks 的响应
 */
export interface TaskSubmitResponse {
    /** 后端分配的任务 ID */
    task_id: string;
}

/**
 * GET /tasks/{task_id} 的响应（任务状态）
 */
export interface TaskStatusResponse {
    task_id: string;
    status: "pending" | "processing" | "completed" | "failed";
    backend: string;
    file_names: string[];
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
    error: string | null;
    status_url: string;
    result_url: string;
    queued_ahead: number;
}

/**
 * 任务状态枚举
 */
export enum TaskStatus {
    Pending = "pending",
    Processing = "processing",
    Completed = "completed",
    Failed = "failed",
}
