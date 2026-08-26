import { badRequest } from "@/server/http/response"

export type RegisterDefaultSystemRole = "USER" | "SUPER_ADMIN"

export const REGISTER_ENABLED_ENV = "NEXT_PUBLIC_REGISTER_ENABLED"
export const REGISTER_DEFAULT_SYSTEM_ROLE_ENV = "PETRICHOR_REGISTER_DEFAULT_SYSTEM_ROLE"

/** 判断当前部署是否允许公开注册；缺省或非 true 值一律关闭。 */
export function isRegisterEnabled(env: Record<string, string | undefined> = process.env): boolean {
    return env[REGISTER_ENABLED_ENV] === "true"
}

export function resolveRegisterDefaultSystemRole(
    env: Record<string, string | undefined> = process.env,
): RegisterDefaultSystemRole {
    const raw = env[REGISTER_DEFAULT_SYSTEM_ROLE_ENV]?.trim().toUpperCase()
    if (!raw) {
        return "USER"
    }
    if (raw === "USER" || raw === "SUPER_ADMIN") {
        return raw
    }

    throw badRequest(`${REGISTER_DEFAULT_SYSTEM_ROLE_ENV} 只支持 USER 或 SUPER_ADMIN`)
}
