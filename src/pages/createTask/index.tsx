/**
 * 创建任务页面
 *
 * 功能：
 * - 左侧上传区：拖拽/点击上传文件，支持 PDF/JPG/PNG 格式，自动提取 PDF 页数
 * - 右侧配置面板：解析后端选择、页码范围双滑块（起始页 ~ 结束页）、高级选项（条件渲染）
 *
 * 双滑块（Range Slider）：
 *   滑块值 [startPage, endPage]（1-based），左手柄 = 起始页，右手柄 = 结束页
 *   映射到后端参数（0-based）：
 *     start_page_id = startPage - 1
 *     end_page_id   = endPage - 1
 *
 * 配置面板渲染逻辑：
 *   1. 通用配置区：始终显示"启用表格识别"和"启用行内公式识别"
 *   2. 动态配置区：根据当前选定的解析后端，显示对应的专有配置项
 *      - hybrid-engine → 解析强度 + 强制启用OCR
 *      - vlm-engine    → 启用图片分析
 *      - pipeline      → OCR语言 + 强制启用OCR
 *   3. 后端切换时，清空旧后端的专有数据，恢复新后端的缺省值，全局数据保持不变
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Typography,
  Card,
  Select,
  Checkbox,
  RadioGroup,
  Radio,
  Button,
  Toast,
  Banner,
  Input,
} from "@douyinfe/semi-ui";

import { Page } from "@/components/Page";
import { useNavigate } from "react-router-dom";
import { TaskStatus } from "@/service/task.model";
import { taskService } from "@/service/task.service";
import { healthGuard, MAX_RETRY_COUNT } from "@/service/health-guard.service";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import type {
  ParseTaskParams,
  BackendOption,
  EffortOption,
  LangOption,
  FileItem,
} from "@/service/task.model";

const { Text, Title } = Typography;

// 初始化 pdf.js worker（与 PdfViewer 保持一致的加载方式）
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// ========================================================
// 常量定义
// ========================================================

/**
 * 解析参数默认值（与后端默认值保持一致）
 * 参见：openapi.json Body_submit_parse_task_tasks_post
 */
const DEFAULT_PARAMS: ParseTaskParams = {
  backend: "hybrid-engine",
  parse_method: "auto",
  effort: "medium",
  lang_list: [],
  formula_enable: true,
  table_enable: true,
  image_analysis: true,
  return_md: true,
  return_middle_json: true,
  return_model_output: true,
  return_content_list: true,
  return_images: true,
  response_format_zip: true,
  return_original_file: true,
  client_side_output_generation: false,
  start_page_id: 0,
  end_page_id: 99999,
};

/** 后端引擎选项（仅保留三个原生引擎，已移除 HTTP Client） */
const BACKEND_OPTIONS: { value: BackendOption; label: string }[] = [
  { value: "hybrid-engine", label: "Hybrid Engine（混合引擎）" },
  { value: "vlm-engine", label: "VLM Engine（视觉语言模型）" },
  { value: "pipeline", label: "Pipeline（传统OCR管线）" },
];

/** 通用配置项（始终渲染，不受后端选择影响） */
const GLOBAL_OPTIONS: {
  key: string;
  label: string;
  description: string;
}[] = [
  { key: "table_enable", label: "启用表格识别", description: "识别并提取文档中的表格数据" },
  { key: "formula_enable", label: "启用行内公式识别", description: "识别并提取文档中的数学公式" },
];

/** 管道引擎支持的 OCR 语言选项 */
const LANG_OPTIONS: { value: LangOption; label: string }[] = [
  { value: "ch", label: "ch — 中文、英文、日文、繁体中文、拉丁文" },
  { value: "ch_server", label: "ch_server — 中文、英文、日文、繁体中文、拉丁文" },
  { value: "korean", label: "korean — 韩文、英文" },
  { value: "ta", label: "ta — 泰米尔文、英文" },
  { value: "te", label: "te — 泰卢固文、英文" },
  { value: "ka", label: "ka — 卡纳达文" },
  { value: "th", label: "th — 泰文、英文" },
  { value: "el", label: "el — 希腊文、英文" },
  { value: "arabic", label: "arabic — 阿拉伯文、波斯文、维吾尔文、乌尔都文、普什图文、库尔德文、信德文、俾路支文、英文" },
  { value: "east_slavic", label: "east_slavic — 俄文、白俄罗斯文、乌克兰文、英文" },
  { value: "cyrillic", label: "cyrillic — 俄文、白俄罗斯文、乌克兰文、塞尔维亚文（西里尔）、保加利亚文、蒙古文等" },
  { value: "devanagari", label: "devanagari — 印地文、马拉地文、尼泊尔文、比哈尔文、迈蒂利文等" },
];

