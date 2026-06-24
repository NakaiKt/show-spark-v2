/**
 * shared 層: 共通エラー定義
 *
 * Express で言う「カスタムエラークラス」。
 * フロント・バックの全レイヤーがこの AppError を投げ、Route Handler の
 * handleRoute() が共通 JSON `{ error: { code, message } }` に変換する。
 *
 * 各層の責務:
 *   - db / application: 業務的に異常な状態を AppError として throw する
 *   - Route Handler   : throw された AppError を HTTP ステータスへ変換する（直書き禁止）
 */

/** API が返しうるエラーコード。フロントはこの code で分岐できる。 */
export type ErrorCode =
	| "UNAUTHORIZED" // 認証失敗（トークン無し / 無効）
	| "FORBIDDEN" // 認証済みだが権限なし
	| "NOT_FOUND" // リソースが存在しない
	| "VALIDATION_ERROR" // 入力検証エラー
	| "INTERNAL_ERROR"; // 想定外のサーバーエラー

/**
 * アプリ共通の例外。
 * @param code    フロントが分岐に使う安定したエラーコード
 * @param status  HTTP ステータスコード
 * @param message 任意のメッセージ（省略時は code を流用）
 */
export class AppError extends Error {
	constructor(
		public readonly code: ErrorCode,
		public readonly status: number,
		message?: string,
	) {
		super(message ?? code);
		this.name = "AppError";
	}
}
