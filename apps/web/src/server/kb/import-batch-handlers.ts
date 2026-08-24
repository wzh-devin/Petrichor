import { and, asc, count, desc, eq, inArray } from "drizzle-orm"
import { after, type NextRequest } from "next/server"
import { z } from "zod"
import { requireCurrentUser } from "@/server/auth/current-user"
import { getDb } from "@/server/db/client"
import {
    knowledgeBaseImportBatches,
    knowledgeBaseImportJobPages,
    knowledgeBaseImportJobs,
    knowledgeBaseNodes,
    knowledgeBases,
    type KnowledgeBaseImportBatchRecord,
    type KnowledgeBaseImportJobRecord,
} from "@/server/db/schema"
import { badRequest, notFound, ok, readJson, tableData, toErrorResponse, unauthorized } from "@/server/http/response"
import { resolvePagination } from "@/server/http/pagination"
import { inspectPdfImport } from "@/server/kb/import-adapters/pdf"
import { createImportBatch, drainImportQueue, scheduleImportBatch } from "@/server/kb/import-queue"
import { isImportSourceType } from "@/server/kb/import-source-adapter"

const idSchema = z.union([z.string(), z.number()]).transform((value, context) => {
    const raw = String(value).trim()
    if (!/^\d+$/.test(raw) || Number(raw) <= 0) {
        context.addIssue({ code: "custom", message: "ID 必须是正整数" })
        return z.NEVER
    }
    return Number(raw)
})
const nullableIdSchema = z.preprocess(
    (value) => value == null || String(value).trim() === "" ? null : value,
    idSchema.nullable(),
)
const createSchema = z.object({
    knowledgeBaseId: idSchema,
    parentId: nullableIdSchema.optional(),
    sourceType: z.string().refine(isImportSourceType, "不支持的导入来源"),
    input: z.unknown(),
})
const listSchema = z.object({
    knowledgeBaseId: nullableIdSchema.optional(),
    pageNum: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(100).optional(),
})
const detailSchema = z.object({
    batchId: idSchema,
    pageNum: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(100).optional(),
})
const itemSchema = z.object({ itemId: idSchema })
const idsSchema = z.object({ ids: z.array(idSchema).min(1).max(200) })

type User = Awaited<ReturnType<typeof requireCurrentUser>>

async function withUser(request: NextRequest, handler: (user: User) => Promise<Response>) {
    try {
        return await handler(await requireCurrentUser(request))
    } catch (error) {
        return toErrorResponse(error, request.nextUrl.pathname)
    }
}

