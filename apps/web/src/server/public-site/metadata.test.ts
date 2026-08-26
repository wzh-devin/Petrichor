import { describe, expect, it } from "vitest"
import {
    buildDashboardMetadata,
    buildRootMetadata,
    buildStaticPublicPageMetadata,
    resolvePublicRouteMetadata,
} from "./metadata"

describe("站点名称元数据", () => {
    it("生成自定义根标题模板与 Open Graph 站点名", () => {
        const metadata = buildRootMetadata("我的站点")

        expect(metadata.title).toEqual({
            default: "我的站点",
            template: "%s | 我的站点",
        })
        expect(metadata.openGraph).toMatchObject({
            title: "我的站点",
            siteName: "我的站点",
        })
    })

    it("为根页面使用自定义站点图标", () => {
        const metadata = buildRootMetadata("我的站点", {
            url: "https://cdn.example.com/logo.webp",
            type: "image/webp",
        })

        expect(metadata.icons).toEqual({
            icon: [{ url: "https://cdn.example.com/logo.webp", type: "image/webp" }],
        })
    })

    it("为首页元数据使用自定义站点描述", () => {
        const metadata = buildRootMetadata("我的站点", undefined, "  我的站点\n描述  ")

        expect(metadata.description).toBe("我的站点 描述")
        expect(metadata.openGraph).toMatchObject({ description: "我的站点 描述" })
        expect(metadata.twitter).toMatchObject({ description: "我的站点 描述" })
    })

    it("首页使用绝对站点名称，登录页交给根模板添加后缀", () => {
        expect(buildStaticPublicPageMetadata("/", "我的站点").title)
            .toEqual({ absolute: "我的站点" })
        expect(buildDashboardMetadata("/login", "我的站点").title).toBe("登录")
    })

    it("公开知识库路由使用文章标题而不是未找到标题", () => {
        const knowledgeBaseMetadata = resolvePublicRouteMetadata(["library", "2"], [], "我的站点")
        const folderMetadata = resolvePublicRouteMetadata(["library", "2", "4"], [], "我的站点")

        expect(knowledgeBaseMetadata.title).toBe("文章")
        expect(folderMetadata.title).toBe("文章")
        expect(knowledgeBaseMetadata.robots).toEqual({ index: true, follow: true })
        expect(resolvePublicRouteMetadata(["library", "invalid"], [], "我的站点").title)
            .toBe("页面未找到")
    })

    it("已删除的演示路由使用未找到元数据", () => {
        expect(resolvePublicRouteMetadata(["demo"], [], "我的站点").title)
            .toBe("页面未找到")
    })
})
