import { isRegisterEnabled } from "./register-policy"

export type OAuthProviderId = "github" | "google"

interface OAuthProviderAdapter {
    id: OAuthProviderId
    clientIdEnv: string
    clientSecretEnv: string
}

interface OAuthProviderConfig {
    clientId: string
    clientSecret: string
    disableImplicitSignUp: boolean
    enabled: boolean
}

const oauthProviderAdapters = {
    github: {
        id: "github",
        clientIdEnv: "GITHUB_CLIENT_ID",
        clientSecretEnv: "GITHUB_CLIENT_SECRET",
    },
    google: {
        id: "google",
        clientIdEnv: "GOOGLE_CLIENT_ID",
        clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    },
} as const satisfies Record<OAuthProviderId, OAuthProviderAdapter>

function buildProviderConfig(
    adapter: OAuthProviderAdapter,
    env: Record<string, string | undefined>,
    disableImplicitSignUp: boolean,
): OAuthProviderConfig {
    const clientId = env[adapter.clientIdEnv]?.trim() ?? ""
    const clientSecret = env[adapter.clientSecretEnv]?.trim() ?? ""
    return {
        clientId,
        clientSecret,
        disableImplicitSignUp,
        enabled: Boolean(clientId && clientSecret),
    }
}

/** 构建 Better Auth 社交登录配置，并让 OAuth 注册服从公开注册开关。 */
export function buildOAuthSocialProviders(
    env: Record<string, string | undefined> = process.env,
): Record<OAuthProviderId, OAuthProviderConfig> {
    const disableImplicitSignUp = !isRegisterEnabled(env)
    return Object.fromEntries(
        Object.values(oauthProviderAdapters).map((adapter) => [
            adapter.id,
            buildProviderConfig(adapter, env, disableImplicitSignUp),
        ]),
    ) as Record<OAuthProviderId, OAuthProviderConfig>
}
