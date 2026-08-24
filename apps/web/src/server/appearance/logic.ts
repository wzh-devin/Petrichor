import type { SiteAppearanceRecord } from "@/server/db/schema"
import sharp from "sharp"
import { z } from "zod"
import {
    type FontFormat,
    type SiteFontConfig,
    MAX_FONT_FILE_BYTES,
    parseSiteFontConfig,
} from "@/lib/font-config"
import {
    DEFAULT_RETYPESET_APPEARANCE,
    type RetypesetAppearanceConfig,
} from "@/lib/retypeset-themes"
import {
    DEFAULT_SITE_DESCRIPTION,
    DEFAULT_SIDEBAR_TITLE,
    DEFAULT_SITE_NAME,
    SIDEBAR_TITLE_MAX_LENGTH,
    SITE_DESCRIPTION_MAX_LENGTH,
    SITE_NAME_MAX_LENGTH,
    MAX_SITE_LOGO_FILE_BYTES,
    type SiteLogoAsset,
    type SiteLogoFormat,
    type SiteBrandingConfig,
} from "@/lib/site-branding"

export const SITE_APPEARANCE_ID = 1

export const siteBrandingSchema = z.object({
    siteName: z.string().trim().min(1, "站点名称不能为空")
        .max(SITE_NAME_MAX_LENGTH, `站点名称不能超过 ${SITE_NAME_MAX_LENGTH} 个字符`),
    siteDescription: z.string().trim().min(1, "站点描述不能为空")
        .max(SITE_DESCRIPTION_MAX_LENGTH, `站点描述不能超过 ${SITE_DESCRIPTION_MAX_LENGTH} 个字符`),
    sidebarTitle: z.string().trim().min(1, "侧栏标题不能为空")
        .max(SIDEBAR_TITLE_MAX_LENGTH, `侧栏标题不能超过 ${SIDEBAR_TITLE_MAX_LENGTH} 个字符`),
})

const siteLogoAssetSchema = z.object({
    objectKey: z.string().trim().min(1),
    format: z.enum(["png", "jpeg", "webp"]),
    size: z.number().int().positive().max(MAX_SITE_LOGO_FILE_BYTES),
    updatedAt: z.string().datetime(),
})

export interface SiteAppearanceResponse extends RetypesetAppearanceConfig, SiteBrandingConfig {
    fontConfig: SiteFontConfig
    createdAt: string | null
    updatedAt: string | null
}

export function buildSiteAppearanceResponse(record?: SiteAppearanceRecord | null): SiteAppearanceResponse {
    if (!record) {
        return {
            ...DEFAULT_RETYPESET_APPEARANCE,
            siteName: DEFAULT_SITE_NAME,
            siteDescription: DEFAULT_SITE_DESCRIPTION,
            sidebarTitle: DEFAULT_SIDEBAR_TITLE,
            siteLogo: null,
            fontConfig: parseSiteFontConfig(null),
            createdAt: null,
            updatedAt: null,
        }
    }
    return {
        publicQaEnabled: record.publicQaEnabled ?? DEFAULT_RETYPESET_APPEARANCE.publicQaEnabled,
        siteName: record.siteName.trim() || DEFAULT_SITE_NAME,
        siteDescription: record.siteDescription.trim() || DEFAULT_SITE_DESCRIPTION,
        sidebarTitle: record.sidebarTitle.trim() || DEFAULT_SIDEBAR_TITLE,
        siteLogo: parseSiteLogoAsset(record.siteLogoJson),
        fontConfig: parseSiteFontConfig(record.fontConfigJson),
        createdAt: formatDate(record.createdAt),
        updatedAt: formatDate(record.updatedAt),
    }
}

/**
 * 校验站点 Logo 的真实图片格式，防止伪装扩展名和超大图片进入全站首屏。
 */
export async function validateSiteLogoFile(objectKey: string, data: Buffer): Promise<SiteLogoFormat> {
    if (data.length === 0) throw new Error("站点 Logo 文件为空")
    if (data.length > MAX_SITE_LOGO_FILE_BYTES) throw new Error("站点 Logo 不能超过 5 MiB")

    let detected: SiteLogoFormat
    try {
        const metadata = await sharp(data, { limitInputPixels: 4096 * 4096 }).metadata()
        if (!metadata.width || !metadata.height) throw new Error("图片尺寸无效")
        if (metadata.format !== "png" && metadata.format !== "jpeg" && metadata.format !== "webp") {
            throw new Error("仅支持 PNG、JPEG、WebP 图片")
        }
        detected = metadata.format
    } catch (error) {
        throw new Error(error instanceof Error && error.message === "仅支持 PNG、JPEG、WebP 图片"
            ? error.message
            : "站点 Logo 文件无法解析")
    }

    const extension = objectKey.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
    const extensionFormat = extension === "jpg" || extension === "jpeg" ? "jpeg" : extension
    if (extensionFormat !== detected) {
        throw new Error("站点 Logo 扩展名与实际文件格式不匹配")
    }
    return detected
}

export function validateFontFile(objectKey: string, data: Buffer): FontFormat {
    if (data.length === 0) throw new Error("字体文件为空")
    if (data.length > MAX_FONT_FILE_BYTES) throw new Error("字体文件不能超过 30 MiB")

    const extension = objectKey.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
    const signature = data.subarray(0, 4).toString("latin1")
    const detected = signature === "OTTO"
        ? "otf"
        : signature === "wOFF"
          ? "woff"
          : signature === "wOF2"
            ? "woff2"
            : data.length >= 4 && data.readUInt32BE(0) === 0x00010000
              ? "ttf"
              : null

    if (!detected || extension !== detected) {
        throw new Error("字体扩展名与实际文件格式不匹配")
    }
    return detected
}

export function validateSiteAppearanceInput(raw: unknown): RetypesetAppearanceConfig {
    const value = isRecord(raw) ? raw : {}
    const publicQaEnabled =
        typeof value.publicQaEnabled === "boolean"
            ? value.publicQaEnabled
            : DEFAULT_RETYPESET_APPEARANCE.publicQaEnabled

    return { publicQaEnabled }
}

function formatDate(value: Date | string | null | undefined) {
    if (!value) return null
    const date = value instanceof Date ? value : new Date(value)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** 从数据库 JSON 中恢复单个站点 Logo；旧数据或损坏配置自动回退默认图标。 */
function parseSiteLogoAsset(raw: string | null | undefined): SiteLogoAsset | null {
    if (!raw?.trim()) return null
    try {
        const parsed = siteLogoAssetSchema.safeParse(JSON.parse(raw))
        return parsed.success ? parsed.data : null
    } catch {
        return null
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value))
}
