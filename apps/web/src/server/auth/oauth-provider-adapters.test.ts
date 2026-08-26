import { describe, expect, it } from "vitest"

import { buildOAuthSocialProviders } from "./oauth-provider-adapters"

describe("OAuth provider adapters", () => {
    it("凭据完整时启用供应商，并服从公开注册策略", () => {
        const providers = buildOAuthSocialProviders({
            GITHUB_CLIENT_ID: " github-id ",
            GITHUB_CLIENT_SECRET: "github-secret",
            GOOGLE_CLIENT_ID: "google-id",
            GOOGLE_CLIENT_SECRET: " google-secret ",
            NEXT_PUBLIC_REGISTER_ENABLED: "true",
        })

        expect(providers).toEqual({
            github: {
                clientId: "github-id",
                clientSecret: "github-secret",
                disableImplicitSignUp: false,
                enabled: true,
            },
            google: {
                clientId: "google-id",
                clientSecret: "google-secret",
                disableImplicitSignUp: false,
                enabled: true,
            },
        })
    })

    it("凭据缺失时禁用供应商，且默认禁止 OAuth 隐式注册", () => {
        const providers = buildOAuthSocialProviders({
            GITHUB_CLIENT_ID: "github-id",
        })

        expect(providers.github.enabled).toBe(false)
        expect(providers.google.enabled).toBe(false)
        expect(providers.github.disableImplicitSignUp).toBe(true)
        expect(providers.google.disableImplicitSignUp).toBe(true)
    })
})
