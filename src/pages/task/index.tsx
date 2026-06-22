import { List, Avatar, ButtonGroup, Button, Toast, Modal, Pagination } from "@douyinfe/semi-ui";
import { Tag } from "@douyinfe/semi-ui";
import { Typography } from "@douyinfe/semi-ui";
import { useMatch, useNavigate } from "react-router-dom";
import { taskRepository } from "@/service/task.repository";
import { useRequest } from "ahooks";
import { taskService } from "@/service/task.service";
import { TaskStatus, type Task } from "@/service/task.model";
import { useState, useCallback } from "react";

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

  /**
   * 当前正在打包的任务 ID（用于按钮 loading 状态展示）
   */
  const [packingTaskId, setPackingTaskId] = useState<string | null>(null);

  /**
   * 将已完成任务的本地输出文件夹打包为 ZIP 并保存到下载目录。
   */
  const handleLocalZip = useCallback(async (task: Task) => {
    setPackingTaskId(task.task_id);
    try {
      console.log(`[TaskList] 开始本地打包 ${task.task_id} (${task.file_name})`);
      const path = await taskService.zipLocalFolder(task);
      if (path) {
        Toast.success({
          content: `结果已保存到 ${path}`,
          duration: 3,
        });
      }
    } finally {
      setPackingTaskId(null);
    }
  }, []);

  // ============ 分页状态 ============
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const tasksReq = useRequest(
    () => taskRepository.list("state in ($1)", [status], pageSize, (currentPage - 1) * pageSize),
    {
      cacheKey: "tasks_" + status,
      refreshDeps: [status, currentPage, pageSize],
      pollingInterval: needsPolling ? 3000 : 0,
    }
  );

  const totalReq = useRequest(
    () => taskRepository.count("state in ($1)", [status]),
    {
      cacheKey: "tasks_count_" + status,
      refreshDeps: [status],
    }
  );

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const handlePageSizeChange = useCallback((newPageSize: number) => {
    setPageSize(newPageSize);
    setCurrentPage(1); // 切换每页条数时回到第一页
  }, []);

  /**
   * 当前正在删除的任务 ID（用于按钮 loading 状态展示）
   */
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

  /**
   * 删除任务，弹出确认对话框后从数据库中移除并刷新列表。
   */
  const handleDelete = useCallback(async (task: Task) => {
    Modal.confirm({
      title: "确认删除",
      content: `确定要删除任务「${task.file_name}」吗？此操作不可恢复。`,
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { type: "danger" },
      onOk: async () => {
        setDeletingTaskId(task.task_id);
        try {
          await taskService.deleteTask(task.task_id);
          Toast.success({ content: "任务已删除", duration: 2 });
          tasksReq.refresh();
          totalReq.refresh();
        } finally {
          setDeletingTaskId(null);
        }
      },
    });
  }, [tasksReq]);

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
                  {StatusMap[item.state] ?? (
                    <Tag size="large" color="blue">
                      {item.state}
                    </Tag>
                  )}
                  <QueueInfo taskId={item.task_id} status={item.state} />
                </div>
              </div>
            }
            extra={
              <ButtonGroup theme="borderless">
                {item.state === TaskStatus.Completed && (
                  <Button
                    onClick={() => navigate(`/task/preview/${item.task_id}`)}
                  >
                    预览
                  </Button>
                )}
                {item.state === TaskStatus.Processing && <Button>取消</Button>}
                {item.state === TaskStatus.Failed && <Button>重试</Button>}
                {item.state === TaskStatus.Completed && (
                  <Button
                    onClick={() => handleLocalZip(item)}
                    loading={packingTaskId === item.task_id}
                  >
                    下载
                  </Button>
                )}
                {item.state === TaskStatus.Completed && (
                  <Button
                    onClick={() => handleDelete(item)}
                    loading={deletingTaskId === item.task_id}
                  >
                    删除
                  </Button>
                )}
              </ButtonGroup>
            }
          />
        )}
      />
      <div className="flex justify-center my-4">
        <Pagination
          total={totalReq.data ?? 0}
          currentPage={currentPage}
          pageSize={pageSize}
          pageSizeOpts={[5, 10, 15, 20]}
          showSizeChanger
          showTotal
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      </div>
    </div>
  );
}