/** 当 PDF 页数未知时，滑块的默认最大值（表示无限制） */
const FALLBACK_MAX_PAGES = 99999;

// ========================================================
// 工具：后端专有配置的缺省值
// ========================================================

/**
 * 获取指定后端的专有配置缺省值
 * 切换后端时，使用此函数为新的后端设置专有配置的初始值
 */
function getBackendDefaults(backend: BackendOption): Partial<ParseTaskParams> {
  switch (backend) {
    case "hybrid-engine":
      return { effort: "medium", parse_method: "auto" };
    case "vlm-engine":
      return { image_analysis: true };
    case "pipeline":
      return { lang_list: [], parse_method: "auto" };
    default:
      return {};
  }
}

/**
 * 获取指定后端的专有配置键列表
 * 切换后端时，使用此列表清空旧后端的专有数据
 */
function getBackendKeys(backend: BackendOption): (keyof ParseTaskParams)[] {
  switch (backend) {
    case "hybrid-engine":
      return ["effort", "parse_method"];
    case "vlm-engine":
      return ["image_analysis"];
    case "pipeline":
      return ["lang_list", "parse_method"];
    default:
      return [];
  }
}

/**
 * 校验输入框中文本是否为合法整数且处于 [min, max] 范围内
 */
function validateIntInput(raw: string, min: number, max: number): { ok: true; value: number } | { ok: false; reason: string } {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, reason: "请输入正整数" };
  }
  const n = parseInt(trimmed, 10);
  if (isNaN(n)) {
    return { ok: false, reason: "请输入正整数" };
  }
  if (n < min) {
    return { ok: false, reason: `最小值为 ${min}` };
  }
  if (n > max) {
    return { ok: false, reason: `最大值为 ${max}` };
  }
  return { ok: true, value: n };
}

// ========================================================
// 页面组件
// ========================================================

