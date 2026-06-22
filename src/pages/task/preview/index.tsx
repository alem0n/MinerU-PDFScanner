import { useLoaderData, useNavigate } from "react-router-dom";
import { PreviewPage } from "@/components/preview/Preview";
import { openFolder } from "@/service/preview.service";
import { LoadTaskResult } from "@/service/task.service";
import type { TaskData } from "@/shared/types";
import { getApiUrl } from "@/lib/config";

export function Component() {
  const result = useLoaderData() as LoadTaskResult | undefined;
  const navigate = useNavigate();

  if (!result) {
    return <div className="flex items-center justify-center h-full text-gray-400">缺少任务数据</div>;
  }

  const { task, blockData, mergeConnections } = result;
  const taskData = task as unknown as TaskData;
  const pdfUrl = task.url ? getApiUrl(task.url) : undefined;

  return (
    <PreviewPage
      task={taskData}
      blockData={blockData}
      mergeConnections={mergeConnections}
      loading={false}
      error={null}
      onBack={() => navigate(-1)}
      onRetry={() => window.location.reload()}
      onOpenFolder={() => { if (task.unzip_file_output_path) openFolder(task.unzip_file_output_path) }}
      pdfUrl={pdfUrl}
    />
  );
}
