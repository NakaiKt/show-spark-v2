/**
 * application 層（認証）: sub → アプリユーザー ID の解決
 *
 * JWT の sub（= auth.users.id）は「認証 ID」であって「アプリのユーザー ID」ではない。
 * 業務テーブルの owner_id 等はすべて public.users.id を参照するため、
 * ここで sub から public.users.id へ変換する。db には引き方だけを委ね、
 * 「見つからなければ認証エラー」という判断は application が行う。
 */

import type { AppSupabaseClient } from "@repo/db/client";
import { findAppUserIdByProviderSubject } from "@repo/db/repositories/users";
import { AppError } from "@repo/shared/errors";

/** Supabase Auth を使う場合の provider 名。 */
const AUTH_PROVIDER = "supabase";

/**
 * 認証 subject から public.users.id を解決する。
 *
 * @param supabase ユーザーの JWT でスコープされたクライアント
 * @param sub      JWT の sub（auth.users.id）
 * @returns 対応する public.users.id
 * @throws AppError 対応するアプリユーザーが存在しない場合は 401
 */
export async function resolveAppUserId(
	supabase: AppSupabaseClient,
	sub: string,
): Promise<string> {
	const appUserId = await findAppUserIdByProviderSubject(
		supabase,
		AUTH_PROVIDER,
		sub,
	);

	if (!appUserId) {
		throw new AppError(
			"UNAUTHORIZED",
			401,
			"認証ユーザーに対応するアプリユーザーが見つかりません",
		);
	}

	return appUserId;
}
