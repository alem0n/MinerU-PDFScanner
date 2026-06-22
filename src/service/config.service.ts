import { SettingsStore } from "@/lib/storage";
import { appDataDir } from "@tauri-apps/api/path";
import { clearCache } from "ahooks";
import { readDir } from "@tauri-apps/plugin-fs";

export type Config = {
    /**
     * 后端服务基础地址（新 API 统一入口）
     * 例如：http://127.0.0.1:8080
     */
    baseUrl?: string;
    /**
     * 缓存目录
     */
    cacheDir?: string;
    /**
     * 默认下载目录
     * 配置后，任务完成时解析结果 ZIP 将自动保存到该目录
     * 未配置时，需在任务列表页手动点击下载
     */
    downloadDir?: string;
}

export class ConfigService {
    store: SettingsStore<Config>

    constructor() {
        this.store = new SettingsStore<Config>('config')
    }


    async get(): Promise<Config> {
        const appData = await appDataDir()
        const data = await this.store.get()
        // 安全合并：只覆盖 data 中有实际值的字段，避免 undefined / 空字符串冲掉默认值
        return {
            baseUrl: data?.baseUrl || "http://127.0.0.1:8080",
            cacheDir: data?.cacheDir || appData,
            downloadDir: data?.downloadDir || undefined,
        }
    }

    /**
     * 检查指定目录下是否有文件（排除 . 和 ..）
     * 用于修改缓存目录时，提示用户旧缓存中有内容
     */
    async checkDirHasContent(dir: string): Promise<boolean> {
        try {
            const entries = await readDir(dir);
            return entries.length > 0;
        } catch {
            // 目录不存在或无法读取，视为无内容
            return false;
        }
    }

    async set(config: Config): Promise<void> {
        clearCache("CONFIG")
        await this.store.set(config)
    }
}

export const configService = new ConfigService()
