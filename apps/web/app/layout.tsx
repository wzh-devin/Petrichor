import type { Metadata } from "next"
import type { CSSProperties } from "react"
import { FIXED_RETYPESET_THEME_ID } from "@/lib/retypeset-themes"
import { DEFAULT_SITE_LOGO_SRC, type SiteLogoAsset } from "@/lib/site-branding"
import { resolveAppearanceAssetUrl } from "@/server/appearance/asset-url"
import { buildSiteFontPresentation } from "@/server/appearance/font-style"
import { loadPublicSiteAppearanceForFirstPaint } from "@/server/appearance/public-loader"
import { buildRootMetadata } from "@/server/public-site/metadata"
import { getPublicBaseUrl } from "@/server/public-site/site-url"
import "./globals.css"

const publicBaseUrl = getPublicBaseUrl()

export const dynamic = "force-dynamic"

export async function generateMetadata(): Promise<Metadata> {
    const appearance = await loadPublicSiteAppearanceForFirstPaint()
    return buildRootMetadata(appearance.siteName, resolveSiteLogo(appearance.siteLogo), appearance.siteDescription)
}

export default async function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode
}>) {
    const appearance = await loadPublicSiteAppearanceForFirstPaint()
    const fontPresentation = buildSiteFontPresentation(appearance.fontConfig, publicBaseUrl)
    const siteLogo = resolveSiteLogo(appearance.siteLogo)

    return (
        <html
            lang="zh-CN"
            suppressHydrationWarning
            data-retypeset-theme={FIXED_RETYPESET_THEME_ID}
            data-site-name={appearance.siteName}
            data-site-description={appearance.siteDescription}
            data-sidebar-title={appearance.sidebarTitle}
            data-site-logo-url={siteLogo.url}
            style={fontPresentation.variables as CSSProperties}
        >
            <head>
                {fontPresentation.css ? (
                    <style dangerouslySetInnerHTML={{ __html: fontPresentation.css }} />
                ) : null}
                {/* 首屏防闪：前台公开页恒为暗色，但 .dark 由 ThemeProvider 在客户端才加，
                    SSR 首帧会先按浅色令牌绘制导致顶栏白闪。这段脚本在样式生效前就定好主题。
                    判定规则与 src/lib/public-theme-routes.ts 的 isPublicSitePathByExclusion 等价，
                    两者一致性由 public-theme-routes.test.ts 钉住。 */}
                <script
                    dangerouslySetInnerHTML={{
                        __html: `(function(){try{var p=location.pathname.replace(/(.)\\/$/,"$1")||"/";var deny=["/dashboard","/login","/auth","/demo"];var isPublic=!deny.some(function(d){return p===d||p.indexOf(d+"/")===0});var t=isPublic?"dark":(localStorage.getItem("ui-theme")||"system");if(t==="system"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.classList.add(t)}catch(e){}})()`,
                    }}
                />
            </head>
            <body>
                {children}
            </body>
        </html>
    )
}

/** 把持久化 Logo 资源转换为首屏和元数据可直接使用的地址。 */
function resolveSiteLogo(siteLogo: SiteLogoAsset | null) {
    if (!siteLogo) return { url: DEFAULT_SITE_LOGO_SRC, type: "image/jpeg" }
    const url = resolveAppearanceAssetUrl(siteLogo.objectKey, publicBaseUrl)
    return {
        url: url || DEFAULT_SITE_LOGO_SRC,
        type: url ? `image/${siteLogo.format}` : "image/jpeg",
    }
}
