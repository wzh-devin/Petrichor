const LOGIN_REDIRECT_BASE = new URL("https://petrichor.local")

/** 将登录回跳地址限制为站内绝对路径，拒绝协议地址和反斜杠绕过。 */
export function resolveLoginRedirect(value: string | null, fallback: string): string {
  if (!value?.startsWith("/")) return fallback
  try {
    const resolved = new URL(value, LOGIN_REDIRECT_BASE)
    return resolved.origin === LOGIN_REDIRECT_BASE.origin
      ? `${resolved.pathname}${resolved.search}${resolved.hash}`
      : fallback
  } catch {
    return fallback
  }
}
