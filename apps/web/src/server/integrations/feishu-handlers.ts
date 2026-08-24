import { createHmac, timingSafeEqual } from "node:crypto"
import { eq } from "drizzle-orm"
import { type NextRequest, NextResponse } from "next/server"
import { requireCurrentUser } from "@/server/auth/current-user"
import { getServerConfig } from "@/config/server"
import { encodeApiKey } from "@/server/ai/config-logic"
import { getDb } from "@/server/db/client"
import { feishuConnections } from "@/server/db/schema"
import { ok, toErrorResponse } from "@/server/http/response"
import { feishuAppCredentials, getAppAccessToken, parseFeishuResponse } from "@/server/integrations/feishu-client"

const FEISHU_API = "https://open.feishu.cn"
const FEISHU_AUTHORIZE = "https://accounts.feishu.cn/open-apis/authen/v1/authorize"

function appOrigin(request: NextRequest) {
    return (process.env.NEXT_PUBLIC_APP_URL?.trim() || request.nextUrl.origin).replace(/\/$/, "")
}

function signState(userId: number) {
    const payload = `${userId}.${Date.now()}`
    const signature = createHmac("sha256", getServerConfig().sessionSecret).update(payload).digest("base64url")
    return Buffer.from(`${payload}.${signature}`).toString("base64url")
}

function verifyState(state: string, userId: number) {
    let decoded = ""
    try { decoded = Buffer.from(state, "base64url").toString("utf8") } catch { return false }
    const [rawUserId, rawTimestamp, signature] = decoded.split(".")
    if (Number(rawUserId) !== userId || !rawTimestamp || !signature) return false
    if (Date.now() - Number(rawTimestamp) > 10 * 60 * 1000) return false
    const expected = createHmac("sha256", getServerConfig().sessionSecret)
        .update(`${rawUserId}.${rawTimestamp}`).digest("base64url")
    const left = Buffer.from(signature)
    const right = Buffer.from(expected)
    return left.length === right.length && timingSafeEqual(left, right)
}

export async function feishuConnectionStatus(request: NextRequest) {
    try {
        const user = await requireCurrentUser(request)
        const configured = Boolean(process.env.FEISHU_APP_ID?.trim() && process.env.FEISHU_APP_SECRET?.trim())
        const [connection] = await getDb().select({ displayName: feishuConnections.displayName })
            .from(feishuConnections).where(eq(feishuConnections.userId, user.id)).limit(1)
        return ok({ configured, connected: Boolean(connection), displayName: connection?.displayName ?? null })
    } catch (error) {
        return toErrorResponse(error, request.nextUrl.pathname)
    }
}

export async function startFeishuConnection(request: NextRequest) {
    try {
        const user = await requireCurrentUser(request)
        const { appId } = feishuAppCredentials()
        const callback = `${appOrigin(request)}/api/integrations/feishu/callback`
        const query = new URLSearchParams({
            app_id: appId,
            redirect_uri: callback,
            state: signState(user.id),
        })
        return NextResponse.redirect(`${FEISHU_AUTHORIZE}?${query}`)
    } catch (error) {
        return toErrorResponse(error, request.nextUrl.pathname)
    }
}

export async function finishFeishuConnection(request: NextRequest) {
    const returnUrl = `${appOrigin(request)}/dashboard/imports`
    try {
        const user = await requireCurrentUser(request)
        const code = request.nextUrl.searchParams.get("code")?.trim()
        const state = request.nextUrl.searchParams.get("state")?.trim()
        if (!code || !state || !verifyState(state, user.id)) throw new Error("飞书授权状态无效或已过期")
        const response = await fetch(`${FEISHU_API}/open-apis/authen/v1/oidc/access_token`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${await getAppAccessToken()}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ grant_type: "authorization_code", code }),
        })
        const data = await parseFeishuResponse<{
            access_token: string
            refresh_token?: string
            expires_in?: number
            refresh_expires_in?: number
            open_id?: string
            name?: string
            scope?: string
        }>(response)
        const now = Date.now()
        await getDb().insert(feishuConnections).values({
            userId: user.id,
            openId: data.open_id ?? null,
            displayName: data.name ?? null,
            accessTokenEncrypted: encodeApiKey(data.access_token),
            refreshTokenEncrypted: data.refresh_token ? encodeApiKey(data.refresh_token) : null,
            accessTokenExpiresAt: new Date(now + (data.expires_in ?? 7200) * 1000),
            refreshTokenExpiresAt: data.refresh_expires_in ? new Date(now + data.refresh_expires_in * 1000) : null,
            scope: data.scope ?? null,
        }).onConflictDoUpdate({
            target: feishuConnections.userId,
            set: {
                openId: data.open_id ?? null,
                displayName: data.name ?? null,
                accessTokenEncrypted: encodeApiKey(data.access_token),
                refreshTokenEncrypted: data.refresh_token ? encodeApiKey(data.refresh_token) : null,
                accessTokenExpiresAt: new Date(now + (data.expires_in ?? 7200) * 1000),
                refreshTokenExpiresAt: data.refresh_expires_in ? new Date(now + data.refresh_expires_in * 1000) : null,
                scope: data.scope ?? null,
                updatedAt: new Date(),
            },
        })
        return NextResponse.redirect(`${returnUrl}?feishu=connected`)
    } catch (error) {
        console.error("[feishu-oauth] 授权回调失败", error)
        return NextResponse.redirect(`${returnUrl}?feishu=error`)
    }
}

export async function disconnectFeishu(request: NextRequest) {
    try {
        const user = await requireCurrentUser(request)
        await getDb().delete(feishuConnections).where(eq(feishuConnections.userId, user.id))
        return ok({ disconnected: true })
    } catch (error) {
        return toErrorResponse(error, request.nextUrl.pathname)
    }
}
