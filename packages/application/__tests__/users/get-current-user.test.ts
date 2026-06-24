import { beforeEach, describe, expect, it, vi } from "vitest";

// db 層をモックし、usecase（DTO 変換・404 判断）だけを単独で検証する
vi.mock("@repo/db/repositories/users", () => ({
	findUserById: vi.fn(),
}));

import type { AuthContext } from "@repo/application/types";
import { getCurrentUser } from "@repo/application/users/get-current-user";
import type { AppSupabaseClient } from "@repo/db/client";
import { findUserById } from "@repo/db/repositories/users";

const ctx: AuthContext = {
	supabase: {} as AppSupabaseClient,
	appUserId: "app-user-1",
	sub: "auth-sub-1",
};

const mockedFind = vi.mocked(findUserById);

describe("getCurrentUser", () => {
	beforeEach(() => {
		mockedFind.mockReset();
	});

	it("maps the DB row (snake_case) to the User DTO (camelCase)", async () => {
		// Arrange
		mockedFind.mockResolvedValue({
			id: "app-user-1",
			name: "山田太郎",
			email: "taro@example.com",
			avatar_url: "https://example.com/a.png",
			created_at: "2026-01-01T00:00:00.000Z",
			updated_at: "2026-01-01T00:00:00.000Z",
		});

		// Act
		const user = await getCurrentUser(ctx);

		// Assert
		expect(user).toEqual({
			id: "app-user-1",
			name: "山田太郎",
			email: "taro@example.com",
			avatarUrl: "https://example.com/a.png",
		});
		expect(mockedFind).toHaveBeenCalledWith(ctx.supabase, "app-user-1");
	});

	it("throws NOT_FOUND when the user row does not exist", async () => {
		// Arrange
		mockedFind.mockResolvedValue(null);

		// Act / Assert
		await expect(getCurrentUser(ctx)).rejects.toMatchObject({
			code: "NOT_FOUND",
			status: 404,
		});
	});
});
