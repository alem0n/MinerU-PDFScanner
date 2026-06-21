import { createDatabase } from "./lib/db";

/**
 * 项目启动前初始化工作
 */
export async function bootstrap() {
    await createDatabase()
}
