# 开发日志

## 2026-06-21 — 任务 A：API 客户端层重构

### 概述
启动任务 A 的实施。该任务旨在将原有硬编码的 fetch 调用与 URL 拼接逻辑统一封装为 `ApiClient` 接口层，对齐新 API（openapi.json）定义的 5 个端点。

### 实施步骤记录

#### 步骤 1：项目环境确认
- 确认项目为 Tauri + React + TypeScript 架构
- TypeScript strict 模式，`noUnusedLocals` / `noUnusedParameters` 均开启
- 路径别名 `@/` → `src/`
- 构建命令：`tsc && vite build`

#### 步骤 2：Config 模型更新（子任务 1.4）
- 在 `Config` 接口中新增 `baseUrl?: string` 字段
- 在 `get()` 默认值中设置 `baseUrl: "http://127.0.0.1:8080"`
- **决策**：保留旧的 `uploadUrl` / `fileUrl` / `queryTaskUrl` 字段以保持向后兼容，待后续任务 J（Setting 页面更新）再做清理

#### 步骤 3：数据模型更新（子任务 1.1）
- 在 `task.model.ts` 中新增 `ParseTaskParams` 接口，完整映射 openapi.json 中 `Body_submit_parse_task_tasks_post` 的 19 个参数
- 使用 union 类型约束枚举字段：`lang_list`、`backend`、`effort`、`parse_method`
- 新增 `TaskSubmitResponse` 接口（`{ task_id: string }`）
- **注意**：`TaskStatusResponse` 已在 dev_plan.md 任务 B 中定义，本任务只实现提交相关的类型

#### 步骤 4：ApiClient 核心实现（子任务 1.2）
- 新建 `src/service/api.client.ts`
- 封装 5 个方法：`healthCheck`、`submitTask`、`getTaskStatus`、`downloadTaskResult`、`syncParseFile`
- 使用 `FormData` 构造 multipart 请求以支持文件数组
- 统一错误处理：提取后端错误信息并抛出自定义 `ApiError`
- `healthCheck` 设置 5 秒 AbortController 超时
- **决策**：`baseUrl` 从 `configService.get()` 动态读取，无需构造函数参数，保持单例简洁

#### 步骤 5：语法验证
- 执行 `tsc --noEmit` 通过，无类型错误
- 注意：`noUnusedLocals` 和 `noUnusedParameters` 严格模式下，任何未使用的 import 都会报错
- 验证 `ApiClient` 各方法签名与调用方无冲突

#### 步骤 6：最终验证
- `tsc --noEmit` 零错误通过
- 所有 4 个子任务均已完成交付

### 待解决问题
- `POST /file_parse` 同步接口目前仅封装，未被任何调用方引用 — 后续任务 C/D 会集成
- `downloadTaskResult` 返回 `Promise<Blob>`，ZIP 解压逻辑保留在任务 G 实现
- 当前未编写单元测试，需联调验证各端点

### 潜在改进点
- 可考虑引入 `fetch` 重试机制与请求拦截器
- 后续可根据实际后端响应结构细化类型定义（当前使用 `any` 过渡）

## 2026-06-21 — 任务 D：创建任务页面重写

### 概述
重写 `src/pages/createTask/index.tsx`，从仅支持 PDF 单文件上传 + 无参数配置升级为完整的参数配置面板布局，映射全部 19 个 API 参数。

### 实施步骤记录

#### 步骤 1：页面布局重构（D.1）
- 将原单区域布局拆分为纵向滚动布局：标题区 → 文件类型选择 → 基础设置 → 解析功能 → 返回内容 → 输出格式 → 高级设置 → 参数预览 → 上传区域
- 使用 SemiUI `Card` 组件分组，保持与 setting 页面一致的视觉风格

#### 步骤 2：文件类型选择器（D.2）
- 新增 `FILE_TYPE_OPTIONS` 常量，定义 6 种文件类型：
  - **PDF**（enabled: true，当前唯一可用）
  - PNG / JPG / DOCX / PPTX / XLSX（enabled: false，显示"即将支持"灰色禁用态）
- 使用 `Tag` 组件渲染文件类型标签，`Tooltip` 提示状态
- 上传区域 `accept` 和提示文字跟随当前选中的文件类型动态切换

#### 步骤 3：基础参数配置区域（D.3）
- 2×2 网格布局，4 个控件：
  - `backend` → `Select` 下拉框（5 个后端选项）
  - `parse_method` → `Select` 下拉框（auto/txt/ocr）
  - `effort` → `Select` 下拉框（medium/high）
  - `lang_list` → `TagInput` + 预设语言标签快速添加
