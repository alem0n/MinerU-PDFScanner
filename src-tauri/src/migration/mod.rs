use tauri_plugin_sql::{Migration, MigrationKind};

pub fn load_migrations() -> Vec<Migration> {
    let mut migrations = Vec::new();
    // 初始化版本
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

    // v2: 新增 created_at 排序字段
    migrations.push(Migration {
        version: 2,
        description: "add_created_at_to_tasks",
        kind: MigrationKind::Up,
        sql: "ALTER TABLE tasks ADD COLUMN created_at TEXT;",
    });

    migrations
}
