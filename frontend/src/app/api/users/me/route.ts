import { authenticate } from "@repo/application/auth/authenticate";
import { getCurrentUser } from "@repo/application/users/get-current-user";
import { NextResponse } from "next/server";
import { handleRoute } from "@/lib/api/handle-route";

/**
 * Route Handler 層（router + controller）: GET /api/users/me
 *
 * HTTP の入口。ここでは「HTTP 変換」しかしない:
 *   - 認証コンテキスト取得 → authenticate（application）
 *   - 業務処理            → getCurrentUser（application）
 *   - エラー → 共通 JSON  → handleRoute
 *
 * 業務ロジックや DB 操作はここには書かない（すべて application / db へ委譲）。
 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const ctx = await authenticate(request);
    const user = await getCurrentUser(ctx);
    return NextResponse.json({ data: user });
  });
}
