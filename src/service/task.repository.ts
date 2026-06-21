import { db } from '@/lib/db';
import { Task } from './task.model'; // 假设你有一个 Task 模型
import Database from '@tauri-apps/plugin-sql';




export class TaskRepository {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async create(task: Task): Promise<void> {
    await this.db.execute(
      "INSERT INTO tasks (task_id, file_name, pdf_url, md_url, images, model_json, middle_json, content_list_json, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
      [
        task.task_id,
        task.file_name,
        task.pdf_url,
        task.md_url,
        task.images,
        task.model_json,
        task.middle_json,
        task.content_list_json,
        task.status,
        task.created_at,
      ]
    );
    
  }

  async update(task: Task): Promise<void> {
    await this.db.execute(
      "UPDATE tasks SET file_name = $1, pdf_url = $2, md_url = $3, images = $4, model_json = $5, middle_json = $6, content_list_json = $7, status = $8 WHERE task_id = $9",
      [
        task.file_name,
        task.pdf_url,
        task.md_url,
        task.images,
        task.model_json,
        task.middle_json,
        task.content_list_json,
        task.status,
        task.task_id,
      ]
    );
  }

  async findById(taskId: string): Promise<Task | null> {
    const result = await this.db.select<Task[]>(
      "SELECT * FROM tasks WHERE task_id = $1",
      [taskId]
    );

    return result && result.length > 0? result[0] : null;
    
  }
  /**
   * 查询任务列表，支持 WHERE 条件过滤，分页和排序。
   * 结果按 created_at DESC 排序（最新的在前）。
   * @param where SQL WHERE 条件，如 "status = '$1'"
   * @param bindValues 绑定值
   * @param limit 每页条数（可选，不传则返回全部）
   * @param offset 偏移量（可选）
   * @returns 
   */
  async list(where?: string, bindValues?: unknown[], limit?: number, offset?: number): Promise<Task[]> {
    let sql = "SELECT * FROM tasks";
    if (where) {
      sql += " WHERE " + where;
    }
    sql += " ORDER BY created_at DESC";
    if (limit !== undefined) {
      sql += ` LIMIT ${limit}`;
    }
    if (offset !== undefined) {
      sql += ` OFFSET ${offset}`;
    }
    console.log(`[TaskRepository] list() SQL: ${sql}`, bindValues ?? "");
    const result = await this.db.select<Task[]>(sql, bindValues);
    return result;
  }

  async count(where?:string,bindValues?: unknown[]): Promise<number> {
    let sql = "SELECT COUNT(*) as count FROM tasks";
    if(where){
      sql += " WHERE " + where;
    }
    const result = await this.db.select<Array<{count:number}>>(sql,bindValues);
    return result && result.length > 0? result[0].count : 0;
  }

  async delete(taskId: string): Promise<void> {
    await this.db.execute(
      "DELETE FROM tasks WHERE task_id = $1",
      [taskId]
    );
  }
}


export const taskRepository = new TaskRepository(db);
