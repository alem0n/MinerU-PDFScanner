/**
 * 任务数据模型
 * 定义 TaskDataEntities 实体以及所有 API 请求/响应类型
 */

/**
 * taskData 实体（数据库持久化）
 * 对应数据库 taskData 表的完整字段
 */
export interface TaskDataEntities {
    /** 主键 UUID */
    id: string;
    /** 文件名 */
    file_name: string;
    /** 类型 */
    type: string;
    /** 任务状态（pending / processing / completed / failed） */
    state: string;
    /** 创建时间戳（整数，Date.now()） */
    createdAt: number;
    /** Markdown 结果链接 */
    full_md_link: string;
    /** ZIP 结果链接 */
    full_zip_url: string;
    /** 错误信息 */
    err_msg: string;
    /** 错误码 */
    err_code: string;
    /** 后端 Job ID */
    jobID: string;
    /** 任务 ID */
    task_id: string;
    /** 缩略图路径 */
    thumb: string;
    /** 文件 URL（对应旧 pdf_url） */
    url: string;
    /** 文件下载 URL */
    file_url: string;
    /** 数据 ID */
    data_id: string;
    /** 批次 ID */
    batch_id: string;
    /** 任务类型 */
    taskType: string;
    /** 本地路径 */
    path: string;
    /** 提取进度 */
    extract_progress: string;
    /** 重试次数 */
    retry_time: number;
    /** 解压文件路径 */
    unzip_file_path: string;
    /** 解压输出路径 */
    unzip_file_output_path: string;
    /** 原始文件路径 */
    origin_file_path: string;
    /** 创建日期 */
    createDate: string;
    /** 模型版本 */
    model_version: string;
    /** 封面路径（对应旧 images） */
    cover_path: string;
    /** 化学式数据 */
    chem: string;
    /** 是否化学式 */
    is_chem: boolean;
    /** 文件大小 */
    file_size: number;
    /** 排序权重 */
    rank: number;
    /** 是否可重试 */
    can_retry: boolean;
    /** 是否过期 */
    is_expire: boolean;
}

/** 数据库内使用 Task 别名保持兼容 */
export type Task = TaskDataEntities;

/**
 * taskDemoData 实体（与 taskData 同结构，用于演示数据）
 */
export interface TaskDemoDataEntities extends TaskDataEntities {}

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
  | "hybrid-engine";

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
  /** 兼容 OpenAI 的服务地址（仅外部服务模式使用） */
  server_url?: string | null;
  /** 返回 Markdown 内容，默认 true */
  return_md?: boolean;
  /** 返回中间 JSON，默认 true */
  return_middle_json?: boolean;
  /** 返回模型输出 JSON，默认 true */
  return_model_output?: boolean;
  /** 返回内容列表 JSON，默认 true */
  return_content_list?: boolean;
  /** 返回提取的图片，默认 true */
  return_images?: boolean;
  /** 以 ZIP 格式返回结果，默认 true */
  response_format_zip?: boolean;
  /** 在 ZIP 结果中包含原始输入文件，默认 true */
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

/**
 * 文件选择项
 *
 * 支持两种模式：
 * - Tauri 桌面端：通过原生对话框获取文件路径（path），提交时从磁盘读取
 * - 浏览器开发模式：通过 HTML input 获取 File 对象（file），提交时直接上传
 */
export interface FileItem {
    /** 文件名（含扩展名） */
    name: string;
    /** 文件大小（字节） */
    size: number;
    /** 文件系统路径（Tauri 模式，仅在桌面端有值） */
    path?: string;
    /** 浏览器 File 对象（浏览器开发模式，仅在 dev 模式有值） */
    file?: File;
}
