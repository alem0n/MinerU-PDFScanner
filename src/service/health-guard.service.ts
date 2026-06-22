/**
 * 健康检查前置守卫服务
 *
 * 职责：
 * - 在提交任务前检查后端服务是否可用
 * - 封装检查逻辑，支持全局复用（不限于 createTask 页面）
 * - 提供检查次数追踪，防止无限重试
 *
 * 使用方式：
 * ```typescript
 * import { healthGuard } from "@/service/health-guard.service";
 * const ok = await healthGuard.check();
 * ```
 */

import { apiClient } from "./api.client";

/** 最大连续重试次数 */
export const MAX_RETRY_COUNT = 3;

/** 健康检查结果 */
export interface HealthCheckResult {
  /** 是否通过 */
  ok: boolean;
  /** 错误信息（仅在 ok=false 时有值） */
  error?: string;
  /** 已重试次数 */
  attempt: number;
}

/**
 * 健康检查守卫
 *
 * 单例模式，全局共享重试计数状态。
 * 调用 check() 后若通过则重置计数；若失败则递增计数。
 */
class HealthGuard {
  /** 当前连续失败次数 */
  private _failCount = 0;

  /** 获取当前连续失败次数 */
  get failCount(): number {
    return this._failCount;
  }

  /** 重置失败计数（通常在成功或用户主动清除后调用） */
  reset(): void {
    console.log("[HealthGuard] 重置失败计数");
    this._failCount = 0;
  }

  /**
   * 执行健康检查
   *
   * 调用 apiClient.healthCheck()（5 秒超时），
   * 成功则重置计数并返回 ok=true；
   * 失败则递增计数并返回 ok=false + 错误信息。
   *
   * @returns 健康检查结果
   */
  async check(): Promise<HealthCheckResult> {
    const attempt = this._failCount + 1;
    console.log(`[HealthGuard] 执行健康检查 (第 ${attempt} 次尝试) …`);

    try {
      await apiClient.healthCheck();
      console.log("[HealthGuard] 健康检查通过");
      this._failCount = 0;
      return { ok: true, attempt };
    } catch (err: unknown) {
      this._failCount++;
      let errorMsg = "后端服务不可用";

      if (err instanceof DOMException && err.name === "AbortError") {
        errorMsg = "后端服务响应超时（5 秒）";
      } else if (err instanceof Error) {
        // 提取具体错误信息
        errorMsg = err.message || errorMsg;
      }

      console.warn(`[HealthGuard] 健康检查失败 (第 ${attempt} 次): ${errorMsg}`);
      return {
        ok: false,
        error: errorMsg,
        attempt,
      };
    }
  }

  /**
   * 是否已达到最大重试次数上限
   */
  get isExhausted(): boolean {
    return this._failCount >= MAX_RETRY_COUNT;
  }
}

/** 全局单例 */
export const healthGuard = new HealthGuard();
