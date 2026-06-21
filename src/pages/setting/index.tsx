import { Page } from "@/components/Page";
import { Config, configService } from "@/service/config.service";
import { Form, Button, Card, Toast } from "@douyinfe/semi-ui";
import { useRequest } from "ahooks";
import { useLoaderData } from "react-router-dom";
import { useRef, useCallback } from "react";

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
          <Form.Input field="uploadUrl" label="识别接口" trigger="blur" />
          <Form.Input
            field="queryTaskUrl"
            label="任务查询接口"
            trigger="blur"
          />
          <Form.Input field="fileUrl" label="资源文件接口" trigger="blur" />
          <Form.Input field="cacheDir" label="缓存目录" trigger="blur" />
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
    </Page>
  );
}
