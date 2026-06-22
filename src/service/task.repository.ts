import { db } from '@/lib/db';
import { TaskDataEntities } from './task.model';
import Database from '@tauri-apps/plugin-sql';

/**
 * taskData 表名常量（方便后续切换表）
 */
const TABLE_NAME = 'taskData';

/**
 * 所有列的完整列表（与 taskData 表结构一一对应）
 */
const ALL_COLUMNS = `
    id, file_name, type, state, createdAt, full_md_link, full_zip_url,
    err_msg, err_code, jobID, task_id, thumb, url, file_url,
    data_id, batch_id, taskType, path, extract_progress, retry_time,
    unzip_file_path, unzip_file_output_path, origin_file_path,
    createDate, model_version, cover_path, chem, is_chem,
    file_size, rank, can_retry, is_expire
`;

export class TaskRepository {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * 创建一条新任务记录（全字段插入）
   */
  async create(task: TaskDataEntities): Promise<void> {
    await this.db.execute(
      `INSERT INTO ${TABLE_NAME} (
        id, file_name, type, state, createdAt, full_md_link, full_zip_url,
        err_msg, err_code, jobID, task_id, thumb, url, file_url,
        data_id, batch_id, taskType, path, extract_progress, retry_time,
        unzip_file_path, unzip_file_output_path, origin_file_path,
        createDate, model_version, cover_path, chem, is_chem,
        file_size, rank, can_retry, is_expire
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20,
        $21, $22, $23,
        $24, $25, $26, $27, $28,
        $29, $30, $31, $32
      )`,
      [
        task.id,
        task.file_name,
        task.type,
        task.state,
        task.createdAt,
        task.full_md_link,
        task.full_zip_url,
        task.err_msg,
        task.err_code,
        task.jobID,
        task.task_id,
        task.thumb,
        task.url,
        task.file_url,
        task.data_id,
        task.batch_id,
        task.taskType,
        task.path,
        task.extract_progress,
        task.retry_time,
        task.unzip_file_path,
        task.unzip_file_output_path,
        task.origin_file_path,
        task.createDate,
        task.model_version,
        task.cover_path,
        task.chem,
        task.is_chem ? 1 : 0,
        task.file_size,
        task.rank,
        task.can_retry ? 1 : 0,
        task.is_expire ? 1 : 0,
      ]
    );
  }

  /**
   * 更新一条任务记录（全字段覆盖，以 task_id 为条件）
   */
  async update(task: TaskDataEntities): Promise<void> {
    await this.db.execute(
      `UPDATE ${TABLE_NAME} SET
        file_name = $1, type = $2, state = $3, createdAt = $4,
        full_md_link = $5, full_zip_url = $6,
        err_msg = $7, err_code = $8, jobID = $9,
        thumb = $10, url = $11, file_url = $12,
        data_id = $13, batch_id = $14, taskType = $15,
        path = $16, extract_progress = $17, retry_time = $18,
        unzip_file_path = $19, unzip_file_output_path = $20, origin_file_path = $21,
        createDate = $22, model_version = $23, cover_path = $24,
        chem = $25, is_chem = $26,
        file_size = $27, rank = $28, can_retry = $29, is_expire = $30
      WHERE task_id = $31`,
      [
        task.file_name,
        task.type,
        task.state,
        task.createdAt,
        task.full_md_link,
        task.full_zip_url,
        task.err_msg,
        task.err_code,
        task.jobID,
        task.thumb,
        task.url,
        task.file_url,
        task.data_id,
        task.batch_id,
        task.taskType,
        task.path,
        task.extract_progress,
        task.retry_time,
        task.unzip_file_path,
        task.unzip_file_output_path,
        task.origin_file_path,
        task.createDate,
        task.model_version,
        task.cover_path,
        task.chem,
        task.is_chem ? 1 : 0,
        task.file_size,
        task.rank,
        task.can_retry ? 1 : 0,
        task.is_expire ? 1 : 0,
        task.task_id,
      ]
    );
  }

  /**
   * 按 task_id 查询单条记录
   */
  async findById(taskId: string): Promise<TaskDataEntities | null> {
    const result = await this.db.select<TaskDataEntities[]>(
      `SELECT ${ALL_COLUMNS} FROM ${TABLE_NAME} WHERE task_id = $1`,
      [taskId]
    );

    return result && result.length > 0 ? result[0] : null;
  }

  /**
   * 查询任务列表，支持 WHERE 条件过滤、分页和排序。
   * 结果按 createdAt DESC 排序（最新的在前）。
   */
  async list(
    where?: string,
    bindValues?: unknown[],
    limit?: number,
    offset?: number
  ): Promise<TaskDataEntities[]> {
    let sql = `SELECT ${ALL_COLUMNS} FROM ${TABLE_NAME}`;
    if (where) {
      sql += " WHERE " + where;
    }
    sql += " ORDER BY createdAt DESC";
    if (limit !== undefined) {
      sql += ` LIMIT ${limit}`;
    }
    if (offset !== undefined) {
      sql += ` OFFSET ${offset}`;
    }
    console.log(`[TaskRepository] list() SQL: ${sql}`, bindValues ?? "");
    const result = await this.db.select<TaskDataEntities[]>(sql, bindValues);
    return result;
  }

  /**
   * 按条件计数
   */
  async count(where?: string, bindValues?: unknown[]): Promise<number> {
    let sql = `SELECT COUNT(*) as count FROM ${TABLE_NAME}`;
    if (where) {
      sql += " WHERE " + where;
    }
    const result = await this.db.select<Array<{ count: number }>>(sql, bindValues);
    return result && result.length > 0 ? result[0].count : 0;
  }

  /**
   * 按 task_id 删除任务
   */
  async delete(taskId: string): Promise<void> {
    await this.db.execute(
      `DELETE FROM ${TABLE_NAME} WHERE task_id = $1`,
      [taskId]
    );
  }
}

export const taskRepository = new TaskRepository(db);
