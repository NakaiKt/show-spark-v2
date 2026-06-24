/**
 * shared 層: HTTP 認証ユーティリティ（入力検証の一部）
 *
 * Express で言う「リクエストヘッダーのバリデーション」。
 * Authorization ヘッダーの形式チェックだけを担当し、トークンの「中身が正しいか」
 * （署名検証）は db/application 層に委ねる。ここは純粋な文字列処理に留める。
 */
import { AppError } from "./errors";

/**
 * `Authorization: Bearer <token>` ヘッダーから JWT 文字列を取り出す。
 * 形式が不正なら 401 の AppError を投げる（＝認証の入口での fail-fast）。
 *
 * @param request Route Handler が受け取る標準 Request
 * @returns Bearer トークン文字列（署名検証はまだ行っていない生のトークン）
 */
export function extractBearerToken(request: Request): string {
	const header =
		request.headers.get("authorization") ??
		request.headers.get("Authorization");

	if (!header) {
		throw new AppError(
			"UNAUTHORIZED",
			401,
			"Authorization ヘッダーがありません",
		);
	}

	const [scheme, token] = header.split(" ");
	if (scheme !== "Bearer" || !token) {
		throw new AppError(
			"UNAUTHORIZED",
			401,
			"Authorization ヘッダーの形式が不正です（Bearer <token> が必要）",
		);
	}

	return token;
}
