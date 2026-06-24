import { authenticate } from "@repo/application/auth/authenticate";
import type { AuthContext } from "@repo/application/types";
import { NextResponse } from "next/server";
import { handleRoute } from "./handle-route";

/**
 * Route Handler 層: 認証必須エンドポイント用ラッパー
 *
 * 認証 → usecase → レスポンスの「配線」を 1 箇所に集約する。
 *   - `authenticate` を必ず通すので、認証の書き忘れ（＝認証漏れ事故）が構造的に起きない
 *   - 成功時は全 API 共通の `{ data }` 形式で返す
 *   - エラーは handleRoute が `{ error: { code, message } }` に変換
 *
 * 認証ロジック本体は packages（application 層）にあり、ここは HTTP への配線のみ。
 *
 * @param handler 認証済み AuthContext を受け取り、レスポンス payload を返す関数
 * @returns Next.js の Route Handler（`export const GET = withAuth(...)` の形で使う）
 */
export function withAuth<T>(
  handler: (ctx: AuthContext, request: Request) => Promise<T>,
): (request: Request) => Promise<Response> {
  return (request) =>
    handleRoute(async () => {
      const ctx = await authenticate(request);
      const data = await handler(ctx, request);
      return NextResponse.json({ data });
    });
}
