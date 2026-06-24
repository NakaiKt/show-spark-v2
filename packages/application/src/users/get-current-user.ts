/**
 * application 層（usecase）: ログイン中のユーザー情報を返す
 *
 * Express で言う service。「本人の users 行を返す」というユースケースを組み立てる。
 *   - 認可: AuthContext.appUserId（＝本人）以外の行は引かない
 *   - DB アクセス: db 層の findUserById に委譲（SQL はここに書かない）
 *   - ドメイン変換: DB 行（snake_case）を共有 DTO（camelCase）に正規化
 */

import type { UserRow } from "@repo/db/repositories/users";
import { findUserById } from "@repo/db/repositories/users";
import { AppError } from "@repo/shared/errors";
import type { User } from "@repo/shared/types/user";
import type { AuthContext } from "../types";

/** DB 行 → API が返す User DTO への変換（境界での正規化）。 */
function toUser(row: UserRow): User {
	return {
		id: row.id,
		name: row.name,
		email: row.email,
		avatarUrl: row.avatar_url,
	};
}

/**
 * 認証済みコンテキストから本人のユーザー情報を取得する。
 *
 * @param ctx authenticate() / getServerContext() が返した AuthContext
 * @returns 本人の User DTO
 * @throws AppError ユーザー行が見つからない場合は 404
 */
export async function getCurrentUser(ctx: AuthContext): Promise<User> {
	const row = await findUserById(ctx.supabase, ctx.appUserId);

	if (!row) {
		throw new AppError("NOT_FOUND", 404, "ユーザーが見つかりません");
	}

	return toUser(row);
}
