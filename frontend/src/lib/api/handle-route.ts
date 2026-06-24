import { AppError } from "@repo/shared/errors";
import { NextResponse } from "next/server";

/**
 * Route Handler 層: エラー → 共通 JSON 変換ラッパー
 *
 * Express で言う共通エラーミドルウェア。すべての業務 API の try/catch をここに集約し、
 * 各 route.ts でのエラー JSON 直書きを禁止する。
 *
 * - AppError（業務エラー）: その code / status をそのまま返す
 * - それ以外（想定外）   : 詳細はサーバーログに出し、クライアントには汎用 500 を返す
 *   （内部情報をレスポンスに漏らさない）
 *
 * レスポンス形式は全 API 共通で `{ error: { code, message } }`。
 */
export async function handleRoute(
  fn: () => Promise<Response>,
): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AppError) {
      return NextResponse.json(
        { error: { code: e.code, message: e.message } },
        { status: e.status },
      );
    }

    // 想定外のエラーは中身をクライアントに見せず、サーバー側だけに記録する
    console.error("[handleRoute] 予期しないエラー:", e);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 },
    );
  }
}
