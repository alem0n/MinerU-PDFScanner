// ============================================================
// 共享类型定义 - 对应 SQLite taskData 表 + 业务状态枚举
// ============================================================

export enum TaskState {
  LOADING = 'loading',
  PENDING = 'pending',
  RUNNING = 'running',
  DOWNLOADING = 'downloading',
  UNZIPPING = 'unzipping',
  UNZIPPED = 'unzipped',
  FAILED = 'failed',
  DOWNLOAD_FAILED = 'download-failed',
  UNZIP_FAILED = 'unzip-failed',
  LOCAL_DELETED = 'local-deleted',
  ABORTED = 'aborted',
  DONE = 'done',
  WAITING_FILE = 'waiting-file',
  WAITING_DOWNLOAD = 'waiting-download',
  QUOTA_EXCEEDED = 'quota-exceeded',
  EXPIRE = 'expire',
  UPLOADING = 'uploading',
}

export enum ModelVersion {
  V1 = 'pipeline',
  V2 = 'vlm',
  HTML = 'html',
  OFFICE = 'office',
  UNKNOWN = 'unknown',
}

export enum OlderModelVersion {
  V1 = 'v1',
  V2 = 'v2',
}

export enum ExportFormat {
  MARKDOWN = 'md',
  HTML = 'html',
  JSON = 'json',
  PDF = 'pdf',
}

export interface TaskData {
  id: string
  file_name: string
  type: string
  state: TaskState
  createdAt: string
  full_md_link: string
  full_zip_url: string
  err_msg: string
  err_code: string
  jobID: string
  task_id: string
  thumb: string
  url: string
  file_url: string
  data_id: string
  batch_id: string
  taskType: string
  path: string
  extract_progress: string
  retry_time: number
  unzip_file_path: string
  unzip_file_output_path: string
  origin_file_path: string
  createDate: string
  model_version: string
  cover_path: string
  chem: string
  is_chem: boolean
  file_size: number
  rank: number
  can_retry: boolean
  is_expire: boolean
}

export interface TaskListInput {
  pageNo?: number
  pageSize?: number
  state?: string | string[]
  file_name?: string
  type?: string[]
  timeRange?: [string, string]
  model_version?: string
}

export interface TaskListResult {
  list: TaskData[]
  total: number
  pageNo: number
  pageSize: number
}

export interface AnnotationData {
  anno_id: number
  task_id: string
  type: number
  content: string
  block_position: string
  page_num: number
  created_at: number
  updated_at: number
}

export interface CollectionData {
  collection_id: number
  task_id: string
  type: number
  content: string
  description?: string
  block_position: string
  content_url?: string
  page_num: number
  sub_type?: number
  created_at: number
  updated_at: number
}

export interface BlockData {
  id: string
  type: string
  text: string
  text_level: number
  bbox?: number[]
  page_num: number
  block_index: number
  content?: string

  // block_list.json 专用字段
  page_idx?: number
  page_size?: number[]
  block_position?: string
  is_discarded?: boolean
  angle?: number
  color?: { line: string; fill: string }
  level?: number
  merge_prev?: boolean
  merge_next?: boolean

  // 图片
  img_path?: string
  img_caption?: string
  img_footnote?: string
  description?: string

  // 表格
  table_body?: string
  table_caption?: string
  table_footnote?: string

  // 公式
  latex?: string

  // 层级渲染：父子块关系
  parent_id?: string
  is_container?: boolean
}

export interface MergeConnection {
  id: string
  blocks: string[]
  type: 'merge'
}

export interface BlockListData {
  pdfData: BlockData[][]
  mergeConnections: MergeConnection[]
}

export interface PdfInfo {
  pdfData: BlockData[][]
  mergeConnections?: MergeConnection[]
}

export interface ExtractProgress {
  extracted_pages: number
  total_pages: number
  start_time?: string
}

export interface ChemData {
  state?: string
  zip_url?: string
  json_url?: string
  base_url?: string
  demonstration_tables_url?: string
  apicall_mol_url?: string
  err_msg?: string
}

export const TASK_DONE_STATES = [TaskState.DONE, TaskState.FAILED, TaskState.ABORTED]
export const TASK_RUNNING_STATES = [TaskState.WAITING_FILE, TaskState.LOADING, TaskState.PENDING, TaskState.RUNNING]
export const TASK_PROCESSING_STATES = [TaskState.UPLOADING, TaskState.PENDING, TaskState.RUNNING, TaskState.LOADING, TaskState.WAITING_FILE, TaskState.WAITING_DOWNLOAD, TaskState.UNZIPPING, TaskState.DOWNLOADING]
