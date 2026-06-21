import AsyncQueryQueue from "@/lib/QueryQueue";
import { apiClient, ApiError } from "./api.client";
import type { Task, ParseTaskParams } from "./task.model";
import { TaskStatus } from "./task.model";
import { taskRepository, TaskRepository } from "./task.repository";
import { Notification } from "@douyinfe/semi-ui";
import { clearCache } from "ahooks";
import { configService } from "./config.service";
import { open } from "@tauri-apps/plugin-shell";

// ============================================================
// C.1 — 类型定义
// ============================================================

/**
 * 批次内任务信息
 */
export interface BatchFileItem {
  file: File;
  fileName: string;
}

/**
 * loadTask 返回结果（预览页使用，保持向后兼容）
 */
export interface LoadTaskResult {
  task: Task;
  contentList: ContentListItem[];
  pageNumber: number;
  markdowns: MarkdownItem[];
}

export interface ContentListItem {
  page_idx: number;
}

export interface MarkdownItem {
  page_idx: number;
  content?: string;
}

// ============================================================
// 工具函数（保持向后兼容）
// ============================================================

function addPrefixToImages(markdown: string, prefix: string): string {
  const imageRegex = /!\[.*?\]\((.*?)\)/g;
  return markdown.replace(imageRegex, (_match, imageUrl) => {
    const newImageUrl = `${prefix}${imageUrl}`;
    return `![](${newImageUrl})`;
  });
}

export async function loadMarkdown(url: string, imagePath: string) {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const contentType = response.headers.get("Content-Type") || "";
    let encoding = "utf-8";
    const match = contentType.match(/charset=([^;]+)/);
    if (match) {
      encoding = match[1];
    }

    const body = await response.arrayBuffer();
    const decoder = new TextDecoder(encoding);
    const markdownContent = decoder.decode(body);
    return addPrefixToImages(markdownContent, imagePath);
  } catch (error) {
    console.error("Error fetching markdown:", error);
  }
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// TaskService 主类
// ============================================================

/**
 * 任务服务
 *
 * 职责范围：
 * - 批量提交文件解析任务（C.2）
 * - 批次级串行轮询，保证完成顺序与提交顺序一致（C.3）
 * - 终态处理：通知 + DB 状态更新 + 触发下载（C.4）
 * - 结果 ZIP 下载与本地保存（C.5）
 * - 应用启动时恢复未完成任务（C.6）
 *
 * 调用方式：
 * ```typescript
 * import { taskService } from "./service/task.service";
 * const tasks = await taskService.submitBatch(files, { backend: "pipeline" });
 * ```
 */
export class TaskService {
  todoTasks: Task[] = [];
  taskRepository: TaskRepository;
  queue: AsyncQueryQueue = new AsyncQueryQueue();
  /** 轮询间隔（毫秒） */
  private readonly POLL_INTERVAL_MS = 1000;
  /** 批次内任务间间隔（毫秒） */
  private readonly BATCH_GAP_MS = 100;

  /**
   * 运行时排队位置存储。
   * key: task_id, value: 当前排队位置（queued_ahead）。
   * 仅用于实时 UI 展示，不持久化到数据库。
   */
  private queuePositions: Map<string, number> = new Map();

  constructor(taskRepository: TaskRepository) {
    this.taskRepository = taskRepository;
  }

  /**
   * 获取指定任务的当前排队位置。
   * 返回 undefined 表示该任务不在排队中（已完成/失败/未知）。
   */
  getQueuePosition(taskId: string): number | undefined {
    return this.queuePositions.get(taskId);
  }

  // ========================================================
  // C.2 — 批量提交
  // ========================================================

