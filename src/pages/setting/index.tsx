import { Page } from "@/components/Page";
import { Config, configService } from "@/service/config.service";
import { translateService, TranslateConfig, DEFAULT_TRANSLATE_CONFIG } from "@/service/translate.service";
import { PROVIDERS, TARGET_LANGS, SOURCE_LANGS } from "@/translate";
import type { ApiType } from "@/translate";
import { Form, Button, Card, Toast, Select } from "@douyinfe/semi-ui";
import { useRequest } from "ahooks";
import { useLoaderData } from "react-router-dom";
import { useRef, useCallback, useEffect, useState } from "react";
import { UpdateChecker } from "@/lib/updater";

export function Component() {
  const data = useLoaderData() as Config;
  const formRef = useRef<any>(null);
  const translateFormRef = useRef<any>(null);
  const [translateConfig, setTranslateConfig] = useState<TranslateConfig>(DEFAULT_TRANSLATE_CONFIG);

  /** 加载翻译配置 */
  useEffect(() => {
    translateService.getConfig().then((cfg) => {
      setTranslateConfig(cfg);
      if (translateFormRef.current) {
        translateFormRef.current.formApi.setValues(cfg);
      }
    });
  }, []);

  /**
   * 选择下载目录：调用 Tauri 原生文件夹选择器
   * 非 Tauri 环境下静默失败，不影响其他功能
   */
  const handleSelectDir = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === "string" && formRef.current) {
        formRef.current.formApi.setValue("downloadDir", selected);
        console.log("[Setting] 下载目录已选择:", selected);
      }
    } catch (error) {
      console.warn("[Setting] 目录选择器不可用（非 Tauri 环境）:", error);
    }
  }, []);

  /**
   * 选择缓存目录：调用 Tauri 原生文件夹选择器
   * 如果旧缓存目录中存在文件，弹出警告提示用户手动迁移
   */
  const handleSelectCacheDir = useCallback(async () => {
    try {
      const { open, message } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === "string" && formRef.current) {
        // 获取当前旧的缓存目录值
        const oldCacheDir = formRef.current.formApi.getValue("cacheDir");
        if (oldCacheDir && oldCacheDir !== selected) {
          // 检查旧目录是否有内容
          const hasContent = await configService.checkDirHasContent(oldCacheDir);
          if (hasContent) {
            await message(
              `旧缓存目录中存在文件，请手动将文件迁移到新目录：\n\n${selected}`,
              { title: "缓存目录变更", kind: "warning", okLabel: "我知道了" },
            );
          }
        }
        formRef.current.formApi.setValue("cacheDir", selected);
        console.log("[Setting] 缓存目录已选择:", selected);
      }
    } catch (error) {
      console.warn("[Setting] 目录选择器不可用（非 Tauri 环境）:", error);
    }
  }, []);

  const configSetReq = useRequest(
    (config: Config) => configService.set(config),
    {
      manual: true,
      onSuccess() {
        Toast.success("配置保存成功");
      },
    },
  );

  /** 保存翻译配置 */
  const translateSetReq = useRequest(
    (config: TranslateConfig) => translateService.saveConfig(config),
    {
      manual: true,
      onSuccess() {
        Toast.success("翻译配置保存成功");
      },
    },
  );

  /** 选择服务商时自动填入默认 URL/Model，并立即保存生效 */
  const handleProviderChange = useCallback((value: any) => {
    const apiType = value as ApiType;
    const defaults = translateService.applyProviderDefaults(apiType, translateConfig);
    if (translateFormRef.current) {
      translateFormRef.current.formApi.setValue("apiType", apiType);
      translateFormRef.current.formApi.setValue("apiUrl", defaults.apiUrl);
      translateFormRef.current.formApi.setValue("model", defaults.model);
      // 从表单 API 获取当前所有输入值（enabled、apiKey 等用户已填的字段）
      const formValues = translateFormRef.current.formApi.getValues() as Partial<TranslateConfig>;
      const newConfig = { ...translateConfig, ...formValues, apiType, apiUrl: defaults.apiUrl, model: defaults.model };
      setTranslateConfig(newConfig);
      // 立即保存，确保切换服务商后其他组件能立即获取到最新配置
      translateSetReq.run(newConfig);
    }
  }, [translateConfig]);

  console.log("data", data);
  return (
    <Page>
      <Card title="系统设置" className="w-full">
        <Form
          ref={formRef}
          onSubmit={(values) => {
            configSetReq.run(values);
          }}
          initValues={data}
          layout="vertical"
        >
          <Form.Input field="baseUrl" label="后端服务地址" trigger="blur" placeholder="http://127.0.0.1:8080" />
          <Form.Input
            field="cacheDir"
            label="缓存目录"
            trigger="blur"
            suffix={
              <Button onClick={handleSelectCacheDir} type="secondary" size="small">
                选择目录
              </Button>
            }
            extraText="修改缓存目录后，旧目录中的缓存文件需手动迁移"
          />
          <Form.Input
            field="downloadDir"
            label="下载目录"
            trigger="blur"
            placeholder="未设置，任务完成后需手动下载"
            suffix={
              <Button onClick={handleSelectDir} type="secondary" size="small">
                选择目录
              </Button>
            }
            extraText="配置后，解析任务完成后结果 ZIP 将自动保存到该目录"
          />
          <Button
            type="primary"
            loading={configSetReq.loading}
            className="mt-2"
            htmlType="submit"
          >
            保存配置
          </Button>
        </Form>
      </Card>
      <Card title="软件更新" className="w-full mt-4">
        <div className="flex items-center justify-between">
          <span className="text-gray-600">检查并安装最新版本</span>
          <UpdateChecker autoCheck={false} showButton />
        </div>
      </Card>
      <Card title="翻译设置" className="w-full mt-4">
        <Form
          ref={translateFormRef}
          onSubmit={(values) => {
            // 合并表单值与现有配置，保留表单中没有的字段（temperature、maxTokens 等）
            translateSetReq.run({ ...translateConfig, ...values } as TranslateConfig);
          }}
          initValues={translateConfig}
          layout="vertical"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600">启用翻译功能</span>
            <Form.Switch field="enabled" noLabel />
          </div>
          <Form.Select
            field="apiType"
            label="翻译服务商"
            style={{ width: '100%' }}
            onChange={handleProviderChange}
          >
            {PROVIDERS.map((p) => (
              <Select.Option key={p.apiType} value={p.apiType}>
                {p.label}
              </Select.Option>
            ))}
          </Form.Select>
          <Form.Input
            field="apiUrl"
            label="API URL"
            placeholder="https://api.example.com/v1/chat/completions"
          />
          <Form.Input
            field="apiKey"
            label="API Key"
            type="password"
            placeholder="sk-..."
            extraText="API Key 仅存储在本机, 不会上传到任何服务器"
          />
          <Form.Input
            field="model"
            label="模型名称"
            placeholder="deepseek-chat"
          />
          <div className="flex gap-4">
            <Form.Select
              field="sourceLang"
              label="源语言"
              style={{ width: '100%' }}
            >
              {SOURCE_LANGS.map(([code, label]) => (
                <Select.Option key={code} value={code}>{label}</Select.Option>
              ))}
            </Form.Select>
            <Form.Select
              field="targetLang"
              label="目标语言"
              style={{ width: '100%' }}
            >
              {TARGET_LANGS.map(([code, label]) => (
                <Select.Option key={code} value={code}>{label}</Select.Option>
              ))}
            </Form.Select>
          </div>
          <div className="flex gap-4">
            <Form.InputNumber
              field="concurrency"
              label="并发数"
              min={1}
              max={10}
              style={{ width: '50%' }}
              extraText="同时发送的翻译请求数"
            />
            <Form.InputNumber
              field="retryTimes"
              label="重试次数"
              min={0}
              max={5}
              style={{ width: '50%' }}
            />
          </div>
          <div className="flex gap-4">
            <Form.InputNumber
              field="timeoutMs"
              label="超时 (毫秒)"
              min={5000}
              max={120000}
              step={5000}
              style={{ width: '50%' }}
            />
            <Form.InputNumber
              field="maxChunkChars"
              label="超长分段阈值 (字符)"
              min={500}
              max={10000}
              step={500}
              style={{ width: '50%' }}
              extraText="超过此长度的文本块将分段翻译"
            />
          </div>
          <Button
            type="primary"
            loading={translateSetReq.loading}
            className="mt-2"
            htmlType="submit"
          >
            保存翻译配置
          </Button>
        </Form>
      </Card>
    </Page>
  );
}
