"use client";

import { useCallback, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type UseSignInParams = {
	next?: string;
};

/**
 * サインインフック
 * @param next - リダイレクト先のURL
 * @returns {
 *  signIn: () => Promise<void | { error: Error }>,
 *  loading: boolean,
 *  error: string | null,
 * }
 */
const useSignIn = ({ next = "/app" }: UseSignInParams = {}) => {
	const supabase = useMemo(() => createClient(), []);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const signIn = useCallback(async () => {
		try {
			setError(null);
			setLoading(true);

			const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
			const callbackUrl = new URL("/api/auth/callback", appUrl);
			callbackUrl.searchParams.set("next", next);

			const { error } = await supabase.auth.signInWithOAuth({
				provider: "google",
				options: {
					redirectTo: callbackUrl.toString(),
				},
			});

			if (error) {
				setError(error.message);
			}
		} catch (error) {
			setError(
				error instanceof Error ? error.message : "不明なエラーが発生しました。",
			);
		} finally {
			setLoading(false);
		}
	}, [next, supabase]);

	return {
		signIn,
		loading,
		error,
	};
};

export default useSignIn;
