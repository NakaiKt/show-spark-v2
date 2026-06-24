"use client";

import axios from "axios";
import { api } from "./client";

/**
 * SWR 用のグローバル fetcher。
 *
 * 業務 API はすべて成功時 `{ data: ... }` の共通形式で返すため、ここで payload を取り出す。
 * `SWRConfig` に登録しておけば、各フックは `useSWR<T>("/path")` だけで済む
 * （Bearer 付与は axios クライアントの interceptor が担当）。
 */
export const fetcher = <T>(url: string): Promise<T> =>
  api.get<{ data: T }>(url).then((res) => res.data.data);

/**
 * API の共通エラー形式 `{ error: { code, message } }` から表示用メッセージを取り出す。
 *
 * @param error SWR / axios が投げたエラー
 * @param fallback 取り出せなかった場合の既定メッセージ
 */
export function getApiErrorMessage(
  error: unknown,
  fallback = "エラーが発生しました",
): string {
  return axios.isAxiosError(error)
    ? (error.response?.data?.error?.message ?? fallback)
    : fallback;
}