export function Component() {
  const navigate = useNavigate();

  // ---- 基础状态 ----
  const [params, setParams] = useState<ParseTaskParams>({ ...DEFAULT_PARAMS });
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [healthCheckFailed, setHealthCheckFailed] = useState(false);
  const [healthCheckError, setHealthCheckError] = useState("");
  const [showPreview, setShowPreview] = useState(true);
  const [previewCategory, setPreviewCategory] = useState<string>("all");

  // ---- 页码与分页状态 ----
  /** PDF 实际总页数（null 表示未知，如尚未上传 PDF 或读取失败） */
  const [totalPages, setTotalPages] = useState<number | null>(null);
  /** PDF 页数读取中 */
  const [pdfLoading, setPdfLoading] = useState(false);

  // ---- 输入框编辑状态 ----
  /** 起始页输入框的当前文本（未确认前可任意输入） */
  const [startInput, setStartInput] = useState("");
  /** 结束页输入框的当前文本 */
  const [endInput, setEndInput] = useState("");
  /** 各输入框的错误提示（非空表示有错误） */
  const [startError, setStartError] = useState("");
  const [endError, setEndError] = useState("");
  /** 是否正在编辑（用于区分用户主动编辑 vs 外部状态同步导致的 set） */
  const [editingStart, setEditingStart] = useState(false);
  const [editingEnd, setEditingEnd] = useState(false);

  // ---- 计算属性 ----
  const currentBackend = params.backend ?? "hybrid-engine";
  const isForceOcr = params.parse_method === "ocr";

  /**
   * 最大页码：PDF 总页数；当 totalPages 未知时使用 FALLBACK_MAX_PAGES
   */
  const maxPage = useMemo(() => {
    return totalPages ?? FALLBACK_MAX_PAGES;
  }, [totalPages]);

  /**
   * 从 params (后端 0-based 页码) 推导出当前滑块范围 [startPage, endPage]（1-based）
   */
  const sliderValue: [number, number] = useMemo(() => {
    const defaultStart = 1;
    const defaultEnd = maxPage;

    let start: number, end: number;

    if (params.start_page_id != null && params.start_page_id >= 0) {
      start = params.start_page_id + 1; // 0-based → 1-based
    } else {
      start = defaultStart;
    }

    if (params.end_page_id != null && params.end_page_id < 99999) {
      end = params.end_page_id + 1; // 0-based → 1-based
    } else {
      end = defaultEnd;
    }

    // 约束到有效范围
    start = Math.max(1, Math.min(start, maxPage));
    end = Math.max(start, Math.min(end, maxPage));

    return [start, end];
  }, [params.start_page_id, params.end_page_id, maxPage]);

  /** 滑块起始值（用于展示） */
  const sliderStart = sliderValue[0];
  /** 滑块结束值（用于展示） */
  const sliderEnd = sliderValue[1];

  // ---- 同步输入框与滑块值（仅在非编辑状态下） ----
  useEffect(() => {
    if (!editingStart) {
      setStartInput(String(sliderStart));
      setStartError("");
    }
  }, [sliderStart, editingStart]);

  useEffect(() => {
    if (!editingEnd) {
      setEndInput(String(sliderEnd));
      setEndError("");
    }
  }, [sliderEnd, editingEnd]);

  /** 当前参数对象的 JSON 预览（过滤掉 null/undefined） */
  const paramsJson = useMemo(() => {
    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        filtered[key] = value;
      }
    }
    return JSON.stringify(filtered, null, 2);
  }, [params]);

  /** 根据选中的分类计算 textarea 预览内容 */
  const previewContent = useMemo(() => {
    if (previewCategory === "all") return paramsJson;

    let keys: string[];
    if (previewCategory === "general") {
      keys = GLOBAL_OPTIONS.map((o) => o.key);
    } else {
      // backend
      keys = getBackendKeys(currentBackend) as string[];
    }

    const filtered: Record<string, unknown> = {};
    for (const key of keys) {
      const val = (params as Record<string, unknown>)[key];
      if (val !== undefined && val !== null) {
        filtered[key] = val;
      }
    }
    return JSON.stringify(filtered, null, 2);
  }, [previewCategory, paramsJson, params, currentBackend]);

  // ---- 通用参数更新函数 ----

  /** 更新单个解析参数 */
  function updateParam<K extends keyof ParseTaskParams>(
    key: K,
    value: ParseTaskParams[K],
  ) {
    setParams((prev) => {
      const next = { ...prev, [key]: value };
      console.log(`[CreateTask] 参数变更: ${key} =`, value, "→ 完整参数:", next);
      return next;
    });
  }

  // ---- 后端切换逻辑 ----

  /**
   * 解析后端切换时：
   * 1. 清空旧后端的专有数据
   * 2. 保留全局数据（表格识别、公式识别等通用开关）
   * 3. 激活新后端的缺省值
   */
  const handleBackendChange = useCallback((backend: BackendOption) => {
    setParams((prev) => {
      const oldKeys = getBackendKeys(prev.backend ?? "hybrid-engine");
      // 步骤1：清空旧后端专有数据
      const cleared = { ...prev };
      for (const key of oldKeys) {
        delete cleared[key];
      }
      // 步骤2：设置新的后端标识
      cleared.backend = backend;
      // 步骤3：激活新后端的缺省值
      const defaults = getBackendDefaults(backend);
      Object.assign(cleared, defaults);
      console.log(`[CreateTask] 后端切换: ${prev.backend} → ${backend}`, cleared);
      return cleared;
    });
  }, []);

  // ---- 事件处理 ----

  /** 检测是否在 Tauri 桌面端运行 */
  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  /**
   * 使用 pdfjs-dist 提取 PDF 文件的总页数
   */
  const extractPdfPageCount = useCallback(async (fileItem: FileItem) => {
    // 仅 PDF 文件需要提取页数
    if (!fileItem.name.toLowerCase().endsWith(".pdf")) {
      setTotalPages(null);
      return;
    }

    setPdfLoading(true);
    try {
      let data: ArrayBuffer;
      if (fileItem.path) {
        // Tauri 模式：从磁盘读取
        const { readFile } = await import("@tauri-apps/plugin-fs");
        const uint8 = await readFile(fileItem.path);
        data = uint8.buffer as ArrayBuffer;
      } else if (fileItem.file) {
        // 浏览器模式：从 File 对象读取
        data = await fileItem.file.arrayBuffer();
      } else {
        return;
      }

      // 使用模块顶层的 pdfjsLib（worker 已在导入时配置）
      const loadingTask = pdfjsLib.getDocument({ data });
      const doc = await loadingTask.promise;
      const numPages = doc.numPages;
      setTotalPages(numPages);

      // 自动设置结束页码为实际总页数
      setParams((prev) => ({
        ...prev,
        end_page_id: Math.max(numPages - 1, 0),
      }));

      // 同步输入框
      setEndInput(String(numPages));

      console.log(`[CreateTask] PDF 页数: ${numPages}`);
    } catch (err) {
      console.error("[CreateTask] PDF 页数提取失败:", err);
      setTotalPages(null);
    } finally {
      setPdfLoading(false);
    }
  }, []);

  /** 选择文件 */
  const handleSelectFile = useCallback(async () => {
    if (isTauri) {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const selected = await open({
          multiple: false,
          filters: [
            {
              name: "文档/图片",
              extensions: ["pdf", "jpg", "jpeg", "png"],
            },
          ],
        });
        if (selected && typeof selected === "string") {
          // 从路径中提取文件名
          const parts = selected.replace(/\\/g, "/").split("/");
          const fileName = parts[parts.length - 1];
          const fileItem: FileItem = { name: fileName, size: 0, path: selected };
          setSelectedFile(fileItem);
          Toast.info(`已选择文件: ${fileName}`);
          // 提取 PDF 页数
          extractPdfPageCount(fileItem);
        }
      } catch (err) {
        console.error("[CreateTask] Tauri 文件对话框错误:", err);
        Toast.error("文件选择失败");
      }
    } else {
      // 浏览器开发模式：通过隐藏的 input 选取
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".pdf,.jpg,.jpeg,.png";
      input.onchange = (e: Event) => {
        const target = e.target as HTMLInputElement;
        const file = target.files?.[0];
        if (file) {
          const fileItem: FileItem = { name: file.name, size: file.size, file };
          setSelectedFile(fileItem);
          Toast.info(`已选择文件: ${file.name}`);
          // 提取 PDF 页数
          extractPdfPageCount(fileItem);
        }
      };
      input.click();
    }
  }, [isTauri, extractPdfPageCount]);

  /** 清除已选文件 */
  const handleClearFile = useCallback(() => {
    setSelectedFile(null);
    setTotalPages(null);
    // 重置 params 中的页码范围到默认
    setParams((prev) => ({
      ...prev,
      start_page_id: DEFAULT_PARAMS.start_page_id,
      end_page_id: DEFAULT_PARAMS.end_page_id,
    }));
  }, []);

  // ---- 输入框提交回调 ----

  /** 提交起始页输入 */
  const commitStartInput = useCallback(
    (raw: string) => {
      const result = validateIntInput(raw, 1, maxPage);
      if (!result.ok) {
        setStartError(result.reason);
        // 恢复为上次合法值
        setStartInput(String(sliderStart));
        return;
      }
      const newStart = result.value;
      // 保证 start ≤ end
      if (newStart > sliderEnd) {
        setStartError(`起始页不能大于结束页（${sliderEnd}）`);
        setStartInput(String(sliderStart));
        return;
      }
      setStartError("");
      setEditingStart(false);

      setParams((prev) => ({
        ...prev,
        start_page_id: newStart - 1,
        end_page_id: sliderEnd - 1,
      }));
    },
    [maxPage, sliderStart, sliderEnd],
  );

  const handleStartInputChange = useCallback((value: string) => {
    // 只允许输入数字
    const digits = value.replace(/\D/g, "");
    setStartInput(digits);
    setEditingStart(true);
    setStartError("");
  }, []);

  const handleStartInputBlur = useCallback(() => {
    commitStartInput(startInput);
  }, [commitStartInput, startInput]);

  const handleStartInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        commitStartInput(startInput);
      } else if (e.key === "Escape") {
        setStartInput(String(sliderStart));
        setStartError("");
        setEditingStart(false);
      }
    },
    [commitStartInput, startInput, sliderStart],
  );

  // ---- 结束块输入框回调 ----

  /** 提交结束页输入 */
  const commitEndInput = useCallback(
    (raw: string) => {
      const result = validateIntInput(raw, 1, maxPage);
      if (!result.ok) {
        setEndError(result.reason);
        setEndInput(String(sliderEnd));
        return;
      }
      const newEnd = result.value;
      // 保证 end ≥ start
      if (newEnd < sliderStart) {
        setEndError(`结束页不能小于起始页（${sliderStart}）`);
        setEndInput(String(sliderEnd));
        return;
      }
      setEndError("");
      setEditingEnd(false);

      setParams((prev) => ({
        ...prev,
        start_page_id: sliderStart - 1,
        end_page_id: newEnd - 1,
      }));
    },
    [maxPage, sliderStart, sliderEnd],
  );

  const handleEndInputChange = useCallback((value: string) => {
    const digits = value.replace(/\D/g, "");
    setEndInput(digits);
    setEditingEnd(true);
    setEndError("");
  }, []);

  const handleEndInputBlur = useCallback(() => {
    commitEndInput(endInput);
  }, [commitEndInput, endInput]);

  const handleEndInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        commitEndInput(endInput);
      } else if (e.key === "Escape") {
        setEndInput(String(sliderEnd));
        setEndError("");
        setEditingEnd(false);
      }
    },
    [commitEndInput, endInput, sliderEnd],
  );

  /** 强制启用 OCR 开关 → 控制 parse_method */
  const handleForceOcrChange = useCallback(
    (checked: boolean) => {
      updateParam("parse_method", checked ? ("ocr" as const) : ("auto" as const));
    },
    [],
  );

  // ---- 提交流程 ----

  const handleSubmit = useCallback(async () => {
    if (!selectedFile) {
      Toast.warning({ content: "请先选择文件", duration: 2 });
      return;
    }

    console.log(
      `[CreateTask] 开始提交流程: name="${selectedFile.name}", path=${selectedFile.path ?? "(浏览器)"}, params=`,
      params,
    );

    // ---- 步骤 1：健康检查 ----
    setChecking(true);
    setHealthCheckFailed(false);
    setHealthCheckError("");

    const result = await healthGuard.check();

    if (!result.ok) {
      console.warn(`[CreateTask] 健康检查失败 (第 ${result.attempt} 次): ${result.error}`);
      setHealthCheckFailed(true);
      setHealthCheckError(result.error ?? "后端服务不可用");
      setChecking(false);

      Toast.error({
        content: result.error ?? "后端服务不可用，请检查服务是否已启动",
        duration: 3,
      });

      // 提示剩余重试次数
      if (!healthGuard.isExhausted) {
        const remaining = MAX_RETRY_COUNT - healthGuard.failCount;
        Toast.info({
          content: `可点击"重试连接"重新检查（剩余 ${remaining} 次）`,
          duration: 3,
        });
      }
      return;
    }

    console.log("[CreateTask] 健康检查通过");
    setChecking(false);

    // ---- 步骤 2：提交任务 ----
    setSubmitting(true);
    try {
      const tasks = await taskService.submitBatch([selectedFile], params);
      const task = tasks[0];

      if (task && task.state !== TaskStatus.Failed) {
        console.log(
          `[CreateTask] 任务创建成功: task_id="${task.task_id}", file="${task.file_name}"`,
        );

        Toast.info({
          content: (
            <span>
              <Text>任务创建成功，</Text>
              <Text
                link
                className="ml-3"
                onClick={() => navigate(`/task/preview/${task.task_id}`)}
              >
                点击查看
              </Text>
            </span>
          ),
        });
      }
    } catch (err) {
      console.error("[CreateTask] 提交任务时发生未预期错误:", err);
    } finally {
      setSubmitting(false);
    }
  }, [selectedFile, params, navigate]);

  /** 重试健康检查 */
  const handleRetryCheck = useCallback(async () => {
    if (healthGuard.isExhausted) {
      Toast.warning({
        content: `已连续重试 ${MAX_RETRY_COUNT} 次仍无法连接，请检查服务配置`,
        duration: 4,
      });
      return;
    }

    console.log("[CreateTask] 用户触发重试健康检查");
    setChecking(true);

    const result = await healthGuard.check();

    if (result.ok) {
      console.log("[CreateTask] 重试健康检查通过");
      setHealthCheckFailed(false);
      setHealthCheckError("");
      setChecking(false);
      healthGuard.reset();
      Toast.success({ content: "后端服务已恢复连接", duration: 2 });
    } else {
      console.warn(`[CreateTask] 重试健康检查失败 (第 ${result.attempt} 次): ${result.error}`);
      setHealthCheckError(result.error ?? "后端服务不可用");
      setChecking(false);

      Toast.error({
        content: `重试失败: ${result.error}`,
        duration: 3,
      });

      if (healthGuard.isExhausted) {
        Toast.warning({
          content: `多次重试仍无法连接，请检查服务配置`,
          duration: 4,
        });
      } else {
        const remaining = MAX_RETRY_COUNT - healthGuard.failCount;
        Toast.info({
          content: `可继续重试（剩余 ${remaining} 次）`,
          duration: 3,
        });
      }
    }
  }, []);

  /** 清除所有配置 */
  const handleClear = useCallback(() => {
    console.log("[CreateTask] 清除所有配置");
    setParams({ ...DEFAULT_PARAMS });
    setSelectedFile(null);
    setTotalPages(null);
    setStartInput("1");
    setEndInput("1");
    setStartError("");
    setEndError("");
    Toast.info("已重置所有配置");
  }, []);

  // ========================================================
  // 渲染
  // ========================================================

  return (
    <Page>
      <div className="w-full h-full flex flex-col gap-4 overflow-auto pb-8">
        {/* ---- 页面标题 ---- */}
        <div>
          <Title heading={3}>创建解析任务</Title>
          <Text type="secondary">
            选择文件并配置解析参数后提交任务
          </Text>
        </div>

        {/* ---- 健康检查失败内联警告 ---- */}
        {healthCheckFailed && (
          <Banner
            type="danger"
            closeIcon
            onClose={() => {
              setHealthCheckFailed(false);
              setHealthCheckError("");
              healthGuard.reset();
            }}
            description={
              <div className="flex items-center gap-3">
                <span>⚠️ 后端服务不可用：{healthCheckError}，文件无法提交</span>
                <Button
                  size="small"
                  theme="solid"
                  type="danger"
                  loading={checking}
                  disabled={checking || healthGuard.isExhausted}
                  onClick={handleRetryCheck}
                >
                  {checking ? "检查中…" : healthGuard.isExhausted ? "已达重试上限" : "重试连接"}
                </Button>
              </div>
            }
          />
        )}

        {/* ================================================ */}
        {/* 双栏并排布局：上传区（左）+ 配置面板（右）       */}
        {/* ================================================ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* -------------------------------------------------- */}
          {/* D.1 — 上传区（左侧卡片）                          */}
          {/* -------------------------------------------------- */}
          <Card title="上传区" className="w-full min-h-[600px]">
            <div className="flex flex-col gap-4 h-full">
              {/* 大号文件选择区域 */}
              <div className="flex-1 flex flex-col items-center justify-center">
                <div
                  onClick={submitting ? undefined : handleSelectFile}
                  className={`
                    w-full h-48 flex flex-col items-center justify-center
                    border-2 border-dashed rounded-lg cursor-pointer
                    transition-colors duration-200
                    ${selectedFile
                      ? "border-green-400 bg-green-50 dark:bg-green-900/20"
                      : "border-gray-300 hover:border-blue-400 hover:bg-blue-50 dark:border-gray-600 dark:hover:border-blue-500 dark:hover:bg-blue-900/20"
                    }
                    ${submitting ? "opacity-50 cursor-not-allowed" : ""}
                  `}
                >
                  {selectedFile ? (
                    <div className="text-center px-4">
                      <svg className="w-10 h-10 mx-auto mb-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-sm font-medium text-green-600 dark:text-green-400 truncate max-w-[200px]">
                        {selectedFile.name}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">点击重新选择文件</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <svg className="w-12 h-12 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-300">点击选择文件</p>
                      <p className="text-xs text-gray-400 mt-1">支持 PDF、JPG、PNG 等格式</p>
                    </div>
                  )}
                </div>
              </div>

              {/* 已选文件信息 + 取消选择按钮 */}
              {selectedFile && !submitting && (
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center gap-2">
                    <Text size="small" type="success">
                      已选择: {selectedFile.name}
                    </Text>
                    <Button size="small" type="danger" theme="borderless" onClick={handleClearFile}>
                      取消
                    </Button>
                  </div>
                  {/* 显示 PDF 页数或加载状态 */}
                  {selectedFile.name.toLowerCase().endsWith(".pdf") && (
                    <div className="flex items-center gap-1">
                      {pdfLoading ? (
                        <Text size="small" type="tertiary">
                          <span className="inline-block animate-pulse">正在读取 PDF 页数…</span>
                        </Text>
                      ) : totalPages != null ? (
                        <Text size="small" type="tertiary">
                          该 PDF 共 <span className="font-medium text-blue-500">{totalPages}</span> 页
                        </Text>
                      ) : (
                        <Text size="small" type="warning">
                          无法读取 PDF 页数
                        </Text>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 提交中 / 检查中 状态 */}
              {(submitting || checking) && (
                <Text type="secondary" className="text-center">
                  <span className="inline-block animate-pulse">
                    {checking ? "正在检查服务连接…" : "正在提交任务，请稍候..."}
                  </span>
                </Text>
              )}

              {/* 支持格式说明 */}
              <div className="text-center">
                <Text size="small" type="tertiary">
                  支持 PDF、JPG、PNG 等格式
                </Text>
              </div>
            </div>
          </Card>

          {/* -------------------------------------------------- */}
          {/* D.2 — 配置面板（右侧卡片）                        */}
          {/* -------------------------------------------------- */}
          <Card title="配置面板" className="w-full h-full">
            <div className="flex flex-col gap-5">

              {/* ---- 解析后端选择器 ---- */}
              <div>
                <Text className="block mb-2 font-medium">解析后端</Text>
                <Select
                  value={currentBackend}
                  onChange={(v) => handleBackendChange(v as BackendOption)}
                  style={{ width: "100%" }}
                >
                  {BACKEND_OPTIONS.map((opt) => (
                    <Select.Option key={opt.value} value={opt.value}>
                      {opt.label}
                    </Select.Option>
                  ))}
                </Select>
              </div>

              {/* ---- 页码范围（双滑块 + 数值输入框） ---- */}
              <div>
                <Text className="block mb-2 font-medium">页码范围</Text>

                {/* 起始页 / 结束页 输入框 */}
                <div className="flex items-center gap-2 mb-2">
                  {/* 起始页输入 */}
                  <div className="flex-1">
                    <Text size="small" type="tertiary" className="block mb-1">
                      起始页
                    </Text>
                    <Input
                      size="small"
                      value={startInput}
                      onChange={handleStartInputChange}
                      onBlur={handleStartInputBlur}
                      onKeyDown={handleStartInputKeyDown}
                      validateStatus={startError ? "error" : undefined}
                      placeholder="1"
                    />
                    {startError && (
                      <Text size="small" style={{ color: "var(--semi-color-danger)" }} className="block mt-0.5">
                        {startError}
                      </Text>
                    )}
                  </div>

                  <div className="flex items-center justify-center pt-5 px-1">
                    <Text type="tertiary">—</Text>
                  </div>

                  {/* 结束页输入 */}
                  <div className="flex-1">
                    <Text size="small" type="tertiary" className="block mb-1">
                      结束页
                    </Text>
                    <Input
                      size="small"
                      value={endInput}
                      onChange={handleEndInputChange}
                      onBlur={handleEndInputBlur}
                      onKeyDown={handleEndInputKeyDown}
                      validateStatus={endError ? "error" : undefined}
                      placeholder={maxPage > 1 ? String(maxPage) : "1"}
                    />
                    {endError && (
                      <Text size="small" style={{ color: "var(--semi-color-danger)" }} className="block mt-0.5">
                        {endError}
                      </Text>
                    )}
                  </div>
                </div>

                {/* 双向进度条（只读，蓝色填充显示所选范围占总内容的比重） */}
                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full relative overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full absolute transition-[left,width] duration-150"
                    style={(() => {
                      const range = Math.max(maxPage - 1, 1);
                      const leftPct = ((sliderStart - 1) / range) * 100;
                      const widthPct = ((sliderEnd - sliderStart) / range) * 100;
                      return { left: `${Math.max(0, leftPct)}%`, width: `${Math.max(0, widthPct)}%` };
                    })()}
                  />
                </div>

                {/* 滑块底部信息 */}
                <div className="flex justify-between items-center mt-1">
                  <Text size="small" type="tertiary">
                    {totalPages
                      ? `共 ${totalPages} 页`
                      : "未检测到 PDF 页数（默认 1-99999）"}
                  </Text>
                  <Text size="small" type="tertiary">
                    {sliderStart === sliderEnd
                      ? `第 ${sliderStart} 页`
                      : `第 ${sliderStart} - ${sliderEnd} 页`}
                  </Text>
                </div>
              </div>

              {/* ---- 分隔线 ---- */}
              <hr className="border-t border-gray-200 dark:border-gray-700" />

              {/* ================================================ */}
              {/* 高级选项（遵循配置项归属矩阵）                 */}
              {/* ================================================ */}
              <div>
                <Text className="block mb-3 font-medium">高级选项</Text>
                <div className="flex flex-col gap-3">

                  {/* ---- 第一步：通用配置区（始终渲染） ---- */}
                  {GLOBAL_OPTIONS.map((opt) => (
                    <Checkbox
                      key={opt.key}
                      checked={!!(params as Record<string, unknown>)[opt.key]}
                      onChange={(e) =>
                        updateParam(
                          opt.key as keyof ParseTaskParams,
                          (e.target.checked ?? false) as any,
                        )
                      }
                      extra={opt.description}
                    >
                      {opt.label}
                    </Checkbox>
                  ))}
                </div>

                {/* ---- 第二步：动态组件区（根据后端条件渲染） ---- */}
                <div className="flex flex-col gap-3 mt-3">
                  {/* ------ hybrid-engine 专有 ------ */}
                  {currentBackend === "hybrid-engine" && (
                    <>
                      {/* 解析强度 */}
                      <div>
                        <Text className="block mb-2 font-medium">解析强度</Text>
                        <RadioGroup
                          value={params.effort ?? "medium"}
                          onChange={(v: any) => {
                            const val = v?.target?.value ?? v;
                            updateParam("effort", val as EffortOption);
                          }}
                        >
                          <Radio value="medium" style={{ marginRight: 24 }}>
                            普通
                          </Radio>
                          <Radio value="high">深度</Radio>
                        </RadioGroup>
                        <Text size="small" type="tertiary" className="block mt-1">
                          深度模式会消耗更多资源，但解析结果更精细
                        </Text>
                      </div>
                      {/* 强制启用 OCR */}
                      <Checkbox
                        checked={isForceOcr}
                        onChange={(e) => handleForceOcrChange(e.target.checked ?? false)}
                        extra="对扫描件强制启用 OCR 识别"
                      >
                        强制启用 OCR
                      </Checkbox>
                    </>
                  )}

                  {/* ------ vlm-engine 专有 ------ */}
                  {currentBackend === "vlm-engine" && (
                    <Checkbox
                      checked={!!params.image_analysis}
                      onChange={(e) =>
                        updateParam("image_analysis", e.target.checked ?? false)
                      }
                      extra="对文档中的图片进行分析处理"
                    >
                      启用图片分析
                    </Checkbox>
                  )}

                  {/* ------ pipeline 专有 ------ */}
                  {currentBackend === "pipeline" && (
                    <>
                      {/* OCR 语言 */}
                      <div>
                        <Text className="block mb-2 font-medium">OCR 语言</Text>
                        <Select
                          multiple
                          value={params.lang_list ?? []}
                          onChange={(v) =>
                            updateParam("lang_list", (v ?? []) as LangOption[])
                          }
                          style={{ width: "100%" }}
                          placeholder="选择文档语言（可多选，提高OCR精度）"
                        >
                          {LANG_OPTIONS.map((opt) => (
                            <Select.Option key={opt.value} value={opt.value}>
                              {opt.label}
                            </Select.Option>
                          ))}
                        </Select>
                      </div>
                      {/* 强制启用 OCR */}
                      <Checkbox
                        checked={isForceOcr}
                        onChange={(e) => handleForceOcrChange(e.target.checked ?? false)}
                        extra="对扫描件强制启用 OCR 识别"
                      >
                        强制启用 OCR
                      </Checkbox>
                    </>
                  )}
                </div>
              </div>

              {/* ---- 操作按钮（右对齐） ---- */}
              <div className="flex justify-end gap-3 pt-2 mt-auto">
                <Button onClick={handleClear} disabled={submitting || checking}>
                  清除
                </Button>
                <Button
                  type="primary"
                  theme="solid"
                  loading={submitting || checking}
                  onClick={handleSubmit}
                  disabled={healthCheckFailed}
                >
                  {checking ? "检查服务中…" : "转换"}
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* ================================================ */}
        {/* D.3 — 参数预览（radio + textarea）             */}
        {/* ================================================ */}
        <div className="flex flex-col gap-2">
          <Text className="block font-medium">参数预览</Text>
          <RadioGroup
            value={previewCategory}
            onChange={(v: any) => {
              const val = v?.target?.value ?? v;
              setPreviewCategory(val);
              if (!showPreview) setShowPreview(true);
            }}
          >
            <Radio value="general" style={{ marginRight: 24 }}>
              通用参数
            </Radio>
            <Radio value="backend" style={{ marginRight: 24 }}>
              后端参数
            </Radio>
            <Radio value="all">全部参数</Radio>
          </RadioGroup>
          {showPreview && (
            <textarea
              className="w-full text-xs font-mono bg-gray-50 dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700"
              rows={8}
              value={previewContent}
              readOnly
            />
          )}
        </div>
      </div>
    </Page>
  );
}
