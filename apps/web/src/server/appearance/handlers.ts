import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import type { NextRequest } from "next/server"
import { z } from "zod"
import { getServerConfig } from "@/config/server"
import { MAX_FONT_ASSETS, validateFontSelections } from "@/lib/font-config"
import { requireCurrentUser } from "@/server/auth/current-user"
import { getDb } from "@/server/db/client"
import { siteAppearance, users } from "@/server/db/schema"
import { isSuperAdmin } from "@/server/admin/logic"
import { badRequest, conflict, forbidden, notFound, ok, readJson, toErrorResponse, unauthorized } from "@/server/http/response"
import { invalidatePublicSiteAppearanceCache } from "@/server/public-content-cache"
import { deleteS3Objects } from "@/server/upload/s3-delete"
import { fetchS3ObjectBytes } from "@/server/upload/s3-fetch"
import { stripS4KeyPrefix } from "@/server/upload/s3-presign"
import { loadCachedPublicSiteAppearance, loadSiteAppearanceOrNull } from "./public-loader"
import {
    SITE_APPEARANCE_ID,
    buildSiteAppearanceResponse,
    siteBrandingSchema,
    validateFontFile,
    validateSiteLogoFile,
} from "./logic"

const appearanceUpdateSchema = siteBrandingSchema.extend({
    siteLogoObjectKey: z.string().trim().min(1).nullable().optional(),
    fontConfig: z.object({
        interfaceFont: z.string(),
        contentFont: z.string(),
        monospaceFont: z.string(),
    }),
})

const fontRegisterSchema = z.object({
    name: z.string().trim().min(1).max(80),
    objectKey: z.string().trim().min(1),
})

const fontDeleteSchema = z.object({ id: z.string().uuid() })

type User = Awaited<ReturnType<typeof requireCurrentUser>>

async function withPublic(request: NextRequest, handler: () => Promise<Response>) {
    try {
        return await handler()
    } catch (error) {
        return toErrorResponse(error, request.nextUrl.pathname)
    }
}

async function requireSuperAdminUser(user: User) {
    const [freshUser] = await getDb()
        .select()
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1)

    if (!freshUser) {
        throw unauthorized("登录信息已失效")
    }
    if (!isSuperAdmin(freshUser.systemRole, freshUser.id)) {
        throw forbidden("仅超级管理员可执行该操作")
    }
    return freshUser
}

async function withAdmin(request: NextRequest, handler: (user: User) => Promise<Response>) {
    try {
        const user = await requireCurrentUser(request)
        await requireSuperAdminUser(user)
        return await handler(user)
    } catch (error) {
        return toErrorResponse(error, request.nextUrl.pathname)
    }
}

export async function publicSiteAppearance(request: NextRequest) {
    return withPublic(request, async () => {
        return ok(await loadCachedPublicSiteAppearance())
    })
}

export async function adminSiteAppearanceDetail(request: NextRequest) {
    return withAdmin(request, async () => {
        const record = await loadSiteAppearanceOrNull()
        return ok(buildSiteAppearanceResponse(record))
    })
}

export async function adminSiteAppearanceUpdate(request: NextRequest) {
    return withAdmin(request, async (user) => {
        const input = appearanceUpdateSchema.parse(await readJson(request))
        const current = buildSiteAppearanceResponse(await loadSiteAppearanceOrNull())
        let selections
        try {
            selections = validateFontSelections(input.fontConfig, current.fontConfig)
        } catch (error) {
            throw badRequest(error instanceof Error ? error.message : "字体配置无效")
        }

        let nextSiteLogo = current.siteLogo
        let newLogoObjectKey: string | null = null
        if (input.siteLogoObjectKey === null) {
            nextSiteLogo = null
        } else if (input.siteLogoObjectKey !== undefined) {
            const objectKey = stripS4KeyPrefix(input.siteLogoObjectKey)
            if (!objectKey.startsWith(`uploads/${user.id}/`)) {
                throw forbidden("只能使用当前账号上传的站点 Logo")
            }
            if (current.siteLogo?.objectKey !== objectKey) {
                try {
                    const object = await fetchS3ObjectBytes(objectKey)
                    const format = await validateSiteLogoFile(objectKey, object.data)
                    nextSiteLogo = {
                        objectKey,
                        format,
                        size: object.data.length,
                        updatedAt: new Date().toISOString(),
                    }
                    newLogoObjectKey = objectKey
                } catch (error) {
                    const cleanup = await deleteS3Objects(getServerConfig().s3, [objectKey])
                    if (cleanup.failedObjectKeys.length > 0) {
                        console.warn("站点 Logo 登记失败后的对象清理未完成", cleanup.failedObjectKeys)
                    }
                    throw badRequest(error instanceof Error ? error.message : "站点 Logo 文件无效")
                }
            }
        }

        let response
        try {
            response = await saveSiteAppearance({
                ...current,
                siteName: input.siteName,
                siteDescription: input.siteDescription,
                sidebarTitle: input.sidebarTitle,
                siteLogo: nextSiteLogo,
                fontConfig: { ...current.fontConfig, ...selections },
            })
        } catch (error) {
            if (newLogoObjectKey) {
                const cleanup = await deleteS3Objects(getServerConfig().s3, [newLogoObjectKey])
                if (cleanup.failedObjectKeys.length > 0) {
                    console.warn("站点 Logo 保存失败后的对象清理未完成", cleanup.failedObjectKeys)
                }
            }
            throw error
        }

        if (current.siteLogo && current.siteLogo.objectKey !== response.siteLogo?.objectKey) {
            const cleanup = await deleteS3Objects(getServerConfig().s3, [current.siteLogo.objectKey])
            if (cleanup.failedObjectKeys.length > 0) {
                console.warn("旧站点 Logo 对象删除未完成", cleanup.failedObjectKeys)
            }
        }
        return ok(response)
    })
}

