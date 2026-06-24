import { extractBearerToken } from "@repo/shared/auth";
import { AppError } from "@repo/shared/errors";
import { describe, expect, it } from "vitest";

const buildRequest = (headers: Record<string, string>): Request =>
	new Request("https://example.com/api/users/me", { headers });

describe("extractBearerToken", () => {
	it("returns the token when a valid Bearer header is present", () => {
		// Arrange
		const request = buildRequest({ Authorization: "Bearer abc.def.ghi" });

		// Act
		const token = extractBearerToken(request);

		// Assert
		expect(token).toBe("abc.def.ghi");
	});

	it("throws UNAUTHORIZED when the Authorization header is missing", () => {
		// Arrange
		const request = buildRequest({});

		// Act / Assert
		expect(() => extractBearerToken(request)).toThrowError(AppError);
		try {
			extractBearerToken(request);
		} catch (e) {
			expect((e as AppError).code).toBe("UNAUTHORIZED");
			expect((e as AppError).status).toBe(401);
		}
	});

	it("throws UNAUTHORIZED when the scheme is not Bearer", () => {
		// Arrange
		const request = buildRequest({ Authorization: "Basic abc" });

		// Act / Assert
		expect(() => extractBearerToken(request)).toThrowError(AppError);
	});
});
