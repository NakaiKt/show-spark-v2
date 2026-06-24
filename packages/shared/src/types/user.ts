/**
 * shared 層: ユーザー DTO（フロント・バック共有の型）
 *
 * DB の行（snake_case）そのものではなく、API が返す契約としての形。
 * camelCase に正規化し、フロントはこの型だけを知っていればよい。
 * DB → DTO の変換は application 層（get-current-user.ts）が担当する。
 */
export interface User {
	/** アプリ内の不変ユーザー ID（public.users.id） */
	id: string;
	/** 表示名 */
	name: string;
	/** メールアドレス */
	email: string;
	/** アバター画像 URL（未設定なら null） */
	avatarUrl: string | null;
}
