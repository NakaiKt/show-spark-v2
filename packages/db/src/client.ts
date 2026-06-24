/**
 * db 層: Supabase クライアント生成
 *
 * 業務 API（Bearer トークン認証）用の Supabase クライアントを作る唯一の場所。
 * ユーザーの JWT を Authorization ヘッダーに乗せることで、以降の DB アクセスは
 * すべてそのユーザーのスコープ（RLS が有効）で実行される。
 *
 * Cookie セッション用のクライアント（@supabase/ssr）とは別物。
 * こちらは @supabase/supabase-js を使い、1 リクエストにつき 1 度だけ生成して
 * AuthContext に乗せて受け渡す。
 */
import {
	createClient as createSupabaseJsClient,
	type SupabaseClient,
} from "@supabase/supabase-js";
import type { Database } from "./database.types";

/** 本アプリの DB スキーマで型付けされた Supabase クライアント。 */
export type AppSupabaseClient = SupabaseClient<Database>;

/**
 * ユーザーの access_token でスコープされた Supabase クライアントを生成する。
 *
 * @param accessToken ユーザーの JWT（Bearer トークン）
 * @returns RLS が効いた状態でクエリできる Supabase クライアント
 */
export function createSupabaseClient(accessToken: string): AppSupabaseClient {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

	// 入力検証: 必須の環境変数が無ければ起動時点で fail-fast する
	if (!url || !key) {
		throw new Error("Supabaseの環境変数が設定されていません。");
	}

	return createSupabaseJsClient<Database>(url, key, {
		global: {
			// このクライアントが投げる全リクエストにユーザーの JWT を付与する
			headers: { Authorization: `Bearer ${accessToken}` },
		},
		auth: {
			// サーバー側で 1 リクエストごとに使い捨てるため、セッション永続化は不要
			persistSession: false,
			autoRefreshToken: false,
		},
	});
}
