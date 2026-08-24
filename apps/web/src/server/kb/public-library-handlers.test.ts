import type { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const dbMocks = vi.hoisted(() => ({ getDb: vi.fn() }))
const cacheMocks = vi.hoisted(() => ({
    cachePublicLibraryChildren: vi.fn((loader: (input: unknown) => Promise<unknown>) => (
        _key: string,
        input: unknown,
    ) => loader(input)),
}))

vi.mock("@/server/db/client", () => dbMocks)
vi.mock("@/server/public-content-cache", () => cacheMocks)

import { publicLibraryChildren } from "./public-library-handlers"

function request(url: string) {
    return { nextUrl: new URL(url) } as unknown as NextRequest
}

describe("publicLibraryChildren", () => {
    beforeEach(() => vi.clearAllMocks())

    it("根目录只返回已筛选后的知识库并使用 pageSize + 1 判断下一页", async () => {
        dbMocks.getDb.mockReturnValue({
            execute: vi.fn().mockResolvedValue([
                { id: 1, name: "公开库", description: "说明" },
                { id: 2, name: "下一页", description: null },
            ]),
        })

        const response = await publicLibraryChildren(request("http://localhost/api/public/library/children?pageSize=1"))

        await expect(response.json()).resolves.toMatchObject({
            current: { type: "ROOT" },
            items: [{ type: "KNOWLEDGE_BASE", id: "1", name: "公开库" }],
            hasMore: true,
        })
    })

    it("目录层返回面包屑、直属文件夹与直属文章", async () => {
        const execute = vi.fn()
            .mockResolvedValueOnce([{ id: 2, name: "知识库" }])
            .mockResolvedValueOnce([{ id: 3, name: "上级" }, { id: 4, name: "当前目录" }])
            .mockResolvedValueOnce([
                { kind: "FOLDER", node_id: 5, name: "子目录" },
                {
                    kind: "ARTICLE",
                    node_id: 6,
                    article_id: 9,
                    share_code: "share-code",
                    name: "清晰标题",
                    content_md: "正文内容",
                    public_excerpt: "文章简介",
                    reading_minutes: 2,
                    updated_at: new Date("2026-08-23T00:00:00.000Z"),
                    enabled: true,
                    revoked_at: null,
                    expires_at: null,
                    password_hash: null,
                    is_repost: false,
                    internal_url: null,
                    pin_order: null,
                },
            ])
        dbMocks.getDb.mockReturnValue({ execute })

        const response = await publicLibraryChildren(request(
            "http://localhost/api/public/library/children?knowledgeBaseId=2&parentId=4",
        ))

        await expect(response.json()).resolves.toMatchObject({
            current: { type: "FOLDER", id: "4", name: "当前目录" },
            breadcrumbs: [
                { type: "KNOWLEDGE_BASE", id: "2" },
                { type: "FOLDER", id: "3" },
                { type: "FOLDER", id: "4" },
            ],
            items: [
                { type: "FOLDER", id: "5", name: "子目录" },
                { type: "ARTICLE", articleId: "9", title: "清晰标题", excerpt: "文章简介" },
            ],
        })
    })

    it("知识库层返回知识库描述，文件夹层不继承该描述", async () => {
        const knowledgeBaseExecute = vi.fn()
            .mockResolvedValueOnce([{ id: 2, name: "知识库", description: "知识库说明" }])
            .mockResolvedValueOnce([])
        dbMocks.getDb.mockReturnValue({ execute: knowledgeBaseExecute })

        const knowledgeBaseResponse = await publicLibraryChildren(request(
            "http://localhost/api/public/library/children?knowledgeBaseId=2",
        ))

        await expect(knowledgeBaseResponse.json()).resolves.toMatchObject({
            current: {
                type: "KNOWLEDGE_BASE",
                id: "2",
                name: "知识库",
                description: "知识库说明",
            },
        })

        const folderExecute = vi.fn()
            .mockResolvedValueOnce([{ id: 2, name: "知识库", description: "知识库说明" }])
            .mockResolvedValueOnce([{ id: 4, name: "当前目录" }])
            .mockResolvedValueOnce([])
        dbMocks.getDb.mockReturnValue({ execute: folderExecute })

        const folderResponse = await publicLibraryChildren(request(
            "http://localhost/api/public/library/children?knowledgeBaseId=2&parentId=4",
        ))
        const folderBody = await folderResponse.json()

        expect(folderBody.current).toEqual({ type: "FOLDER", id: "4", name: "当前目录" })
    })

    it("不可公开目录统一返回 404，过大的 pageSize 返回 400", async () => {
        const execute = vi.fn()
            .mockResolvedValueOnce([{ id: 2, name: "知识库" }])
            .mockResolvedValueOnce([])
        dbMocks.getDb.mockReturnValue({ execute })

        const hidden = await publicLibraryChildren(request(
            "http://localhost/api/public/library/children?knowledgeBaseId=2&parentId=99",
        ))
        const oversized = await publicLibraryChildren(request(
            "http://localhost/api/public/library/children?pageSize=51",
        ))

        expect(hidden.status).toBe(404)
        expect(oversized.status).toBe(400)
    })
})
