import { SettingsStore } from "@/lib/storage";
import { appDataDir } from "@tauri-apps/api/path";
import { clearCache } from "ahooks";

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


    async get() {
        const appData = await appDataDir()
        const data = await this.store.get()
        return Object.assign({
            baseUrl: "http://127.0.0.1:8080",
            cacheDir: appData
        }, data)
    }

    set(config: Config) {
        clearCache("CONFIG")
        return this.store.set(config)
    }
}

export const configService = new ConfigService()
