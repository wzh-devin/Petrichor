import { describe, expect, it } from "vitest"
import { normalizeImportRelativePath, resolveImportedMarkdownTitle } from "./markdown"

describe("Markdown 导入策略", () => {
    it("规范化目录路径并拒绝上级目录", () => {
        expect(normalizeImportRelativePath("docs\\guide\\intro.md")).toBe("docs/guide/intro.md")
        expect(() => normalizeImportRelativePath("../secret.md")).toThrow()
    })

    it("优先使用文件名，文件名无效时使用一级标题", () => {
        expect(resolveImportedMarkdownTitle("# 使用说明\n正文", "README.md")).toBe("README")
        expect(resolveImportedMarkdownTitle("正文", "guide.markdown")).toBe("guide")
        expect(resolveImportedMarkdownTitle("# 使用说明\n正文", ".md")).toBe("使用说明")
    })

    it("frontmatter 标题优先于来源文件名", () => {
        expect(resolveImportedMarkdownTitle("# 正文标题", "README.md", "元数据标题")).toBe("元数据标题")
    })
})