export async function adminFontRegister(request: NextRequest) {
    return withAdmin(request, async (user) => {
        const input = fontRegisterSchema.parse(await readJson(request))
        const objectKey = stripS4KeyPrefix(input.objectKey)
        if (!objectKey.startsWith(`uploads/${user.id}/`)) {
            throw forbidden("只能登记当前账号上传的字体")
        }

        const current = buildSiteAppearanceResponse(await loadSiteAppearanceOrNull())
        if (current.fontConfig.assets.some((asset) => asset.objectKey === objectKey)) {
            throw conflict("该字体文件已登记")
        }

        let data: Buffer
        let format: "ttf" | "otf" | "woff" | "woff2"
        try {
            if (current.fontConfig.assets.length >= MAX_FONT_ASSETS) {
                throw badRequest(`最多可上传 ${MAX_FONT_ASSETS} 个字体文件`)
            }
            const object = await fetchS3ObjectBytes(objectKey)
            data = object.data
            try {
                format = validateFontFile(objectKey, data)
            } catch (error) {
                throw badRequest(error instanceof Error ? error.message : "字体文件无效")
            }

        } catch (error) {
            const cleanup = await deleteS3Objects(getServerConfig().s3, [objectKey])
            if (cleanup.failedObjectKeys.length > 0) {
                console.warn("字体登记失败后的对象清理未完成", cleanup.failedObjectKeys)
            }
            throw error
        }

        const fontConfig = {
            ...current.fontConfig,
            assets: [...current.fontConfig.assets, {
                id: randomUUID(),
                name: input.name,
                objectKey,
                format,
                size: data.length,
                createdAt: new Date().toISOString(),
            }],
        }
        return ok(await saveSiteAppearance({ ...current, fontConfig }))
    })
}

export async function adminFontDelete(request: NextRequest) {
    return withAdmin(request, async () => {
        const input = fontDeleteSchema.parse(await readJson(request))
        const current = buildSiteAppearanceResponse(await loadSiteAppearanceOrNull())
        const asset = current.fontConfig.assets.find((item) => item.id === input.id)
        if (!asset) throw notFound("字体不存在")

        const selection = `uploaded:${asset.id}`
        if (
            current.fontConfig.interfaceFont === selection ||
            current.fontConfig.contentFont === selection ||
            current.fontConfig.monospaceFont === selection
        ) {
            throw conflict("该字体正在使用，请先切换相关字体设置")
        }

        const response = await saveSiteAppearance({
            ...current,
            fontConfig: {
                ...current.fontConfig,
                assets: current.fontConfig.assets.filter((item) => item.id !== asset.id),
            },
        })
        const cleanup = await deleteS3Objects(getServerConfig().s3, [asset.objectKey])
        if (cleanup.failedObjectKeys.length > 0) {
            console.warn("字体对象删除未完成", cleanup.failedObjectKeys)
        }
        return ok(response)
    })
}

async function saveSiteAppearance(appearance: ReturnType<typeof buildSiteAppearanceResponse>) {
    const now = new Date()
    const [record] = await getDb()
        .insert(siteAppearance)
        .values({
            id: SITE_APPEARANCE_ID,
            publicQaEnabled: appearance.publicQaEnabled,
            siteName: appearance.siteName,
            siteDescription: appearance.siteDescription,
            sidebarTitle: appearance.sidebarTitle,
            siteLogoJson: appearance.siteLogo ? JSON.stringify(appearance.siteLogo) : null,
            fontConfigJson: JSON.stringify(appearance.fontConfig),
            updatedAt: now,
        })
        .onConflictDoUpdate({
            target: siteAppearance.id,
            set: {
                siteName: appearance.siteName,
                siteDescription: appearance.siteDescription,
                sidebarTitle: appearance.sidebarTitle,
                siteLogoJson: appearance.siteLogo ? JSON.stringify(appearance.siteLogo) : null,
                fontConfigJson: JSON.stringify(appearance.fontConfig),
                updatedAt: now,
            },
        })
        .returning()

    invalidatePublicSiteAppearanceCache()
    return buildSiteAppearanceResponse(record)
}
