import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * packages/ 配下の単体テスト用 Vitest 設定。
 *
 * frontend/tsconfig.json と同じ `@repo/*` エイリアスをテストでも解決できるようにする。
 * テストは各パッケージの src の隣（__tests__）に置く方針（設計ドキュメント参照）。
 */
const resolveSrc = (pkg: string) =>
	fileURLToPath(new URL(`./packages/${pkg}/src`, import.meta.url));

export default defineConfig({
	resolve: {
		alias: [
			{ find: "@repo/shared", replacement: resolveSrc("shared") },
			{ find: "@repo/db", replacement: resolveSrc("db") },
			{ find: "@repo/application", replacement: resolveSrc("application") },
		],
	},
	test: {
		environment: "node",
		include: ["packages/**/__tests__/**/*.test.ts"],
	},
});
