import type { ImgHTMLAttributes } from "react"

import { cn } from "@/lib/utils"
import { DEFAULT_SITE_LOGO_SRC } from "@/lib/site-branding"

type SiteLogoProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "width" | "height"> & {
  size?: number
}

/** 渲染全站共享 Logo，自定义资源不可用时回退内置图标。 */
export function SiteLogo({
  alt = "Petrichor",
  className,
  onError,
  size = 24,
  src,
  ...props
}: SiteLogoProps) {
  const configuredSrc = typeof document === "undefined"
    ? DEFAULT_SITE_LOGO_SRC
    : document.documentElement.dataset.siteLogoUrl || DEFAULT_SITE_LOGO_SRC

  return (
    <img
      src={src || configuredSrc}
      alt={alt}
      width={size}
      height={size}
      className={cn("shrink-0 rounded-full object-cover", className)}
      onError={(event) => {
        if (!event.currentTarget.src.endsWith(DEFAULT_SITE_LOGO_SRC)) {
          event.currentTarget.src = DEFAULT_SITE_LOGO_SRC
        }
        onError?.(event)
      }}
      {...props}
    />
  )
}
