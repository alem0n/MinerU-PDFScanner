# MinerU PDF Scanner — 流程完整性分析与实现计划（最终修订版）

## 第一步：流程完整性分析

### 1. 准备请求（Prepare Request）

**判定：❌ 未实现**

| 维度   | 当前代码                                              | 新 API 要求                                                                                                                                                                                                                                                                                                                                          |
| ---- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 文件类型 | 仅 `.pdf`                                          | PDF、图片、DOCX、PPTX、XLSX                                                                                                                                                                                                                                                                                                                             |
| 请求参数 | `{ parse_method: "auto", is_json_md_dump: true }` | `files`(必填), `lang_list`, `backend`, `effort`, `parse_method`, `formula_enable`, `table_enable`, `image_analysis`, `server_url`, `return_md`, `return_middle_json`, `return_model_output`, `return_content_list`, `return_images`, `response_format_zip`, `return_original_file`, `client_side_output_generation`, `start_page_id`, `end_page_id` |
| 字段名  | `fileName: "file"` (单文件)                          | `files` (文件数组)                                                                                                                                                                                                                                                                                                                                    |
| 请求方式 | Upload 组件直接 POST 到 `uploadUrl`                    | 应 POST 到 `/tasks` 或 `/file_parse`                                                                                                                                                                                                                                                                                                                 |

**关键文件**：`src/pages/createTask/index.tsx` 第 25-59 行

---

### 2. 检查服务（Health Check）

**判定：❌ 未实现**

新 API 提供：

```http
GET /health
```

当前项目中不存在健康检查逻辑，也未在任务提交前验证后端可用性。

---

### 3. 提交任务（Submit Task）

**判定：❌ 未实现**

当前代码上传到可配置的 `uploadUrl`，与新 API 不兼容。

新 API 标准接口：

```http
POST /tasks
```

异步提交任务。

```http
POST /file_parse
```

同步解析文件。

当前实现无法传递：

* backend
* effort
* lang_list
* image_analysis
* return_*

等新参数。

**关键文件**：

* `src/pages/createTask/index.tsx`
* `src/service/config.service.ts`

---

### 4. 排队（Queue）

**判定：✅ 已实现**

项目已有本地异步队列：

```text
AsyncQueryQueue
```

支持 FIFO 顺序处理。

同时新 API 返回：

```json
{
  "queued_ahead": 0
}
```

说明服务端也维护排队状态。

现有队列框架可继续保留。

---

## 5. 解析中（Polling）

**判定：⚠️ 部分实现**

### 问题描述

当前任务完成顺序与用户添加文件的顺序无关联。由于轮询循环采用"未完成则重新入队到队尾"的机制，多个任务会在队列中交错轮询，最先完成解析的任务最先触发结束回调，而非最先提交的任务最先结束。

### 问题对比

| 项目                 | 当前实现                                                           | 应修改为                                                    |
| ------------------ | -------------------------------------------------------------- | ------------------------------------------------------- |
| 轮询重入队策略            | `addTask(task)` 将未完成任务重新入队到 `AsyncQueryQueue` 尾部，导致任务按完成时间随机结束 | 保持提交顺序入队，同批次任务应在同一上下文内按序串行完成，即上一个任务到达终态后再启动下一个任务的完整生命周期 |
| `queueTask` 终态回调时机 | 每个任务独立调用 `Notification.success` 并更新 DB，无批次顺序保证                 | 按批次提交顺序依次触发终态回调（通知 + DB 更新）                             |

### 当前策略描述

`TaskService.queueTask`（`src/service/task.service.ts:109-141`）在轮询到 `pending` / `processing` 状态时调用 `this.addTask(task)` 将任务重新入队到 `AsyncQueryQueue` 尾部。多任务场景下所有任务的轮询请求交错发出，任意任务率先达到 `completed` 即优先结束，不保证与 `addTask` 调用顺序一致。

### 推荐策略

修改 `TaskService.addTask` 为批处理模式：

```text
输入：files: Task[]  （同一批次按提交顺序排列）

逻辑：
  1. 将批次整体入队为一个原子任务
  2. 在该原子任务内，按数组顺序逐一执行完整生命周期（轮询→等待→轮询→完成）
  3. 前一个任务到达终态后立即启动下一个任务
```

核心参数：

