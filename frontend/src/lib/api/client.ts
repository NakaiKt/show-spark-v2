"use client";

import axios from "axios";
import { getAccessToken } from "./token-provider";

/**
 * フロント専用: 業務 API を叩く axios クライアント
 *
 * 業務コードは `api.get("/users/me")` のように呼ぶだけでよい。
 *   - baseURL "/api": `/api` プレフィックスを自動付与
 *   - request interceptor: ログイン中なら Bearer トークンを自動付与
 *
 * Supabase への依存は token-provider に閉じ込め、ここからは見えないようにしている。
 */
export const api = axios.create({
  baseURL: "/api",
});

// 全リクエストに Authorization: Bearer <access_token> を付ける
api.interceptors.request.use(async (config) => {
  const token = await getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