- 每个控件下方标注对应的 API 参数名称，方便开发调试

#### 步骤 4：布尔开关参数区域（D.4）
- 三个分组卡片，分别对应：
  - **解析功能**：formula_enable / table_enable / image_analysis
  - **返回内容**：return_md / return_middle_json / return_model_output / return_content_list / return_images
  - **输出格式**：response_format_zip / return_original_file / client_side_output_generation
- 使用 `Switch` 组件，3 列网格布局
- `return_original_file` 在 `response_format_zip=false` 时自动禁用
- 关闭 ZIP 时联动关闭 `return_original_file`

#### 步骤 5：高级参数配置区域（D.5）
- 使用 `Collapse` 折叠面板收纳高级参数，默认收起
- `server_url` → `Input`，仅在 backend 为 `*-http-client` 时启用
- `start_page_id` / `end_page_id` → `InputNumber`，仅 PDF 模式启用
- 后端切换非 http-client 时自动清理 server_url 值

#### 步骤 6：提交逻辑集成（D.6）
- `handleBeforeUpload` 升级流程：
  1. 健康检查 `apiClient.healthCheck()`（5 秒超时）
  2. 检查通过 → `taskService.submitBatch([file], params)` 传递完整参数
  3. 检查失败 → `Toast.error("后端服务不可用")` 阻止上传
  4. 提交流程中 `setSubmitting(true)` 禁用上传区域防止重复提交
- 成功创建任务后保留原有 Toast 通知 + "点击查看"跳转链接

#### 步骤 7：参数 JSON 预览面板（D.7）
- 折叠按钮 "▸ 显示参数预览" / "▾ 隐藏参数预览"
- `useMemo` 实时计算当前参数的 JSON 字符串（过滤 null/undefined）
- 灰色代码块区域，`max-h-48` 滚动，辅助调试

#### 步骤 8：TypeScript 验证
- 执行 `tsc --noEmit` 通过，零类型错误
- 严格模式 `noUnusedLocals` / `noUnusedParameters` 均通过

### 决策记录
- **默认值策略**：DEFAULT_PARAMS 与后端默认值保持一致，用户首次打开页面时所有控件显示后端默认值
- **联动逻辑**：`response_format_zip` ↔ `return_original_file` 联动；`backend` 类型 ↔ `server_url` 可用性联动
- **参数预览**：作为可选增强添加，默认折叠不干扰主操作流程
- **console.log 日志**：关键操作（参数变更、提交流程各阶段）均输出日志，便于联调排查

### 变更文件
| 文件 | 操作 | 说明 |
|------|------|------|
| `src/pages/createTask/index.tsx` | 重写 | 65 行 → 727 行 |
| `devlog.md` | 追加 | 本记录 |

### 待解决问题
- PNG/JPG/DOCX/PPTX/XLSX 文件类型暂缓实现，当前仅展示禁用态占位 UI
- 健康检查守卫逻辑已集成，但健康检查模块本身的完整测试需联调验证
- 参数预览面板中的 JSON 使用 `useMemo` 计算，大参数场景下性能无瓶颈

## 2026-06-21 — 任务 E：健康检查前置守卫

### 概述
将 createTask 页面中原有的内联健康检查逻辑抽取为独立、可复用的守卫服务模块，并完善 UI 状态反馈（loading 态、错误内联警告、重试机制），提升用户在后端不可用时的操作体验。

### 实施步骤记录

#### 步骤 1：创建守卫服务模块（E.1）
- 新建 `src/service/health-guard.service.ts`
- 导出 `HealthGuard` 类（单例 `healthGuard`），封装核心方法：
  - `check()`：调用 `apiClient.healthCheck()`（5 秒超时），成功返回 `{ ok: true }`，失败返回 `{ ok: false, error }` 并递增计数
  - `reset()`：重置连续失败计数
  - `failCount` / `isExhausted`：追踪重试状态，上限 3 次
- 异常细分：`AbortError` → "响应超时"；`Error` → 提取 message；兜底 "后端服务不可用"
- 关键节点输出 `console.log` / `console.warn` 日志

#### 步骤 2：重构提交流程（E.2）
- 移除 `handleSubmit` 中的内联 `apiClient.healthCheck()` 调用，替换为 `healthGuard.check()`
- 新增状态：`checking`、`healthCheckFailed`、`healthCheckError`
- 提交按钮在检查中显示 `loading={true}` + 文字 "检查服务中…"
- 上传区状态文字根据 `checking` 切换为 "正在检查服务连接…" / "正在提交任务，请稍候..."
- 上传区在 `checking` 时禁用，阻止重复操作

