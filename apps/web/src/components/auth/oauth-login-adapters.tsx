"use client"

import { createAuthClient } from "better-auth/react"

import { GithubIcon, Globe2, type IconComponent } from "@/components/iconimate"

export type OAuthLoginProviderId = "github" | "google"

export interface OAuthLoginOptions {
  callbackURL: string
  errorCallbackURL: string
}

export interface OAuthLoginAdapter {
  id: OAuthLoginProviderId
  label: string
  Icon: IconComponent
  signIn: (options: OAuthLoginOptions) => Promise<string | null>
}

const authClient = createAuthClient()

/** 发起 Better Auth 社交登录，并把客户端错误收敛为可判断的消息。 */
const signInSocial = async (
  provider: OAuthLoginProviderId,
  options: OAuthLoginOptions,
): Promise<string | null> => {
  const { error } = await authClient.signIn.social({ provider, ...options })
  return error?.message ?? null
}

export const oauthLoginAdapters = [
  {
    id: "github",
    label: "GitHub",
    Icon: GithubIcon,
    signIn: (options) => signInSocial("github", options),
  },
  {
    id: "google",
    label: "Google",
    Icon: Globe2,
    signIn: (options) => signInSocial("google", options),
  },
] satisfies OAuthLoginAdapter[]

/** 读取当前用户已绑定的 OAuth 供应商，并过滤掉邮箱密码等非 OAuth 账号。 */
export const listLinkedOAuthProviders = async (): Promise<OAuthLoginProviderId[]> => {
  const { data, error } = await authClient.listAccounts()
  if (error) throw new Error(error.message)
  return oauthLoginAdapters
    .filter((adapter) => data?.some((account) => account.providerId === adapter.id))
    .map((adapter) => adapter.id)
}

/** 解除当前用户与指定 OAuth 供应商的本站绑定。 */
export const unlinkOAuthProvider = async (providerId: OAuthLoginProviderId): Promise<void> => {
  const { error } = await authClient.unlinkAccount({ providerId })
  if (error) throw new Error(error.message)
}
