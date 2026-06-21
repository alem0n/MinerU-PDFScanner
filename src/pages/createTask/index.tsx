/**
 * 创建任务页面
 *
 * 功能：
 * - 左侧上传区：拖拽/点击上传文件，支持 PDF/JPG/PNG 格式
 * - 右侧配置面板：解析后端选择、最大页数滑块、高级选项（条件渲染）
 *
 * 配置面板渲染逻辑：
 *   1. 通用配置区：始终显示"启用表格识别"和"启用行内公式识别"
 *   2. 动态配置区：根据当前选定的解析后端，显示对应的专有配置项
 *      - hybrid-engine → 解析强度 + 强制启用OCR
 *      - vlm-engine    → 启用图片分析
 *      - pipeline      → OCR语言 + 强制启用OCR
 *   3. 后端切换时，清空旧后端的专有数据，恢复新后端的缺省值，全局数据保持不变
 */

import { useState, useMemo, useCallback } from "react";
import {
  Upload,
  Typography,
  Card,
  Select,
  Slider,
  Checkbox,
  RadioGroup,
  Radio,
  Button,
  Toast,
} from "@douyinfe/semi-ui";

import { Page } from "@/components/Page";
import { useNavigate } from "react-router-dom";
import { taskService } from "@/service/task.service";
import { apiClient } from "@/service/api.client";
import type {
  ParseTaskParams,
  BackendOption,
  EffortOption,
  LangOption,
} from "@/service/task.model";

const { Text, Title } = Typography;

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
  return_middle_json: false,
  return_model_output: false,
  return_content_list: false,
  return_images: false,
  response_format_zip: false,
  return_original_file: false,
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

/** 上传文件接受的 MIME / 扩展名 */
const ACCEPT_STR = ".pdf,.jpg,.jpeg,.png";

/** 滑块最大值（达到该值表示"无限制"） */
const MAX_PAGES_LIMIT = 200;

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

// ========================================================
// 页面组件
// ========================================================

export function Component() {
  const navigate = useNavigate();

  // ---- 状态 ----
  const [params, setParams] = useState<ParseTaskParams>({ ...DEFAULT_PARAMS });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewCategory, setPreviewCategory] = useState<string>("all");

  // ---- 计算属性 ----
  const currentBackend = params.backend ?? "hybrid-engine";
  const isForceOcr = params.parse_method === "ocr";

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

  /** 滑块值 → 映射 end_page_id：达到上限表示"全部页面" */
  const maxPages = useMemo(() => {
    return params.end_page_id != null && params.end_page_id >= MAX_PAGES_LIMIT
      ? MAX_PAGES_LIMIT
      : (params.end_page_id ?? MAX_PAGES_LIMIT);
  }, [params.end_page_id]);

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

  // ---- 后端切换逻辑（遵循四、状态重置逻辑） ----

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

  /** 上传文件选取（beforeUpload 拦截，不自动提交） */
  const handleBeforeUpload = useCallback(
    async (file: any): Promise<boolean> => {
      // 兼容不同 Semi UI 版本的文件对象结构（file / file.file / file.originFile）
      const rawFile = file?.file ?? file?.originFile ?? file;
      const fileName: string = rawFile?.name ?? rawFile?.fileName ?? "未知文件";
      const fileSize: number = rawFile?.size ?? 0;
      console.log(`[CreateTask] 选择文件: "${fileName}", size=${fileSize}`);
      setSelectedFile(rawFile);
      Toast.info(`已选择文件: ${fileName}`);
      return false; // 阻止默认 HTTP 上传
    },
    [],
  );

  /** 最大转换页数滑块变化 */
  const handleMaxPagesChange = useCallback(
    (v: number | number[] | undefined) => {
      const value = typeof v === "number" ? v : MAX_PAGES_LIMIT;
      updateParam("end_page_id", value >= MAX_PAGES_LIMIT ? 99999 : value);
      if (params.start_page_id !== 0) {
        updateParam("start_page_id", 0);
      }
    },
    [params.start_page_id],
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
      `[CreateTask] 开始提交流程: file="${selectedFile.name}", size=${selectedFile.size}, params=`,
      params,
    );

    setSubmitting(true);

    // ---- 步骤 1：健康检查 ----
    try {
      console.log("[CreateTask] 执行健康检查 GET /health …");
      await apiClient.healthCheck();
      console.log("[CreateTask] 健康检查通过");
    } catch (err) {
      console.warn("[CreateTask] 健康检查失败:", err);
      Toast.error({
        content: "后端服务不可用，请检查服务是否已启动",
        duration: 3,
      });
      setSubmitting(false);
      return;
    }

    // ---- 步骤 2：提交任务 ----
    try {
      const tasks = await taskService.submitBatch([selectedFile], params);
      const task = tasks[0];

      if (task && task.status !== "failed") {
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

  /** 清除所有配置 */
  const handleClear = useCallback(() => {
    console.log("[CreateTask] 清除所有配置");
    setParams({ ...DEFAULT_PARAMS });
    setSelectedFile(null);
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

        {/* ================================================ */}
        {/* 双栏并排布局：上传区（左）+ 配置面板（右）       */}
        {/* ================================================ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* -------------------------------------------------- */}
          {/* D.1 — 上传区（左侧卡片）                          */}
          {/* -------------------------------------------------- */}
          <Card title="上传区" className="w-full min-h-[600px]">
            <div className="flex flex-col gap-4 h-full">
              {/* 大号拖拽上传区域（3倍高度） */}
              <div className="flex-1 flex flex-col items-center justify-center">
                <Upload
                  beforeUpload={handleBeforeUpload as any}
                  showUploadList={false}
                  draggable={true}
                  accept={ACCEPT_STR}
                  disabled={submitting}
                  className="w-full"
                  dragMainText="点击或拖拽文件到此处"
                  dragSubText="支持 PDF、JPG、PNG 等格式"
                />
              </div>

              {/* 已选文件提示 */}
              {selectedFile && !submitting && (
                <div className="text-center">
                  <Text size="small" type="success">
                    已选择: {(selectedFile as any)?.name ?? (selectedFile as any)?.fileName ?? "未知文件"}
                  </Text>
                </div>
              )}

              {/* 提交中状态 */}
              {submitting && (
                <Text type="secondary" className="text-center">
                  <span className="inline-block animate-pulse">
                    正在提交任务，请稍候...
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

              {/* ---- 最大转换页数滑块 ---- */}
              <div>
                <Text className="block mb-2 font-medium">最大转换页数</Text>
                <Slider
                  min={1}
                  max={MAX_PAGES_LIMIT}
                  step={1}
                  value={maxPages}
                  onChange={handleMaxPagesChange}
                />
                <div className="mt-1 text-right">
                  <Text size="small" type="tertiary">
                    {maxPages >= MAX_PAGES_LIMIT
                      ? "无限制（全部页面）"
                      : `${maxPages} 页`}
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
                <Button onClick={handleClear} disabled={submitting}>
                  清除
                </Button>
                <Button
                  type="primary"
                  theme="solid"
                  loading={submitting}
                  onClick={handleSubmit}
                >
                  转换
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