function iso(value: Date | string) {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function toBatchResponse(batch: KnowledgeBaseImportBatchRecord, names?: { kb?: string | null; folder?: string | null }) {
    return {
        id: String(batch.id),
        knowledgeBaseId: String(batch.knowledgeBaseId),
        knowledgeBaseName: names?.kb ?? null,
        parentNodeId: batch.parentNodeId == null ? null : String(batch.parentNodeId),
        parentFolderName: names?.folder ?? null,
        sourceType: batch.sourceType,
        sourceName: batch.sourceName,
        status: batch.status,
        totalItems: batch.totalItems,
        completedItems: batch.completedItems,
        failedItems: batch.failedItems,
        skippedItems: batch.skippedItems,
        error: batch.error,
        createdAt: iso(batch.createdAt),
        updatedAt: iso(batch.updatedAt),
    }
}

function toItemResponse(item: KnowledgeBaseImportJobRecord) {
    return {
        id: String(item.id),
        batchId: item.batchId == null ? null : String(item.batchId),
        sourceType: item.sourceType,
        fileName: item.fileName,
        relativePath: item.relativePath,
        title: item.title,
        totalPages: item.totalPages,
        processedPages: item.processedPages,
        status: item.status,
        articleId: item.articleId == null ? null : String(item.articleId),
        attemptCount: item.attemptCount,
        error: item.error,
        createdAt: iso(item.createdAt),
        updatedAt: iso(item.updatedAt),
    }
}

async function ownedBatch(userId: number, batchId: number) {
    const [batch] = await getDb().select().from(knowledgeBaseImportBatches).where(and(
        eq(knowledgeBaseImportBatches.id, batchId),
        eq(knowledgeBaseImportBatches.userId, userId),
    )).limit(1)
    if (!batch) throw notFound("导入批次不存在")
    return batch
}

export async function createImportBatchHandler(request: NextRequest) {
    return withUser(request, async (user) => {
        const input = createSchema.parse(await readJson(request))
        const batch = await createImportBatch({
            userId: user.id,
            knowledgeBaseId: input.knowledgeBaseId,
            parentNodeId: input.parentId ?? null,
            sourceType: input.sourceType,
            sourceInput: input.input,
        })
        return ok({ batch: toBatchResponse(batch), queuedItems: batch.totalItems })
    })
}

export async function inspectPdfImportHandler(request: NextRequest) {
    return withUser(request, async (user) => {
        const input = z.object({ sourceKey: z.string().trim().min(1) }).parse(await readJson(request))
        const result = await inspectPdfImport(input.sourceKey, user.id)
        return ok({
            totalPages: result.pages.length,
            ocrPageNos: result.ocrPageNos,
            isComplex: result.isComplex,
        })
    })
}

export async function listImportBatches(request: NextRequest) {
    return withUser(request, async (user) => {
        const input = listSchema.parse(await readJson(request))
        after(async () => {
            try { await drainImportQueue() } catch (error) { console.error("[document-import] 队列恢复失败", error) }
        })
        const { limit, offset } = resolvePagination(input)
        const db = getDb()
        const where = and(
            eq(knowledgeBaseImportBatches.userId, user.id),
            input.knowledgeBaseId ? eq(knowledgeBaseImportBatches.knowledgeBaseId, input.knowledgeBaseId) : undefined,
        )
        const [rows, [{ value: total }]] = await Promise.all([
            db.select().from(knowledgeBaseImportBatches).where(where)
                .orderBy(desc(knowledgeBaseImportBatches.createdAt)).limit(limit).offset(offset),
            db.select({ value: count() }).from(knowledgeBaseImportBatches).where(where),
        ])
        const kbIds = [...new Set(rows.map((row) => row.knowledgeBaseId))]
        const folderIds = rows.flatMap((row) => row.parentNodeId == null ? [] : [row.parentNodeId])
        const [kbs, folders] = await Promise.all([
            kbIds.length ? db.select({ id: knowledgeBases.id, name: knowledgeBases.name }).from(knowledgeBases)
                .where(and(eq(knowledgeBases.userId, user.id), inArray(knowledgeBases.id, kbIds))) : [],
            folderIds.length ? db.select({ id: knowledgeBaseNodes.id, name: knowledgeBaseNodes.name }).from(knowledgeBaseNodes)
                .where(and(eq(knowledgeBaseNodes.userId, user.id), inArray(knowledgeBaseNodes.id, folderIds))) : [],
        ])
        const kbNames = new Map(kbs.map((row) => [row.id, row.name]))
        const folderNames = new Map(folders.map((row) => [row.id, row.name]))
        return tableData(rows.map((row) => toBatchResponse(row, {
            kb: kbNames.get(row.knowledgeBaseId),
            folder: row.parentNodeId == null ? null : folderNames.get(row.parentNodeId),
        })), total)
    })
}

export async function detailImportBatch(request: NextRequest) {
    return withUser(request, async (user) => {
        const input = detailSchema.parse(await readJson(request))
        const batch = await ownedBatch(user.id, input.batchId)
        const { limit, offset } = resolvePagination(input)
        const db = getDb()
        const where = eq(knowledgeBaseImportJobs.batchId, batch.id)
        const [items, [{ value: total }]] = await Promise.all([
            db.select().from(knowledgeBaseImportJobs).where(where)
                .orderBy(asc(knowledgeBaseImportJobs.id)).limit(limit).offset(offset),
            db.select({ value: count() }).from(knowledgeBaseImportJobs).where(where),
        ])
        return ok({
            batch: toBatchResponse(batch),
            items: { rows: items.map(toItemResponse), total },
        })
    })
}

export async function detailImportItem(request: NextRequest) {
    return withUser(request, async (user) => {
        const input = itemSchema.parse(await readJson(request))
        const db = getDb()
        const [item] = await db.select().from(knowledgeBaseImportJobs).where(and(
            eq(knowledgeBaseImportJobs.id, input.itemId),
            eq(knowledgeBaseImportJobs.userId, user.id),
        )).limit(1)
        if (!item) throw notFound("导入项目不存在")
        const pages = await db.select().from(knowledgeBaseImportJobPages)
            .where(eq(knowledgeBaseImportJobPages.jobId, item.id))
            .orderBy(asc(knowledgeBaseImportJobPages.pageNo))
        return ok({
            item: toItemResponse(item),
            pages: pages.map((page) => ({
                pageNo: page.pageNo,
                extractedBy: page.extractedBy,
                status: page.status,
                markdown: page.markdown,
                error: page.error,
            })),
        })
    })
}

export async function retryImportBatch(request: NextRequest) {
    return withUser(request, async (user) => {
        const input = z.object({ batchId: idSchema }).parse(await readJson(request))
        const batch = await ownedBatch(user.id, input.batchId)
        if (!['failed', 'partial'].includes(batch.status)) throw badRequest("当前批次没有可重试的失败项目")
        const db = getDb()
        const failed = await db.update(knowledgeBaseImportJobs).set({
            status: "pending", attemptCount: 0, nextRetryAt: null, error: null, lockedAt: null, updatedAt: new Date(),
        }).where(and(eq(knowledgeBaseImportJobs.batchId, batch.id), eq(knowledgeBaseImportJobs.status, "failed"))).returning({ id: knowledgeBaseImportJobs.id })
        await db.update(knowledgeBaseImportBatches).set({
            status: "pending", error: null, lockedAt: null, updatedAt: new Date(),
        }).where(eq(knowledgeBaseImportBatches.id, batch.id))
        scheduleImportBatch(batch.id)
        return ok({ retried: failed.length, status: "pending" })
    })
}

export async function cancelImportBatch(request: NextRequest) {
    return withUser(request, async (user) => {
        const input = z.object({ batchId: idSchema }).parse(await readJson(request))
        const batch = await ownedBatch(user.id, input.batchId)
        if (["completed", "canceled"].includes(batch.status)) return ok({ id: String(batch.id), status: batch.status })
        const db = getDb()
        await db.update(knowledgeBaseImportBatches).set({ status: "canceled", lockedAt: null, updatedAt: new Date() })
            .where(eq(knowledgeBaseImportBatches.id, batch.id))
        await db.update(knowledgeBaseImportJobs).set({ status: "canceled", lockedAt: null, updatedAt: new Date() })
            .where(and(eq(knowledgeBaseImportJobs.batchId, batch.id), inArray(knowledgeBaseImportJobs.status, ["pending", "processing"])))
        return ok({ id: String(batch.id), status: "canceled" })
    })
}

export async function deleteImportBatches(request: NextRequest) {
    return withUser(request, async (user) => {
        const input = idsSchema.parse(await readJson(request))
        const db = getDb()
        const batches = await db.select({ id: knowledgeBaseImportBatches.id }).from(knowledgeBaseImportBatches)
            .where(and(eq(knowledgeBaseImportBatches.userId, user.id), inArray(knowledgeBaseImportBatches.id, input.ids)))
        const batchIds = batches.map((batch) => batch.id)
        if (!batchIds.length) return ok({ deleted: [] })
        const jobs = await db.select({ id: knowledgeBaseImportJobs.id }).from(knowledgeBaseImportJobs)
            .where(inArray(knowledgeBaseImportJobs.batchId, batchIds))
        if (jobs.length) await db.delete(knowledgeBaseImportJobPages)
            .where(inArray(knowledgeBaseImportJobPages.jobId, jobs.map((job) => job.id)))
        await db.delete(knowledgeBaseImportJobs).where(inArray(knowledgeBaseImportJobs.batchId, batchIds))
        await db.delete(knowledgeBaseImportBatches).where(inArray(knowledgeBaseImportBatches.id, batchIds))
        return ok({ deleted: batchIds.map(String) })
    })
}

export async function drainImportQueueHandler(request: NextRequest) {
    try {
        const secret = process.env.CRON_SECRET?.trim()
        if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
            throw unauthorized("无权执行导入队列恢复")
        }
        return ok({ claimed: await drainImportQueue() })
    } catch (error) {
        return toErrorResponse(error, request.nextUrl.pathname)
    }
}
