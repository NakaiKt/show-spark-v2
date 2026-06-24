/**
 * db 層（repository / dao）: users・user_auth_identities テーブルへのアクセス
 *
 * Express で言う dao。SELECT/INSERT/UPDATE/DELETE のカプセル化だけを行い、
 * 「誰のデータか」「権限があるか」といった業務判断・認可は一切書かない。
 * それらは application 層の責務。
 */
import type { AppSupabaseClient } from "../client";
import type { Database } from "../database.types";

/** public.users の 1 行（DB スキーマ由来の型）。 */
export type UserRow = Database["public"]["Tables"]["users"]["Row"];

/**
 * users を主キー（public.users.id）で 1 件取得する。
 *
 * @param supabase ユーザーの JWT でスコープされたクライアント（RLS が効く）
 * @param id       public.users.id
 * @returns 行が無い / RLS で弾かれた場合は null
 */
export async function findUserById(
	supabase: AppSupabaseClient,
	id: string,
): Promise<UserRow | null> {
	const { data, error } = await supabase
		.from("users")
		.select("*")
		.eq("id", id)
		.single();

	if (error) return null;
	return data;
}

/**
 * 認証プロバイダの subject（auth.users.id）から、対応するアプリユーザー ID
 * （public.users.id）を引く。
 *
 * @param supabase        ユーザーの JWT でスコープされたクライアント
 * @param provider        認証プロバイダ名（Supabase Auth なら "supabase"）
 * @param providerSubject JWT の sub（= auth.users.id）
 * @returns 対応する public.users.id。無ければ null
 */
export async function findAppUserIdByProviderSubject(
	supabase: AppSupabaseClient,
	provider: string,
	providerSubject: string,
): Promise<string | null> {
	const { data, error } = await supabase
		.from("user_auth_identities")
		.select("user_id")
		.eq("provider", provider)
		.eq("provider_subject", providerSubject)
		.single();

	if (error) return null;
	return data.user_id;
}
