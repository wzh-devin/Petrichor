import { describe, expect, it } from "vitest"
import sharp from "sharp"
import {
    buildSiteAppearanceResponse,
    siteBrandingSchema,
    validateFontFile,
    validateSiteLogoFile,
    validateSiteAppearanceInput,
} from "./logic"

describe("站点外观配置：publicQaEnabled", () => {
    it("校验通过时透传 publicQaEnabled=false", () => {
        const result = validateSiteAppearanceInput({ publicQaEnabled: false })
        expect(result.publicQaEnabled).toBe(false)
    })

    it("缺省 publicQaEnabled 时回退默认 true", () => {
        const result = validateSiteAppearanceInput({})
        expect(result.publicQaEnabled).toBe(true)
    })

    it("非布尔 publicQaEnabled 时回退默认 true", () => {
        const result = validateSiteAppearanceInput({ publicQaEnabled: "yes" })
        expect(result.publicQaEnabled).toBe(true)
    })

    it("无记录时响应携带默认 publicQaEnabled=true", () => {
        const response = buildSiteAppearanceResponse(null)
        expect(response.publicQaEnabled).toBe(true)
        expect(response.siteName).toBe("Petrichor")
        expect(response.siteDescription).toBe("Knowledge, Articles & Inspiration")
        expect(response.sidebarTitle).toBe("Petrichor")
    })

    it("读取记录时反映存储的 publicQaEnabled", () => {
        const response = buildSiteAppearanceResponse({
            id: 1,
            publicQaEnabled: false,
            siteName: "我的站点",
            siteDescription: "我的站点描述",
            sidebarTitle: "我的工作台",
            siteLogoJson: JSON.stringify({
                objectKey: "uploads/1/logo.webp",
                format: "webp",
                size: 1024,
                updatedAt: "2026-06-10T00:00:00.000Z",
            }),
            fontConfigJson: null,
            createdAt: new Date("2026-06-10T00:00:00Z"),
            updatedAt: new Date("2026-06-10T00:00:00Z"),
        })
        expect(response.publicQaEnabled).toBe(false)
        expect(response.siteName).toBe("我的站点")
        expect(response.siteDescription).toBe("我的站点描述")
        expect(response.sidebarTitle).toBe("我的工作台")
        expect(response.siteLogo).toMatchObject({
            objectKey: "uploads/1/logo.webp",
            format: "webp",
        })
    })

    it("校验并清理站点标识", () => {
        expect(siteBrandingSchema.parse({
            siteName: "  我的站点  ",
            siteDescription: "  我的描述  ",
            sidebarTitle: "  工作台  ",
        })).toEqual({ siteName: "我的站点", siteDescription: "我的描述", sidebarTitle: "工作台" })
        expect(() => siteBrandingSchema.parse({ siteName: " ", siteDescription: "描述", sidebarTitle: "工作台" }))
            .toThrow("站点名称不能为空")
        expect(() => siteBrandingSchema.parse({ siteName: "站点", siteDescription: " ", sidebarTitle: "工作台" }))
            .toThrow("站点描述不能为空")
        expect(() => siteBrandingSchema.parse({ siteName: "站点", siteDescription: "描".repeat(161), sidebarTitle: "工作台" }))
            .toThrow("站点描述不能超过 160 个字符")
        expect(() => siteBrandingSchema.parse({ siteName: "站点", siteDescription: "描述", sidebarTitle: "侧".repeat(41) }))
            .toThrow("侧栏标题不能超过 40 个字符")
    })

    it("识别真实字体文件头并拒绝伪装扩展名", () => {
        expect(validateFontFile("uploads/1/font.ttf", Buffer.from([0, 1, 0, 0, 1]))).toBe("ttf")
        expect(validateFontFile("uploads/1/font.woff2", Buffer.from("wOF2font"))).toBe("woff2")
        expect(() => validateFontFile("uploads/1/font.ttf", Buffer.from("wOF2font")))
            .toThrow("扩展名与实际文件格式不匹配")
    })

    it("识别真实站点 Logo 并拒绝伪装扩展名", async () => {
        const png = await sharp({
            create: { width: 16, height: 16, channels: 4, background: "#ffffff" },
        }).png().toBuffer()

        await expect(validateSiteLogoFile("uploads/1/logo.png", png)).resolves.toBe("png")
        await expect(validateSiteLogoFile("uploads/1/logo.webp", png))
            .rejects.toThrow("扩展名与实际文件格式不匹配")
    })
})
