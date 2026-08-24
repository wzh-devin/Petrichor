import path from "node:path"
import { z } from "zod"
import { parseArticleFrontmatter } from "@/lib/article-metadata"
import { badRequest } from "@/server/http/response"
import { fetchS3ObjectBytes } from "@/server/upload/s3-fetch"
import type {
    ImportSourceAdapter,
    ImportedDocument,
} from "@/server/kb/import-source-adapter"

const MAX_MARKDOWN_BYTES = 2 * 1024 * 1024

const markdownCreateSchema = z.object({
    rootName: z.string().trim().max(200).optional(),
    entries: z.array(z.object({
        fileName: z.string().trim().min(1).max(500),
        sourceKey: z.string().trim().min(1),
        relativePath: z.string().trim().min(1).max(2000),
    })).min(1).max(500),
})

export function normalizeImportRelativePath(rawPath: string): string {
    const normalized = rawPath.replaceAll("\\", "/").replace(/^\/+/, "")
    const segments = normalized.split("/").filter(Boolean)
    if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
        throw badRequest("导入文件包含非法相对路径")
    }
    return segments.join("/")
}

export function resolveImportedMarkdownTitle(markdown: string, fileName: string, metadataTitle?: string): string {
    const fileTitle = path.basename(fileName).replace(/\.(md|markdown)$/i, "").trim()
    const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim()
    return (metadataTitle?.trim() || fileTitle || heading || "未命名文档").slice(0, 200)
}

function assertOwnedObjectKey(objectKey: string, userId: number) {
    if (!objectKey.startsWith(`uploads/${userId}/`)) {
        throw badRequest("上传文件不属于当前用户")
    }
}

/** 本地 Markdown 文件或目录导入策略。 */
export const markdownImportAdapter: ImportSourceAdapter = {
    sourceType: "markdown",

    async prepare(rawInput, context) {
        const input = markdownCreateSchema.parse(rawInput)
        const items = input.entries.map((entry) => {
            assertOwnedObjectKey(entry.sourceKey, context.userId)
            const relativePath = normalizeImportRelativePath(entry.relativePath)
            if (!/\.(md|markdown)$/i.test(entry.fileName)) {
                throw badRequest(`仅支持 Markdown 文件：${entry.fileName}`)
            }
            return {
                sourceType: "markdown" as const,
                fileName: entry.fileName,
                title: path.basename(entry.fileName).replace(/\.(md|markdown)$/i, "").slice(0, 200),
                sourceKey: entry.sourceKey,
                relativePath,
            }
        })
        return {
            sourceName: input.rootName || (items.length === 1 ? items[0].fileName : `${items.length} 个 Markdown 文件`),
            items,
        }
    },

    async *discover() {
        // 本地文件在创建批次时已经展开为项目。
    },

    async extract(item): Promise<ImportedDocument> {
        if (!item.sourceKey) {
            throw new Error("Markdown 源文件不存在")
        }
        const source = await fetchS3ObjectBytes(item.sourceKey)
        if (source.data.byteLength === 0) {
            throw new Error("Markdown 文件为空")
        }
        if (source.data.byteLength > MAX_MARKDOWN_BYTES) {
            throw new Error("Markdown 文件不能超过 2 MB")
        }
        const rawMarkdown = source.data.toString("utf8").trim()
        if (!rawMarkdown) {
            throw new Error("Markdown 文件没有可导入的正文内容")
        }
        const parsed = parseArticleFrontmatter(rawMarkdown)
        const contentMd = parsed.contentMd.trim()
        return {
            title: resolveImportedMarkdownTitle(
                contentMd,
                item.fileName,
                typeof parsed.metadata.title === "string" ? parsed.metadata.title : undefined,
            ),
            contentMd,
            metadata: parsed.metadata,
            tags: Array.isArray(parsed.metadata.tags) ? parsed.metadata.tags : [],
            relativePath: item.relativePath,
            warnings: [],
        }
    },
}
