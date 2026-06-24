"use client";

import useSWR from "swr";
import type { User } from "@repo/shared/types/user";
import { getApiErrorMessage } from "@/lib/api/fetcher";

/**
 * ログイン中のユーザー情報を取得するフック。
 *
 * 取得・キャッシュ・ローディング・再検証は SWR に委ねる
 * （fetcher と Bearer 付与はグローバル設定 / axios interceptor 側）。
 *
 * @returns user / loading / error
 */
const useCurrentUser = () => {
	const { data, error, isLoading } = useSWR<User>("/users/me");

	return {
		user: data ?? null,
		loading: isLoading,
		error: error
			? getApiErrorMessage(error, "ユーザー情報の取得に失敗しました")
			: null,
	};
};

export default useCurrentUser;
