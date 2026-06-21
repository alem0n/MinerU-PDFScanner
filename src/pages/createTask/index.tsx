import { Upload, Typography } from "@douyinfe/semi-ui";
import { Toast } from "@douyinfe/semi-ui";

import { Page } from "@/components/Page";
import { useNavigate } from "react-router-dom";
import { taskService } from "@/service/task.service";

const { Text } = Typography;

export function Component() {
  const navigate = useNavigate();

  /**
   * 拦截上传请求：阻止 Upload 组件直接 POST 到旧地址，
   * 改为调用 taskService.submitBatch() 通过新 API 提交。
   */
  const handleBeforeUpload = async (file: File) => {
    try {
      const tasks = await taskService.submitBatch([file]);
      const task = tasks[0];

      if (task && task.status !== "failed") {
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
    } catch {
      // submitBatch 内部已处理错误通知，此处无需重复提示
    }

    // 返回 false 阻止 Upload 组件执行默认的 HTTP 上传
    return false;
  };

  return (
    <Page>
      <div className="w-ful h-full flex  items-center flex-col justify-center gap-5">
        <h1 className="text-xl font-bold">上传PDF文件</h1>
        <p className="text-stone-500">
          支持文本/扫描型 PDF 解析，识别各类版面元素并转换为多模态 Markdown 格式
        </p>
        <Upload
          beforeUpload={handleBeforeUpload as any}
          className="h-64 w-96"
          showUploadList={false}
          draggable={true}
          accept=".pdf"
          dragMainText="点击上传PDF文件或拖拽PDF文件到这里"
          dragSubText="目前仅支持PDF"
        />
      </div>
    </Page>
  );
}
