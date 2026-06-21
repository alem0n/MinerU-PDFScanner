import { SettingsStore } from "@/lib/storage";
import { appDataDir } from "@tauri-apps/api/path";
import { clearCache } from "ahooks";

export type Config = {

    apiKey?: string;
    apiSecret?: string;
    /**
     * 后端服务基础地址（新 API 统一入口）
     * 例如：http://127.0.0.1:8080
     */
    baseUrl?: string;
    /**
     * 文件路径（旧配置，后续将废弃）
     */
    fileUrl?: string;
    /**
     * 上传路径（旧配置，后续将废弃）
     */
    uploadUrl?: string
    /**
     * 任务查询（旧配置，后续将废弃）
     */
    queryTaskUrl?: string

    /**
     * 缓存目录
     */
    cacheDir?: string

    /**
     * 默认下载目录
     * 配置后，任务完成时解析结果 ZIP 将自动保存到该目录
     * 未配置时，需在任务列表页手动点击下载
     */
    downloadDir?: string
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
            fileUrl: "http://127.0.0.1:8080/file",
            uploadUrl: "http://127.0.0.1:8080",
            queryTaskUrl: "http://127.0.0.1:8080/task",
            cacheDir: appData
        }, data)
    }

    set(config: Config) {
        clearCache("CONFIG")
        return this.store.set(config)
    }
    /*
     * 获取文件路径
    */
    async getFileUrl(filePath:string){
        const config = await this.get()
        const split = filePath.startsWith("/")? "" : "/"
        return `${config.fileUrl}${split}${filePath}`
    }
}

export const configService = new ConfigService()