* 批内串行执行，间隔 100ms（仅用于状态传播延迟）
* 轮询间隔：1秒
* 单任务超时：永久等待除非接口返回失败或者服务器请求失败
* 全批次终态回调：按原数组顺序依次触发 `Notification.success`（或 `.error`）

### 原因分析

当前 `AsyncQueryQueue` 是按任务粒度入队的，每个任务独立调用 `addTask` 并独立轮询。要让完成顺序与添加顺序一致，需要将"顺序控制"从任务粒度提升到**批次粒度**——同一批次的任务串行执行而非并发轮询。这样即使后添加的任务解析更快，也必须等前一个任务结束后才开始，从而保证完成顺序与添加顺序严格一致。

---

## 任务列表展示

**判定：⚠️ 部分实现**

### 问题描述

任务列表页面查询数据库时缺少 `ORDER BY` 子句，SQLite 返回的行顺序不确定。当页面切换状态标签（未启动 / 进行中 / 已完成 / 失败）时，同一组任务的排列顺序可能发生变化，无法保证与文件添加顺序一致。

### 问题对比

| 项目            | 当前实现                                                                             | 应修改为                                                            |
| ------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| SQL 排序        | 无 `ORDER BY`，`taskRepository.list("status in ($1)", [status])` 按 SQLite 内部存储顺序返回 | 添加 `ORDER BY created_at ASC`，最早创建的任务排在前面                        |
| `Task` 模型时间字段 | 无 `created_at` 或任何时间戳字段，无法标识添加顺序                                                 | 新增 `created_at` 字段（ISO 8601 字符串，如 `"2025-01-15T10:30:00.000Z"`） |

### 正确状态样例

```json
[
  {
    "task_id": "a1b2c3",
    "file_name": "doc1.pdf",
    "status": "completed",
    "created_at": "2025-01-15T10:30:00.000Z"
  },
  {
    "task_id": "d4e5f6",
    "file_name": "doc2.pdf",
    "status": "processing",
    "created_at": "2025-01-15T10:30:05.000Z"
  },
  {
    "task_id": "g7h8i9",
    "file_name": "doc3.pdf",
    "status": "pending",
    "created_at": "2025-01-15T10:30:10.000Z"
  }
]
```

### 当前策略描述

`src/pages/task/index.tsx:32-38` 中调用：

```sql
SELECT * FROM tasks WHERE status in (?)
```

SQLite 无 `ORDER BY` 时按物理行号（RowID）返回，该顺序在数据删除或 `VACUUM` 后会被改变，无法作为可靠排序依据。

### 推荐策略

#### 后端（task.repository.ts + task.model.ts）

| 修改项                | 说明                                                              |
| ------------------ | --------------------------------------------------------------- |
| `Task` 接口新增字段      | `created_at: string`                                            |
| `CREATE TABLE` SQL | `created_at TEXT NOT NULL DEFAULT (datetime('now'))`            |
| `list` 方法          | `SELECT * FROM tasks WHERE status = $1 ORDER BY created_at ASC` |
| `create` 方法        | JS 端生成 `new Date().toISOString()` 写入                            |

#### 前端（pages/task/index.tsx）

| 修改项  | 说明                                    |
| ---- | ------------------------------------- |
| 列表渲染 | 组件接收的 `dataSource` 已由 SQL 保证升序，直接渲染即可 |
| 页面切换 | 切换 `status` 参数时重复上述查询，同一状态下的任务顺序始终一致  |

### 原因分析

`created_at` 是最简单可靠的"添加顺序"代理字段。相比自增 ID，时间戳在跨设备/跨会话场景下更易理解，且 JS 原生支持 `Date.now()` / `toISOString()`，无需数据库自增机制。`ORDER BY created_at ASC` 确保：

1. 同一页面刷新前后顺序一致；
2. 不同状态页面间切换时顺序逻辑透明；
3. 数据清理/迁移后排序不丢失。

字段值在上传成功、`taskRepository.create` 调用时由前端写入，精确对应"添加文件"的时刻。

---

### 6. 下载结果（Download Result）

**判定：❌ 未实现**

当前代码通过：

```text
content_list_json
images/*.md
```

等旧文件路径拉取结果。

新 API 使用：

```http
GET /tasks/{task_id}/result
```

返回 ZIP 文件下载。

因此旧逻辑完全不兼容。

必须改为：

```text
下载 ZIP
```

---

### 7. 整理输出（Organize Output）

**判定：暂缓实现保留位置后面实现**

---

### 8. 完成（Complete）