  /**
   * 批量提交文件解析任务。
   *
   * 对每个文件独立调用 POST /tasks，创建对应的 Task 记录，
   * 然后将整个批次入队进行串行轮询。
   *
   * @param files  待提交的文件列表（每个文件独立成任务）
   * @param params 解析参数（全部可选）
   * @returns      已创建的 Task 列表（按提交顺序）
   */
  async submitBatch(
    files: File[],
    params: ParseTaskParams = {},
  ): Promise<Task[]> {
    if (files.length === 0) {
      return [];
    }

    const createdTasks: Task[] = [];

    for (const file of files) {
      try {
        // 通过 ApiClient 提交单文件到后端
        const response = await apiClient.submitTask([file], params);

        // 创建本地 Task 记录
        const task: Task = {
          task_id: response.task_id,
          file_name: file.name,
          pdf_url: "",
          md_url: "",
          images: "",
          model_json: "",
          middle_json: "",
          content_list_json: "",
          status: TaskStatus.Pending,
          created_at: new Date().toISOString(),
        };

        await this.taskRepository.create(task);
        this.todoTasks.push(task);
        createdTasks.push(task);
      } catch (error) {
        const errorMsg = error instanceof ApiError
          ? error.message
          : "提交失败，请检查网络连接或后端服务";

        Notification.error({
          title: "任务提交失败",
          content: `文件：${file.name}，${errorMsg}`,
        });

        // 创建失败记录以便用户知晓
        const failedTask: Task = {
          task_id: `failed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file_name: file.name,
          pdf_url: "",
          md_url: "",
          images: "",
          model_json: "",
          middle_json: "",
          content_list_json: "",
          status: TaskStatus.Failed,
          created_at: new Date().toISOString(),
        };

        await this.taskRepository.create(failedTask);
        this.todoTasks.push(failedTask);
        createdTasks.push(failedTask);
      }
    }

    // 将整个批次入队为原子任务，确保串行执行
    const validTasks = createdTasks.filter(t => t.status === TaskStatus.Pending);
    if (validTasks.length > 0) {
      this.queue.enqueue(() => this.processBatch(validTasks));
    }

    return createdTasks;
  }

  // ========================================================
  // C.3 — 批次级串行轮询引擎
  // ========================================================

  /**
   * 串行处理批次内的所有任务。
   * 上一个任务到达终态后，间隔 BATCH_GAP_MS 再启动下一个任务。
   */
  private async processBatch(tasks: Task[]): Promise<void> {
    for (const task of tasks) {
      await this.pollTaskUntilComplete(task);
      await delay(this.BATCH_GAP_MS);
    }
  }

  /**
   * 轮询单个任务直到其到达终态（completed | failed）。
   *
   * 轮询策略：
   * - 间隔 POLL_INTERVAL_MS（1 秒）
   * - 永久等待，除非服务端返回失败或网络错误
   * - 中间状态变更时同步更新 DB
   */
  private async pollTaskUntilComplete(task: Task): Promise<void> {
    let lastQueuedAhead: number | undefined;

    while (true) {
      try {
        const statusResponse = await apiClient.getTaskStatus(task.task_id);
        const currentStatus = statusResponse.status;

        // ---- F.2: 提取 queued_ahead 并记录变化 ----
        const queuedAhead = statusResponse.queued_ahead ?? 0;
        this.queuePositions.set(task.task_id, queuedAhead);
        if (queuedAhead !== lastQueuedAhead) {
          console.log(
            `[TaskService] 任务 ${task.task_id} (${
              task.file_name
            }) 排队位置变化: ${lastQueuedAhead ?? "?"} → ${queuedAhead}`,
          );
          lastQueuedAhead = queuedAhead;
        }

        if (currentStatus === TaskStatus.Completed) {
          this.queuePositions.delete(task.task_id);
          await this.handleTaskCompleted(task);
          return;
        }

        if (currentStatus === TaskStatus.Failed) {
          this.queuePositions.delete(task.task_id);
          const errorMsg = statusResponse.error ?? "服务端处理失败";
          await this.handleTaskFailed(task, errorMsg);
          return;
        }

        // 仍在 pending / processing：同步中间状态到 DB
        if (task.status !== currentStatus) {
          clearCache("tasks_" + task.status);
          task.status = currentStatus;
          await this.taskRepository.update(task);
        }
      } catch (error) {
        // 网络错误：记录日志后继续轮询
        console.error(`轮询任务 ${task.task_id} 出错:`, error);

        if (error instanceof ApiError && error.status === 404) {
          // 任务在后端不存在（可能是旧任务或已被清理）
          this.queuePositions.delete(task.task_id);
          await this.handleTaskFailed(
            task,
            "任务在后端不存在，可能已被清理或使用了旧的任务 ID",
          );
          return;
        }
      }

      await delay(this.POLL_INTERVAL_MS);
    }
  }

  // ========================================================
  // C.4 — 终态处理 & 通知回调
  // ========================================================

  /**
   * 处理任务完成状态：更新 DB → 清除缓存 → 通知 → 自动下载（若配置了下载目录）
   *
   * 自动下载行为：
   * - 配置了 downloadDir：自动保存 ZIP 到该目录并通知
   * - 未配置 downloadDir：仅通知"任务已完成"，用户可在任务列表页手动点击下载
   */
  private async handleTaskCompleted(task: Task): Promise<void> {
    clearCache("tasks_" + task.status);
    clearCache("tasks_" + TaskStatus.Completed);

    task.status = TaskStatus.Completed;
    await this.taskRepository.update(task);

    const config = await configService.get();

    if (config.downloadDir) {
      console.log(
        `[TaskService] 任务 ${task.task_id} (${task.file_name}) 处理成功，检测到下载目录: ${config.downloadDir}，开始自动下载`,
      );
      const savedPath = await this.downloadAndSave(task);
      if (savedPath) {
        Notification.success({
          title: "任务处理成功",
          content: `文件：${task.file_name} 结果已保存到 ${savedPath}`,
          duration: 5,
        });
      }
    } else {
      console.log(
        `[TaskService] 任务 ${task.task_id} (${task.file_name}) 处理成功，未配置下载目录，仅通知`,
      );
      Notification.success({
        title: "任务处理成功",
        content: `文件：${task.file_name} 处理成功，点击"下载"按钮获取结果`,
        duration: 5,
      });
    }
  }

  /**
   * 处理任务失败状态：更新 DB → 清除缓存 → 通知
   */
  private async handleTaskFailed(task: Task, errorMsg: string): Promise<void> {
    clearCache("tasks_" + task.status);
    clearCache("tasks_" + TaskStatus.Failed);

    task.status = TaskStatus.Failed;
    await this.taskRepository.update(task);

    Notification.error({
      title: "任务处理失败",
      content: `文件：${task.file_name}，${errorMsg}`,
    });
  }

  // ========================================================
  // C.5 — 结果下载与本地保存（基础实现）
  // ========================================================

  /**
   * 下载任务结果 ZIP 并保存到本地。
   *
   * 保存策略（由 saveBlobToFile 内部根据 downloadDir 决定）：
   * - 配置了 downloadDir：ZIP 自动写入该目录，不对话框提示
   * - 未配置 downloadDir：弹出系统保存对话框让用户选择
   *
   * @param task  已完成的任务
   * @returns     保存的文件路径，失败时返回 null
   */
  async downloadAndSave(task: Task): Promise<string | null> {
    try {
      const blob = await apiClient.downloadTaskResult(task.task_id);
      console.log(
        `[TaskService] 任务 ${task.task_id} (${task.file_name}) 下载结果大小: ${blob.size} bytes`,
      );

      if (blob.size === 0) {
        throw new Error("下载内容为空");
      }

      // 将 Blob 转为 Uint8Array 用于 Tauri 文件写入
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // 读取当前配置的下载目录
      const config = await configService.get();
      const filePath = await this.saveBlobToFile(task, uint8Array, config.downloadDir);
      if (filePath) {
        console.log(`[TaskService] 结果已保存: ${filePath}`);
      }
      return filePath;
    } catch (error) {
      console.error(`[TaskService] 下载任务 ${task.task_id} (${task.file_name}) 结果失败:`, error);

      Notification.error({
        title: "下载失败",
        content: `文件：${task.file_name} 结果下载失败，请稍后重试`,
      });
      return null;
    }
  }

  /**
   * 将文件内容保存到本地磁盘。
   *
   * 两种保存模式：
   * 1. 自动保存模式（downloadDir 有值）：直接写入 downloadDir，文件名自动生成
   * 2. 手动保存模式（downloadDir 无值）：弹出系统保存对话框让用户选择路径
   *
   * 文件名规则：{原文件名不含扩展名}_{task_id前8位}.zip
   *
   * @param task         已完成的任务
   * @param data         文件二进制数据
   * @param downloadDir  可选，配置的下载目录；为 null/undefined 时弹出对话框
   * @returns            保存的文件路径，失败或取消时返回 null
   */
  private async saveBlobToFile(
    task: Task,
    data: Uint8Array,
    downloadDir?: string,
  ): Promise<string | null> {
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const { join } = await import("@tauri-apps/api/path");

    const fileNameBase = task.file_name.replace(/\.[^/.]+$/, "");
    const taskIdShort = task.task_id.length > 8 ? task.task_id.slice(0, 8) : task.task_id;
    const zipFileName = `${fileNameBase}_${taskIdShort}.zip`;

    if (downloadDir) {
      // ---- 自动保存模式：写入配置目录 ----
      try {
        const savePath = await join(downloadDir, zipFileName);
        console.log(`[TaskService] 自动保存到: ${savePath}`);
        await writeFile(savePath, data);
        console.log(`[TaskService] 写入完成: ${savePath} (${data.length} bytes)`);
        return savePath;
      } catch (error) {
        console.error(`[TaskService] 自动保存失败 (downloadDir=${downloadDir}):`, error);
        Notification.error({
          title: "自动保存失败",
          content: `文件：${task.file_name} 未能保存到 ${downloadDir}，请检查目录权限`,
        });
        return null;
      }
    }

    // ---- 手动保存模式：弹出对话框 ----
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");

      const savePath = await save({
        defaultPath: zipFileName,
        filters: [{ name: "ZIP 文件", extensions: ["zip"] }],
      });

      if (!savePath) {
        console.log(`[TaskService] 用户取消了保存对话框`);
        return null;
      }

      console.log(`[TaskService] 用户选择路径: ${savePath}`);
      await writeFile(savePath, data);
      console.log(`[TaskService] 写入完成: ${savePath} (${data.length} bytes)`);

      Notification.success({
        title: "结果已保存",
        content: `文件：${zipFileName} 已保存到 ${savePath}`,
      });

      return savePath;
    } catch (error) {
      console.warn(
        "[TaskService] Tauri 对话框插件不可用，无法交互式保存。",
        "数据大小:",
        data.length,
        "bytes",
        error,
      );
      return null;
    }
  }

  // ========================================================
  // C.6 — 应用启动时恢复未完成任务
  // ========================================================

  /**
   * 从数据库加载所有 pending / processing 任务并恢复轮询。
   *
   * 在应用启动时由 app.tsx 调用。
   * 新任务使用 apiClient.getTaskStatus() 轮询；
   * 旧任务（后端 404）会被标记为失败并提示用户。
   */
  public async loadTasks(): Promise<void> {
    const tasks = await this.taskRepository.list(
      "status in ($1, $2)",
      [TaskStatus.Pending, TaskStatus.Processing],
    );

    for (const task of tasks) {
      this.todoTasks.push(task);
    }

    // 将恢复的任务按批次编排（每个任务独立成批，按 created_at 排序）
    if (tasks.length > 0) {
      // 按 created_at 升序排列保证恢复后顺序一致
      const sorted = [...tasks].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      this.queue.enqueue(() => this.processBatch(sorted));
    }
  }

  // ========================================================
  // 旧方法（保持向后兼容，供预览页使用）
  // ========================================================

  /**
   * 加载 task 对象、分页数据、markdown 内容（旧路径方式）。
   *
   * 注意：此方法仍使用旧的 fileUrl 路径获取内容，
   * 新任务的预览支持将在后续任务（Task H）中实现。
   *
   * @param task_id 任务 ID
   */
  async loadTask(task_id: string): Promise<LoadTaskResult> {
    const task = await this.taskRepository.findById(task_id);

    if (!task) {
      throw new Error("任务不存在");
    }

    const config = await configService.get();

    if (!task.content_list_json) {
      // 新任务尚未有旧路径数据，返回空预览
      return {
        task,
        contentList: [],
        pageNumber: 0,
        markdowns: [],
      };
    }

    const contentList = await fetch(
      `${config.fileUrl}${task.content_list_json}`,
    )
      .then((r) => r.json())
      .then((r) => r as Array<{ page_idx: number }>);

    const pages = contentList?.[contentList.length - 1]?.page_idx ?? 0;
    const markdownLinks = new Array(pages)
      .fill(1)
      .map((_, index) => `${config.fileUrl}${task.images}/${index}.md`);
    const markdowns = await Promise.all(
      markdownLinks.map((link) => loadMarkdown(link, task.images)),
    );

    return {
      task,
      contentList,
      pageNumber: pages,
      markdowns: markdowns.map((content, index) => ({
        page_idx: index + 1,
        content,
      })),
    };
  }

  /**
   * 打包任务（旧方式，仅对旧任务有效）。
   * @deprecated 将在后续版本中移除，新任务请使用 downloadAndSave
   */
  async packageTask(task_id: string): Promise<void> {
    const config = await configService.get();
    open(`${config.uploadUrl}/pack/${task_id}`);
  }
}

/** TaskService 全局单例 */
export const taskService = new TaskService(taskRepository);
