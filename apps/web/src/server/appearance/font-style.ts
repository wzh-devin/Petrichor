import type { SiteFontConfig } from "@/lib/font-config"
import { resolveAppearanceAssetUrl } from "@/server/appearance/asset-url"

const FONT_FORMAT: Record<string, string> = {
    ttf: "truetype",
    otf: "opentype",
    woff: "woff",
    woff2: "woff2",
}

export function buildSiteFontPresentation(fontConfig: SiteFontConfig, baseUrl: string) {
    const aliases = new Map<string, string>()
    const fontFaces = fontConfig.assets.map((asset) => {
        const url = resolveAppearanceAssetUrl(asset.objectKey, baseUrl)
        if (!url) return ""
        const alias = `PetrichorFont-${asset.id}`
        aliases.set(asset.id, alias)
        return `@font-face{font-family:"${alias}";src:url(${JSON.stringify(url)}) format("${FONT_FORMAT[asset.format]}");font-display:swap;font-style:normal;font-weight:normal;}`
    }).join("")

    const resolveInterface = (selection: SiteFontConfig["interfaceFont"]) => {
        if (selection === "system-serif") return "var(--font-system-serif)"
        if (selection === "maple-mono") return "var(--font-maple)"
        if (selection === "system-sans") return "var(--font-system-sans)"
        return uploadedStack(selection, aliases, "var(--font-system-sans)")
    }
    const interfaceFont = resolveInterface(fontConfig.interfaceFont)
    const contentFont = fontConfig.contentFont === "follow-interface"
        ? interfaceFont
        : resolveInterface(fontConfig.contentFont)
    const monospaceFont = fontConfig.monospaceFont === "system-mono"
        ? "var(--font-system-mono)"
        : fontConfig.monospaceFont === "maple-mono"
          ? "var(--font-maple-mono)"
          : uploadedStack(fontConfig.monospaceFont, aliases, "var(--font-system-mono)")

    return {
        css: fontFaces,
        variables: {
            "--font-interface": interfaceFont,
            "--font-content": contentFont,
            "--font-code": monospaceFont,
        },
    }
}

function uploadedStack(selection: string, aliases: Map<string, string>, fallback: string) {
    const alias = aliases.get(selection.slice("uploaded:".length))
    return alias ? `"${alias}", ${fallback}` : fallback
}
