import { eq } from "drizzle-orm"
import { getDb } from "@/server/db/client"
import { siteAppearance } from "@/server/db/schema"
import { cachePublicContent } from "@/server/public-content-cache"
import {
    SITE_APPEARANCE_ID,
    buildSiteAppearanceResponse,
} from "./logic"

export const loadCachedPublicSiteAppearance = cachePublicContent(
    "siteAppearance",
    loadPublicSiteAppearanceResponse,
)

export async function loadPublicSiteAppearanceResponse() {
    const record = await loadSiteAppearanceOrNull()
    return buildSiteAppearanceResponse(record)
}

export async function loadPublicSiteAppearanceForFirstPaint() {
    try {
        return await loadCachedPublicSiteAppearance()
    } catch {
        return buildSiteAppearanceResponse(null)
    }
}

export async function loadSiteAppearanceOrNull() {
    try {
        const [record] = await getDb()
            .select()
            .from(siteAppearance)
            .where(eq(siteAppearance.id, SITE_APPEARANCE_ID))
            .limit(1)
        return record ?? null
    } catch (error) {
        if (isMissingSiteAppearanceTableError(error)) {
            return null
        }
        throw error
    }
}

function isMissingSiteAppearanceTableError(error: unknown) {
    const parts = collectErrorParts(error).join("\n").toLowerCase()
    return (
        parts.includes("petrichor_site_appearance") ||
        parts.includes("font_config_json") ||
        parts.includes("site_name") ||
        parts.includes("site_description") ||
        parts.includes("sidebar_title") ||
        parts.includes("site_logo_json")
    ) &&
        (parts.includes("42p01") || parts.includes("42703") || parts.includes("does not exist") || parts.includes("relation"))
}

function collectErrorParts(error: unknown): string[] {
    const parts: string[] = []
    let current: unknown = error
    const visited = new Set<unknown>()

    while (current && typeof current === "object" && !visited.has(current)) {
        visited.add(current)
        const record = current as Record<string, unknown>
        if (typeof record.message === "string") {
            parts.push(record.message)
        }
        if (typeof record.code === "string") {
            parts.push(record.code)
        }
        current = record.cause
    }

    return parts
}
