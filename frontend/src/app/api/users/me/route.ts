import { getCurrentUser } from "@repo/application/users/get-current-user";
import { withAuth } from "@/lib/api/with-auth";

/**
 * GET /api/users/me — ログイン中ユーザーを返す（認証必須）。
 *
 * withAuth が authenticate を強制し、結果を `{ data }` で包む。
 * この route.ts は「どの usecase を繋ぐか」だけを宣言する。
 */
export const GET = withAuth((ctx) => getCurrentUser(ctx));
