/**
 * 项目启动前初始化工作
 *
 * DB 初始化已改为懒加载（见 lib/db.ts 的 getDb），
 * 不再阻塞首屏渲染。保留此函数以维持向后兼容签名。
 */
export async function bootstrap() {
}
