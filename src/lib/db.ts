import { invoke } from '@tauri-apps/api/core';
import Database from '@tauri-apps/plugin-sql';

let db: Database;

export async function createDatabase() {
    const dbPath = await invoke<string>('get_db_path');
    db = await Database.load('sqlite:' + dbPath);
    return db;
}

export { db };
