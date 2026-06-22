use tauri_plugin_sql::{Migration, MigrationKind};

pub fn load_migrations() -> Vec<Migration> {
    let mut migrations = Vec::new();

    // v1: 旧版 tasks 表（已废弃，保留历史记录）
    migrations.push(Migration {
        version: 1,
        description: "init_data_base",
        kind: MigrationKind::Up,
        sql: r#"
        CREATE TABLE tasks (
    task_id TEXT PRIMARY KEY,
    file_name TEXT,
    pdf_url TEXT,
    md_url TEXT,
    images TEXT,
    model_json TEXT,
    middle_json TEXT,
    content_list_json TEXT,
    status TEXT
);
        "#,
    });

    // v2: 旧版 created_at 字段（已废弃，保留历史记录）
    migrations.push(Migration {
        version: 2,
        description: "add_created_at_to_tasks",
        kind: MigrationKind::Up,
        sql: "ALTER TABLE tasks ADD COLUMN created_at TEXT;",
    });

    // v3: 全新设计 —— 删除旧 tasks 表，新建 taskData + taskDemoData 两张完整表
    migrations.push(Migration {
        version: 3,
        description: "rebuild_database_with_taskData_and_taskDemoData",
        kind: MigrationKind::Up,
        sql: r#"
        -- 1. 删除旧表
        DROP TABLE IF EXISTS tasks;

        -- 2. 新建 taskData 表
        CREATE TABLE taskData (
            id TEXT PRIMARY KEY,
            file_name TEXT DEFAULT '',
            type TEXT DEFAULT '',
            state TEXT DEFAULT '',
            createdAt INTEGER DEFAULT 0,
            full_md_link TEXT DEFAULT '',
            full_zip_url TEXT DEFAULT '',
            err_msg TEXT DEFAULT '',
            err_code TEXT DEFAULT '',
            jobID TEXT DEFAULT '',
            task_id TEXT DEFAULT '',
            thumb TEXT DEFAULT '',
            url TEXT DEFAULT '',
            file_url TEXT DEFAULT '',
            data_id TEXT DEFAULT '',
            batch_id TEXT DEFAULT '',
            taskType TEXT DEFAULT '',
            path TEXT DEFAULT '',
            extract_progress TEXT DEFAULT '',
            retry_time INTEGER DEFAULT 0,
            unzip_file_path TEXT DEFAULT '',
            unzip_file_output_path TEXT DEFAULT '',
            origin_file_path TEXT DEFAULT '',
            createDate TEXT DEFAULT '',
            model_version TEXT DEFAULT 'v1',
            cover_path TEXT DEFAULT '',
            chem TEXT DEFAULT '',
            is_chem INTEGER DEFAULT 0,
            file_size INTEGER DEFAULT 0,
            rank INTEGER DEFAULT 0,
            can_retry INTEGER DEFAULT 0,
            is_expire INTEGER DEFAULT 0
        );

        -- 3. 新建 taskDemoData 表（与 taskData 同结构）
        CREATE TABLE taskDemoData (
            id TEXT PRIMARY KEY,
            file_name TEXT DEFAULT '',
            type TEXT DEFAULT '',
            state TEXT DEFAULT '',
            createdAt INTEGER DEFAULT 0,
            full_md_link TEXT DEFAULT '',
            full_zip_url TEXT DEFAULT '',
            err_msg TEXT DEFAULT '',
            err_code TEXT DEFAULT '',
            jobID TEXT DEFAULT '',
            task_id TEXT DEFAULT '',
            thumb TEXT DEFAULT '',
            url TEXT DEFAULT '',
            file_url TEXT DEFAULT '',
            data_id TEXT DEFAULT '',
            batch_id TEXT DEFAULT '',
            taskType TEXT DEFAULT '',
            path TEXT DEFAULT '',
            extract_progress TEXT DEFAULT '',
            retry_time INTEGER DEFAULT 0,
            unzip_file_path TEXT DEFAULT '',
            unzip_file_output_path TEXT DEFAULT '',
            origin_file_path TEXT DEFAULT '',
            createDate TEXT DEFAULT '',
            model_version TEXT DEFAULT 'v1',
            cover_path TEXT DEFAULT '',
            chem TEXT DEFAULT '',
            is_chem INTEGER DEFAULT 0,
            file_size INTEGER DEFAULT 0,
            rank INTEGER DEFAULT 0,
            can_retry INTEGER DEFAULT 0,
            is_expire INTEGER DEFAULT 0
        );
        "#,
    });

    migrations
}
