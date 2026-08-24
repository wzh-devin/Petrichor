import { and, asc, eq } from "drizzle-orm"
import { z } from "zod"
import { callVisionCompletion } from "@/server/ai/vision"
import { knowledgeBaseImportJobPages } from "@/server/db/schema"
import { badRequest } from "@/server/http/response"
import { mergePageMarkdown } from "@/server/kb/import-logic"
import { extractPdfPages } from "@/server/kb/pdf-extract"
import type { ImportSourceAdapter } from "@/server/kb/import-source-adapter"
import { fetchS3ObjectBytes, toImageDataUrl } from "@/server/upload/s3-fetch"

const pdfInputSchema = z.object({
    entries: z.array(z.object({
        fileName: z.string().trim().min(1).max(500),
        title: z.string().trim().min(1).max(200),
        sourceKey: z.string().trim().min(1),
        relativePath: z.string().trim().max(2000).nullable().optional(),
        modelConfigId: z.coerce.number().int().positive().nullable().optional(),
        ocrPages: z.array(z.object({
            pageNo: z.coerce.number().int().positive(),
            imageKey: z.string().trim().min(1),
        })).max(2000).default([]),
    })).min(1).max(50),
})

function assertOwnedObjectKey(objectKey: string, userId: number) {
    if (!objectKey.startsWith(`uploads/${userId}/`)) {
        throw badRequest("上传文件不属于当前用户")
    }
}

export async function inspectPdfImport(sourceKey: string, userId: number) {
    assertOwnedObjectKey(sourceKey, userId)
    return extractPdfPages((await fetchS3ObjectBytes(sourceKey)).data)
}

/** PDF 策略：准备阶段完成逐页检查；队列阶段只负责 OCR 与正文合并。 */
export const pdfImportAdapter: ImportSourceAdapter = {
    sourceType: "pdf",

    async prepare(rawInput, context) {
        const input = pdfInputSchema.parse(rawInput)
        const items = []
        for (const entry of input.entries) {
            assertOwnedObjectKey(entry.sourceKey, context.userId)
            if (!/\.pdf$/i.test(entry.fileName)) throw badRequest(`仅支持 PDF 文件：${entry.fileName}`)
            const extracted = await inspectPdfImport(entry.sourceKey, context.userId)
            const imageByPage = new Map(entry.ocrPages.map((page) => {
                assertOwnedObjectKey(page.imageKey, context.userId)
                return [page.pageNo, page.imageKey]
            }))
            const pages = extracted.pages.map((page) => ({
                pageNo: page.pageNo,
                imageKey: page.needsOcr ? imageByPage.get(page.pageNo) ?? null : null,
                extractedBy: page.needsOcr ? "vision" as const : "pdf" as const,
                status: page.needsOcr ? "pending" as const : "done" as const,
                markdown: page.needsOcr ? null : page.markdown,
            }))
            const missing = pages.filter((page) => page.extractedBy === "vision" && !page.imageKey)
            if (missing.length > 0) {
                throw badRequest(`PDF ${entry.fileName} 缺少 ${missing.length} 张扫描页图片，请重新准备后提交`)
            }
            if (missing.length === 0 && extracted.ocrPageNos.length > 0 && !entry.modelConfigId) {
                throw badRequest(`PDF ${entry.fileName} 含扫描页，请选择多模态模型`)
            }
            items.push({
                sourceType: "pdf" as const,
                fileName: entry.fileName,
                title: entry.title,
                sourceKey: entry.sourceKey,
                relativePath: entry.relativePath ?? entry.fileName,
                modelConfigId: entry.modelConfigId ?? null,
                totalPages: pages.length,
                processedPages: pages.filter((page) => page.status === "done").length,
                pages,
            })
        }
        return {
            sourceName: items.length === 1 ? items[0].fileName : `${items.length} 个 PDF 文件`,
            items,
        }
    },

    async *discover() {
        // 本地 PDF 在创建批次时已经展开为项目。
    },

    async extract(item, context) {
        const pages = await context.db
            .select()
            .from(knowledgeBaseImportJobPages)
            .where(eq(knowledgeBaseImportJobPages.jobId, item.id))
            .orderBy(asc(knowledgeBaseImportJobPages.pageNo))

        for (const page of pages.filter((entry) => entry.status !== "done")) {
            if (!page.imageKey) throw new Error(`第 ${page.pageNo} 页缺少扫描图片`)
            try {
                const image = await fetchS3ObjectBytes(page.imageKey)
                const result = await callVisionCompletion({
                    userId: context.userId,
                    modelRefId: item.modelConfigId,
                    imageDataUrl: toImageDataUrl(image),
                })
                await context.db.update(knowledgeBaseImportJobPages).set({
                    status: "done",
                    markdown: result.markdown,
                    error: null,
                    updatedAt: new Date(),
                }).where(and(
                    eq(knowledgeBaseImportJobPages.jobId, item.id),
                    eq(knowledgeBaseImportJobPages.pageNo, page.pageNo),
                ))
                page.status = "done"
                page.markdown = result.markdown
            } catch (error) {
                const message = error instanceof Error ? error.message : "扫描页识别失败"
                await context.db.update(knowledgeBaseImportJobPages).set({
                    status: "failed",
                    error: message.slice(0, 500),
                    updatedAt: new Date(),
                }).where(eq(knowledgeBaseImportJobPages.id, page.id))
                throw new Error(`第 ${page.pageNo} 页识别失败：${message}`)
            }
        }

        const contentMd = mergePageMarkdown(pages)
        if (!contentMd) throw new Error("PDF 没有可导入的正文内容")
        return { title: item.title, contentMd, relativePath: item.relativePath, warnings: [] }
    },
}
