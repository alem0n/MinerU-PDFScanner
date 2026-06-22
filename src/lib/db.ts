import { invoke } from '@tauri-apps/api/core';
import Database from '@tauri-apps/plugin-sql';

let dbPromise: Promise<Database> | null = null;

export async function getDb(): Promise<Database> {
    if (!dbPromise) {
        const dbPath = await invoke<string>('get_db_path');
        dbPromise = Database.load('sqlite:' + dbPath);
    }
    return dbPromise;
}