**判定：✅ 已实现**

当前代码已经具备：

* 成功通知
* 失败通知
* 状态更新

基础任务生命周期管理框架可继续使用。

---

## 整体汇总

| 步骤      | 状态           |
| ------- | ------------ |
| 1. 准备请求 | ❌ 未实现        |
| 2. 检查服务 | ❌ 未实现        |
| 3. 提交任务 | ❌ 未实现        |
| 4. 排队   | ✅ 已实现        |
| 5. 解析中  | ⚠️ 部分实现      |
| 任务列表展示  | ⚠️ 部分实现      |
| 6. 下载结果 | ❌ 未实现        |
| 7. 整理输出 | 暂缓实现保留位置后面实现 |
| 8. 完成   | ✅ 已实现        |

---

## 第二步：完整实现计划

### 任务 A：API 客户端层重构

目标：统一封装所有新 API 调用。

新增接口：

```typescript
interface ApiClient {
  healthCheck(): Promise<any>;

  submitTask(
    files: File[],
    params: ParseTaskParams
  ): Promise<TaskSubmitResponse>;

  getTaskStatus(
    taskId: string
  ): Promise<TaskStatusResponse>;

  downloadTaskResult(
    taskId: string
  ): Promise<Blob>;

  syncParseFile(
    files: File[],
    params: ParseTaskParams
  ): Promise<Blob>;
}
```

实现：

* `GET /health`
* `POST /tasks`
* `GET /tasks/{task_id}`
* `GET /tasks/{task_id}/result`
* `POST /file_parse`

---

### 任务 B：数据模型更新

```typescript
export interface TaskStatusResponse {
  task_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
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
```

新增：

```typescript
export interface TaskSubmitResponse {
  task_id: string;
}
```

新增：

```typescript
export enum TaskStatus {
  Pending = 'pending',
  Processing = 'processing',
  Completed = 'completed',
  Failed = 'failed'
}
```

新增：

```typescript
created_at: string
```

废弃：

```typescript
pdf_url
md_url
images
model_json
middle_json
content_list_json
```

---

### 任务 C：TaskService 重构

流程：

```text
提交
↓
批次入队
↓
按顺序轮询
↓
completed
↓
下载ZIP
↓
之后分为两个逻辑（需要用户选择，并且这两种可以都选择）：

下载到本地逻辑：
下载 ZIP
↓
保存到指定文件夹

直接预览逻辑（暂缓实现保留位置后面实现）：
下载 ZIP
↓
保存到用户目录下MinerU-Scanner
↓
解压
↓
读取
```

---

### 任务 D：创建任务页面重写

支持：

* PDF
* PNG（暂缓实现保留位置后面实现）
* JPG（暂缓实现保留位置后面实现）
* DOCX（暂缓实现保留位置后面实现）
* PPTX（暂缓实现保留位置后面实现）
* XLSX（暂缓实现保留位置后面实现）

支持全部 API 参数。

---

### 任务 E：健康检查前置守卫

```text
点击提交
↓
GET /health
↓
正常
↓
提交

异常
↓
提示用户
```

超时：

```text
5 秒
```

---

### 任务 F：轮询与顺序控制重构

实现：

* 批次粒度串行执行

* 保证完成顺序与添加顺序一致

* 支持 `queued_ahead`

* 终态通知按提交顺序触发

---

### 任务 G：结果下载实现

实现：

```text
分为两种：

下载到本地逻辑：
下载 ZIP
↓
保存到指定文件夹


直接预览逻辑（暂缓实现保留位置后面实现）：
下载 ZIP
↓
保存到用户目录下MinerU-Scanner
↓
解压
↓
读取
```

支持：

* Markdown
* JSON
* 图片
* 原文件

---

### 任务 H：输出整理适配

重写：

```typescript
loadTask()
```

改为：

```text
从 ZIP 内容读取
```

保留：

* remark-math
* rehype-katex

---

### 任务 I：任务列表排序改造

新增：

```typescript
created_at: string
```

数据库：

```sql
ORDER BY created_at ASC
```

确保任务展示顺序与添加顺序一致。

---

### 任务 J：Setting 页面更新

| 旧配置          | 新配置     |
| ------------ | ------- |
| uploadUrl    | baseUrl |
| queryTaskUrl | 删除      |
| fileUrl      | 删除      |
| apiKey       | 保留      |
| apiSecret    | 保留      |

---

# 
