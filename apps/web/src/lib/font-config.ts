export const MAX_FONT_FILE_BYTES = 30 * 1024 * 1024
export const MAX_FONT_ASSETS = 20

export type FontFormat = "ttf" | "otf" | "woff" | "woff2"
export type InterfaceFontSelection =
  | "system-sans"
  | "system-serif"
  | "maple-mono"
  | `uploaded:${string}`
export type ContentFontSelection = "follow-interface" | InterfaceFontSelection
export type MonospaceFontSelection = "system-mono" | "maple-mono" | `uploaded:${string}`

export interface FontAsset {
  id: string
  name: string
  objectKey: string
  format: FontFormat
  size: number
  createdAt: string
}

export interface SiteFontConfig {
  assets: FontAsset[]
  interfaceFont: InterfaceFontSelection
  contentFont: ContentFontSelection
  monospaceFont: MonospaceFontSelection
}

export const DEFAULT_SITE_FONT_CONFIG: SiteFontConfig = {
  assets: [],
  interfaceFont: "system-sans",
  contentFont: "follow-interface",
  monospaceFont: "maple-mono",
}

const BUILT_IN_INTERFACE_FONTS = new Set(["system-sans", "system-serif", "maple-mono"])
const BUILT_IN_MONOSPACE_FONTS = new Set(["system-mono", "maple-mono"])

export function parseSiteFontConfig(raw: string | null | undefined): SiteFontConfig {
  if (!raw?.trim()) return { ...DEFAULT_SITE_FONT_CONFIG, assets: [] }

  try {
    const value: unknown = JSON.parse(raw)
    if (!isRecord(value)) return { ...DEFAULT_SITE_FONT_CONFIG, assets: [] }

    const assets = Array.isArray(value.assets)
      ? value.assets.filter(isFontAsset).slice(0, MAX_FONT_ASSETS)
      : []
    const assetIds = new Set(assets.map((asset) => asset.id))

    return {
      assets,
      interfaceFont: isInterfaceFontSelection(value.interfaceFont, assetIds)
        ? value.interfaceFont
        : DEFAULT_SITE_FONT_CONFIG.interfaceFont,
      contentFont: value.contentFont === "follow-interface" || isInterfaceFontSelection(value.contentFont, assetIds)
        ? value.contentFont
        : DEFAULT_SITE_FONT_CONFIG.contentFont,
      monospaceFont: isMonospaceFontSelection(value.monospaceFont, assetIds)
        ? value.monospaceFont
        : DEFAULT_SITE_FONT_CONFIG.monospaceFont,
    }
  } catch {
    return { ...DEFAULT_SITE_FONT_CONFIG, assets: [] }
  }
}

export function validateFontSelections(
  raw: unknown,
  current: SiteFontConfig,
): Pick<SiteFontConfig, "interfaceFont" | "contentFont" | "monospaceFont"> {
  if (!isRecord(raw)) throw new Error("字体配置不能为空")
  const assetIds = new Set(current.assets.map((asset) => asset.id))

  if (!isInterfaceFontSelection(raw.interfaceFont, assetIds)) throw new Error("界面字体无效")
  if (raw.contentFont !== "follow-interface" && !isInterfaceFontSelection(raw.contentFont, assetIds)) {
    throw new Error("正文字体无效")
  }
  if (!isMonospaceFontSelection(raw.monospaceFont, assetIds)) throw new Error("等宽字体无效")

  return {
    interfaceFont: raw.interfaceFont,
    contentFont: raw.contentFont,
    monospaceFont: raw.monospaceFont,
  }
}

export function uploadedFontId(selection: string) {
  return selection.startsWith("uploaded:") ? selection.slice("uploaded:".length) : null
}

function isInterfaceFontSelection(value: unknown, assetIds: Set<string>): value is InterfaceFontSelection {
  return typeof value === "string" && (
    BUILT_IN_INTERFACE_FONTS.has(value) || Boolean(uploadedFontId(value) && assetIds.has(uploadedFontId(value)!))
  )
}

function isMonospaceFontSelection(value: unknown, assetIds: Set<string>): value is MonospaceFontSelection {
  return typeof value === "string" && (
    BUILT_IN_MONOSPACE_FONTS.has(value) || Boolean(uploadedFontId(value) && assetIds.has(uploadedFontId(value)!))
  )
}

function isFontAsset(value: unknown): value is FontAsset {
  if (!isRecord(value)) return false
  return typeof value.id === "string" && /^[0-9a-f-]{36}$/i.test(value.id)
    && typeof value.name === "string" && value.name.length > 0 && value.name.length <= 80
    && typeof value.objectKey === "string" && value.objectKey.startsWith("uploads/")
    && ["ttf", "otf", "woff", "woff2"].includes(String(value.format))
    && typeof value.size === "number" && value.size > 0 && value.size <= MAX_FONT_FILE_BYTES
    && typeof value.createdAt === "string"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}
