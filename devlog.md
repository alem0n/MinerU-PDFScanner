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
