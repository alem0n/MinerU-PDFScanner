import { List, Avatar, ButtonGroup, Button } from "@douyinfe/semi-ui";
import { Tag } from "@douyinfe/semi-ui";
import { Typography } from "@douyinfe/semi-ui";
import { useMatch, useNavigate } from "react-router-dom";
import { taskRepository } from "@/service/task.repository";
import { useRequest } from "ahooks";
import { taskService } from "@/service/task.service";
import { TaskStatus } from "@/service/task.model";

const StatusMap: Record<string, React.ReactNode> = {
  [TaskStatus.Pending]: (
    <Tag size="large" color="blue">
      未启动
    </Tag>
  ),
  [TaskStatus.Processing]: (
    <Tag size="large" color="indigo">
      处理中
    </Tag>
  ),
  [TaskStatus.Completed]: (
    <Tag size="large" color="green">
      已完成
    </Tag>
  ),
  [TaskStatus.Failed]: (
    <Tag size="large" color="red">
      失败
    </Tag>
  ),
};

/**
 * 排队位置显示组件。
 * 仅在任务处于 pending / processing 状态时显示 queued_ahead 信息。
 */
function QueueInfo({ taskId, status }: { taskId: string; status: string }) {
  const pos = taskService.getQueuePosition(taskId);

  // 仅对 pending / processing 状态显示排队信息
  if (status !== TaskStatus.Pending && status !== TaskStatus.Processing) {
    return null;
  }

  if (pos === undefined) {
    return (
      <Typography.Text size="small" style={{ color: "var(--semi-color-text-2)", marginLeft: 8 }}>
        等待中…
      </Typography.Text>
    );
  }

  if (pos > 0) {
    return (
      <Typography.Text size="small" style={{ color: "var(--semi-color-warning)", marginLeft: 8 }}>
        排队中，前方 {pos} 个任务
      </Typography.Text>
    );
  }

  return (
    <Typography.Text size="small" style={{ color: "var(--semi-color-text-2)", marginLeft: 8 }}>
      正在处理
    </Typography.Text>
  );
}

export function Component() {
  const match = useMatch("/task/:status");
  const status = match?.params?.status ?? TaskStatus.Processing;

  // 当查看 pending/processing 任务时，启用轮询刷新以获取实时队列位置
  const needsPolling = status === TaskStatus.Pending || status === TaskStatus.Processing;

  const tasksReq = useRequest(
    () => taskRepository.list("status in ($1)", [status]),
    {
      cacheKey: "tasks_" + status,
      refreshDeps: [status],
      pollingInterval: needsPolling ? 3000 : 0,
    }
  );
  const navigate = useNavigate();
  return (
    <div>
      <List
        loading={tasksReq.loading}
        className="border m-5"
        dataSource={tasksReq.data}
        renderItem={(item) => (
          <List.Item
            header={<Avatar color="blue">PDF</Avatar>}
            main={
              <div className="">
                <div>{item.file_name}</div>
                <div>
                  {StatusMap[item.status] ?? (
                    <Tag size="large" color="blue">
                      {item.status}
                    </Tag>
                  )}
                  <QueueInfo taskId={item.task_id} status={item.status} />
                </div>
              </div>
            }
            extra={
              <ButtonGroup theme="borderless">
                <Button
                  onClick={() => navigate(`/task/preview/${item.task_id}`)}
                >
                  预览
                </Button>
                {item.status === TaskStatus.Processing && <Button>取消</Button>}
                {item.status === TaskStatus.Failed && <Button>重试</Button>}
                {item.status === TaskStatus.Completed && (
                  <Button onClick={() => taskService.packageTask(item.task_id)}>
                    打包
                  </Button>
                )}
                {item.status === TaskStatus.Completed && <Button>删除</Button>}
              </ButtonGroup>
            }
          />
        )}
      />
    </div>
  );
}
