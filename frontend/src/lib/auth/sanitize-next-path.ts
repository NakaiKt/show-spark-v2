export function sanitizeNextPath(
  nextParam: string | null | undefined,
  defaultPath = "/app",
): string {
  if (nextParam?.startsWith("/") && !nextParam.startsWith("//")) {
    return nextParam;
  }

  return defaultPath;
}
