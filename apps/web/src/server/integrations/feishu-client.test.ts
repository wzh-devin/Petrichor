import { describe, expect, it } from "vitest"
import { parseFeishuImportUrl } from "./feishu-client"

describe("飞书导入链接", () => {
    it("识别文档、知识库和云空间目录", () => {
        expect(parseFeishuImportUrl("https://example.feishu.cn/docx/doc123")).toEqual({ kind: "docx", token: "doc123" })
        expect(parseFeishuImportUrl("https://example.feishu.cn/wiki/wiki123")).toEqual({ kind: "wiki", token: "wiki123" })
        expect(parseFeishuImportUrl("https://example.larksuite.com/drive/folder/folder123")).toEqual({ kind: "folder", token: "folder123" })
    })

    it("拒绝非官方域名，避免服务端任意 URL 请求", () => {
        expect(() => parseFeishuImportUrl("https://feishu.cn.example.com/wiki/evil")).toThrow()
        expect(() => parseFeishuImportUrl("http://example.feishu.cn/wiki/unsafe")).toThrow()
    })
})
