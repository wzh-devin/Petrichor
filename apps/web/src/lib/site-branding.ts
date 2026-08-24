export const DEFAULT_SITE_NAME = "Petrichor"
export const DEFAULT_SITE_DESCRIPTION = "Knowledge, Articles & Inspiration"
export const DEFAULT_SIDEBAR_TITLE = "Petrichor"
export const DEFAULT_SITE_LOGO_SRC = "/sidebar-logo.jpg"
export const SITE_NAME_MAX_LENGTH = 60
export const SITE_DESCRIPTION_MAX_LENGTH = 160
export const SIDEBAR_TITLE_MAX_LENGTH = 40
export const MAX_SITE_LOGO_FILE_BYTES = 5 * 1024 * 1024

export type SiteLogoFormat = "png" | "jpeg" | "webp"

export interface SiteLogoAsset {
  objectKey: string
  format: SiteLogoFormat
  size: number
  updatedAt: string
}

export interface SiteBrandingConfig {
  siteName: string
  siteDescription: string
  sidebarTitle: string
  siteLogo: SiteLogoAsset | null
}
