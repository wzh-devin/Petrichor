import { describe, expect, it } from "vitest"
import { DEFAULT_SITE_FONT_CONFIG } from "@/lib/font-config"
import { buildSiteFontPresentation } from "./font-style"

describe("站点字体首屏样式", () => {
    it("为内置霞鹜文楷生成 WOFF2 声明和衬线回退", () => {
        const presentation = buildSiteFontPresentation({
            ...DEFAULT_SITE_FONT_CONFIG,
            interfaceFont: "lxgw-wenkai",
            contentFont: "lxgw-wenkai",
        }, "https://example.com")

        expect(presentation.css).toContain("LXGWWenKai-Regular.gb2312.63282bb9.woff2")
        expect(presentation.css).toContain("font-display:swap")
        expect(presentation.variables["--font-interface"]).toBe('"Petrichor LXGW WenKai", var(--font-system-serif)')
        expect(presentation.variables["--font-content"]).toBe('"Petrichor LXGW WenKai", var(--font-system-serif)')
    })
})