#### 步骤 3：实现错误提示与内联警告（E.3）
- 健康检查失败时：`Toast.error("后端服务不可用")` 通知
- 页面顶部插入 `Banner type="danger"` 内联警告条（可关闭），显示后端错误信息
- 关闭警告时同时重置 `healthGuard` 计数

#### 步骤 4：实现重试机制（E.4）
- 新增 `handleRetryCheck` 回调：Banner 中的 "重试连接" 按钮
- 重试成功 → 清除警告，`Toast.success("后端服务已恢复连接")`
- 重试失败 → 更新错误信息，提示剩余次数
- 3 次上限后按钮变为 "已达重试上限" 禁用态，`Toast.warning` 提示检查服务配置
- 每次重试都输出 `console.log` 日志

#### 步骤 5：TypeScript 验证（E.5）
- 执行 `tsc --noEmit` 通过，零类型错误
- 注意：移除了未使用的 `apiClient` 导入（由 healthGuard 内部间接使用）
- SemiUI 组件使用 `Banner` 替代 `Alert`（SemiUI 无 Alert 导出）

### 变更文件
| 文件 | 操作 | 说明 |
|------|------|------|
| `src/service/health-guard.service.ts` | 新建 | 守卫服务模块，99 行 |
| `src/pages/createTask/index.tsx` | 修改 | 集成守卫状态、Banner 警告、重试按钮 |
| `devlog.md` | 追加 | 本记录 |

### 待解决问题
- 手动联调验证（E.6）需实际启动/停止后端服务进行，当前未执行
- `health-guard.service.ts` 无单元测试，后续可补充

## 2026-06-21 — 任务 F：轮询与顺序控制重构

### 概述
在已有批次粒度串行执行的基础上，增加 `queued_ahead` 排队位置信息的提取、存储与展示能力。

### 实施步骤记录

#### 步骤 1：运行时存储机制（F.1）
- 在 `TaskService` 中新增 `queuePositions: Map<string, number>` 字段
- 新增 `getQueuePosition(taskId: string): number | undefined` 公开方法
- 该 Map 仅运行时存在，不持久化到 SQLite 数据库

#### 步骤 2：轮询过程提取 queued_ahead（F.2）
- 修改 `pollTaskUntilComplete()`，每次 `getTaskStatus` 后提取 `statusResponse.queued_ahead`
- 写入 `queuePositions` Map 供 UI 实时读取
- 值变化时输出 `console.log("[TaskService] 任务 xxx 排队位置变化: ? → N")`
- 任务到达终态（completed/failed）时从 Map 中移除对应的 entry

#### 步骤 3：任务列表页展示排队位置（F.3）
- 新建 `QueueInfo` 组件，根据 `taskService.getQueuePosition()` 渲染排队信息：
  - `pos > 0` → "排队中，前方 N 个任务"（警告色）
  - `pos === 0` → "正在处理"（次级色）
  - `pos === undefined` → "等待中…"
- `StatusMap` 从硬编码 key 改为使用 `TaskStatus` 枚举值
- `useRequest` 在查看 pending/processing 状态时启用 `pollingInterval: 3000ms`，使排队信息自动刷新
- 状态标签增加兜底渲染，防止未定义的 status 值显示空白

#### 步骤 4：TypeScript 验证（F.4）
- 执行 `tsc --noEmit` 通过，零类型错误
- 严格模式 `noUnusedLocals` / `noUnusedParameters` 无违规

### 变更文件
| 文件 | 操作 | 说明 |
|------|------|------|
| `src/service/task.service.ts` | 修改 | 新增 `queuePositions` Map、`getQueuePosition()`；修改 `pollTaskUntilComplete()` 提取 `queued_ahead` |
| `src/pages/task/index.tsx` | 重写 | 新增 `QueueInfo` 组件、排队位置展示、轮询刷新、StatusMap 使用 TaskStatus 枚举 |
| `devlog.md` | 追加 | 本记录 |

### 待解决问题
- 任务列表页的 `StatusMap` 已更新为使用 `TaskStatus` 枚举，但 DB 中可能仍存在旧 status 值（如 "done"/"error"），需联调验证
- `queued_ahead` 展示依赖后端实际返回有效值，需启动后端服务验证端到端流程

