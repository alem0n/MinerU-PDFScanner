import { Page } from "@/components/Page";
import { Config, configService } from "@/service/config.service";
import { Form, Button, Card, Toast } from "@douyinfe/semi-ui";
import { useRequest } from "ahooks";
import { useLoaderData } from "react-router-dom";
import { useRef, useCallback } from "react";
import { UpdateChecker } from "@/lib/updater";

export function Component() {
  const data = useLoaderData() as Config;
  const formRef = useRef<any>(null);

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
    </Page>
  );
}
