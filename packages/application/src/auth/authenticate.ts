/**
 * application 層（認証）: Route Handler 用の AuthContext 取得
 *
 * 業務 API の認証の標準フロー（AGENTS.md 5 章）をここに集約する:
 *   1. Authorization ヘッダーから Bearer トークンを取り出す（shared）
 *   2. そのトークンでスコープされた Supabase クライアントを作る（db）
 *   3. Supabase Auth に JWT を検証させ、sub を得る（手動 decode は禁止）
 *   4. sub → public.users.id を解決する（application）
 *
 * これを通過した時点で「認証済み」が保証され、以降の usecase は
 * AuthContext を受け取るだけでよい。
 */

import { createSupabaseClient } from "@repo/db/client";
import { extractBearerToken } from "@repo/shared/auth";
import { AppError } from "@repo/shared/errors";
import type { AuthContext } from "../types";
import { resolveAppUserId } from "./resolve-app-user";

/**
 * HTTP リクエストから認証コンテキストを構築する。
 *
 * @param request Route Handler が受け取る標準 Request
 * @returns 認証済みを表す AuthContext
 * @throws AppError トークンが無い / 無効 / アプリユーザー未解決のとき 401
 */
export async function authenticate(request: Request): Promise<AuthContext> {
	// 1 + 2: ヘッダー検証 → ユーザーの JWT でスコープされたクライアント生成
	const token = extractBearerToken(request);
	const supabase = createSupabaseClient(token);

	// 3: JWT の署名・有効期限を Supabase Auth に検証させる
	const {
		data: { user },
		error,
	} = await supabase.auth.getUser(token);

	if (error || !user) {
		throw new AppError("UNAUTHORIZED", 401, "アクセストークンが無効です");
	}

	// 4: 認証 subject をアプリの不変ユーザー ID に変換
	const appUserId = await resolveAppUserId(supabase, user.id);

	return { supabase, appUserId, sub: user.id };
}
