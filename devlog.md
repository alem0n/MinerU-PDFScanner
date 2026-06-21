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
