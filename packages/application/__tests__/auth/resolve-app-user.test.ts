import { beforeEach, describe, expect, it, vi } from "vitest";

// db 層をモックし、application 層の認可ロジックだけを単独で検証する
vi.mock("@repo/db/repositories/users", () => ({
	findAppUserIdByProviderSubject: vi.fn(),
}));

import { resolveAppUserId } from "@repo/application/auth/resolve-app-user";
import type { AppSupabaseClient } from "@repo/db/client";
import { findAppUserIdByProviderSubject } from "@repo/db/repositories/users";
import { AppError } from "@repo/shared/errors";

const supabase = {} as AppSupabaseClient;
const mockedFind = vi.mocked(findAppUserIdByProviderSubject);

describe("resolveAppUserId", () => {
	beforeEach(() => {
		mockedFind.mockReset();
	});

	it("returns the app user id resolved from the auth subject", async () => {
		// Arrange
		mockedFind.mockResolvedValue("app-user-1");

		// Act
		const appUserId = await resolveAppUserId(supabase, "auth-sub-1");

		// Assert
		expect(appUserId).toBe("app-user-1");
		expect(mockedFind).toHaveBeenCalledWith(supabase, "supabase", "auth-sub-1");
	});

	it("throws UNAUTHORIZED when no app user matches the subject", async () => {
		// Arrange
		mockedFind.mockResolvedValue(null);

		// Act / Assert
		await expect(resolveAppUserId(supabase, "unknown")).rejects.toMatchObject({
			code: "UNAUTHORIZED",
			status: 401,
		});
		await expect(resolveAppUserId(supabase, "unknown")).rejects.toBeInstanceOf(
			AppError,
		);
	});
});
