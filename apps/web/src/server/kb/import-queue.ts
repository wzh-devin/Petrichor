import { and, asc, count, eq, inArray, isNull, lt, lte, or } from "drizzle-orm"
import { after } from "next/server"
import { getDb } from "@/server/db/client"
import {
    knowledgeBaseArticles,
    knowledgeBaseArticleTags,
    knowledgeBaseImportBatches,
    knowledgeBaseImportJobPages,
    knowledgeBaseImportJobs,
    knowledgeBaseNodes,
    knowledgeBases,
    type KnowledgeBaseImportBatchRecord,
    type KnowledgeBaseImportJobRecord,
} from "@/server/db/schema"
import { badRequest, notFound } from "@/server/http/response"
import { getImportSourceAdapter } from "@/server/kb/import-adapters"
import type { ImportItemDraft, ImportSourceType } from "@/server/kb/import-source-adapter"
import { buildPublicArticleMetadata } from "@/server/kb/share-logic"

type Db = ReturnType<typeof getDb>
const LEASE_MS = 10 * 60 * 1000

async function assertTarget(db: Db, userId: number, knowledgeBaseId: number, parentNodeId: number | null) {
    const [knowledgeBase] = await db.select().from(knowledgeBases).where(and(
        eq(knowledgeBases.id, knowledgeBaseId),
        eq(knowledgeBases.userId, userId),
    )).limit(1)
    if (!knowledgeBase) throw notFound("知识库不存在")
    if (parentNodeId == null) return
    const [parent] = await db.select().from(knowledgeBaseNodes).where(and(
        eq(knowledgeBaseNodes.id, parentNodeId),
        eq(knowledgeBaseNodes.userId, userId),
        eq(knowledgeBaseNodes.knowledgeBaseId, knowledgeBaseId),
    )).limit(1)
    if (!parent || parent.type !== "FOLDER") throw badRequest("目标位置必须是当前知识库下的文件夹")
}

function jobValues(batch: KnowledgeBaseImportBatchRecord, draft: ImportItemDraft) {
    return {
        batchId: batch.id,
        userId: batch.userId,
        knowledgeBaseId: batch.knowledgeBaseId,
        parentNodeId: batch.parentNodeId,
        sourceType: draft.sourceType,
        fileName: draft.fileName,
        sourceKey: draft.sourceKey ?? null,
        sourceRef: draft.sourceRef ?? null,
        relativePath: draft.relativePath ?? null,
        sourcePayloadJson: draft.sourcePayloadJson ?? null,
        title: draft.title,
        totalPages: draft.totalPages ?? 0,
        processedPages: draft.processedPages ?? 0,
        modelConfigId: draft.modelConfigId ?? null,
        status: "pending",
    }
}

async function insertDrafts(db: Pick<Db, "insert">, batch: KnowledgeBaseImportBatchRecord, drafts: ImportItemDraft[]) {
    for (let index = 0; index < drafts.length; index += 200) {
        const chunk = drafts.slice(index, index + 200)
        if (chunk.every((draft) => !draft.pages?.length)) {
            await db.insert(knowledgeBaseImportJobs).values(chunk.map((draft) => jobValues(batch, draft)))
            continue
        }
        for (const draft of chunk) {
            const [job] = await db.insert(knowledgeBaseImportJobs).values(jobValues(batch, draft)).returning()
            if (draft.pages?.length) {
                await db.insert(knowledgeBaseImportJobPages).values(draft.pages.map((page) => ({
                    jobId: job.id,
                    pageNo: page.pageNo,
                    imageKey: page.imageKey,
                    extractedBy: page.extractedBy,
                    status: page.status,
                    markdown: page.markdown,
                })))
            }
        }
    }
}

export async function createImportBatch(input: {
    userId: number
    knowledgeBaseId: number
    parentNodeId: number | null
    sourceType: ImportSourceType
    sourceInput: unknown
}) {
    const db = getDb()
    await assertTarget(db, input.userId, input.knowledgeBaseId, input.parentNodeId)
    const adapter = getImportSourceAdapter(input.sourceType)
    const prepared = await adapter.prepare(input.sourceInput, { db, userId: input.userId })
    const batch = await db.transaction(async (tx) => {
        const [created] = await tx.insert(knowledgeBaseImportBatches).values({
            userId: input.userId,
            knowledgeBaseId: input.knowledgeBaseId,
            parentNodeId: input.parentNodeId,
            sourceType: input.sourceType,
            sourceName: prepared.sourceName,
            sourceRef: prepared.sourceRef ?? null,
            sourcePayloadJson: prepared.sourcePayloadJson ?? null,
            totalItems: prepared.items.length,
        }).returning()
        await insertDrafts(tx, created, prepared.items)
        return created
    })
    scheduleImportBatch(batch.id)
    return batch
}

export function scheduleImportBatch(batchId: number) {
    after(async () => {
        try {
            await runImportBatch(batchId)
        } catch (error) {
            console.error("[document-import] 后台批次执行失败", { batchId, error })
        }
    })
}

async function claimBatch(db: Db, batchId: number) {
    const staleBefore = new Date(Date.now() - LEASE_MS)
    const [batch] = await db.update(knowledgeBaseImportBatches).set({
        status: "processing",
        lockedAt: new Date(),
        attemptCount: 1,
        error: null,
        updatedAt: new Date(),
    }).where(and(
        eq(knowledgeBaseImportBatches.id, batchId),
        inArray(knowledgeBaseImportBatches.status, ["pending", "processing", "partial", "failed"]),
        or(isNull(knowledgeBaseImportBatches.lockedAt), lt(knowledgeBaseImportBatches.lockedAt, staleBefore)),
    )).returning()
    return batch ?? null
}

async function discoverBatchItems(db: Db, batch: KnowledgeBaseImportBatchRecord) {
    const [{ value: existing }] = await db.select({ value: count() }).from(knowledgeBaseImportJobs)
        .where(eq(knowledgeBaseImportJobs.batchId, batch.id))
    if (existing > 0) return
    const drafts: ImportItemDraft[] = []
    const adapter = getImportSourceAdapter(batch.sourceType as ImportSourceType)
    for await (const draft of adapter.discover(batch, { db, userId: batch.userId })) drafts.push(draft)
    if (drafts.length === 0) throw new Error("来源中没有可导入的文档")
    await insertDrafts(db, batch, drafts)
    await db.update(knowledgeBaseImportBatches).set({ totalItems: drafts.length, updatedAt: new Date() })
        .where(eq(knowledgeBaseImportBatches.id, batch.id))
}

async function nextSortOrder(db: Db, userId: number, knowledgeBaseId: number, parentId: number | null) {
    const rows = await db.select({ sortOrder: knowledgeBaseNodes.sortOrder }).from(knowledgeBaseNodes).where(and(
        eq(knowledgeBaseNodes.userId, userId),
        eq(knowledgeBaseNodes.knowledgeBaseId, knowledgeBaseId),
        parentId == null ? isNull(knowledgeBaseNodes.parentId) : eq(knowledgeBaseNodes.parentId, parentId),
    ))
    return rows.reduce((max, row) => Math.max(max, row.sortOrder), 0) + 1
}

async function ensureRelativeFolders(db: Db, job: KnowledgeBaseImportJobRecord, relativePath: string | null) {
    const parts = (relativePath ?? "").replaceAll("\\", "/").split("/").filter(Boolean)
    parts.pop()
    let parentId = job.parentNodeId
    for (const name of parts) {
        const [existing] = await db.select().from(knowledgeBaseNodes).where(and(
            eq(knowledgeBaseNodes.userId, job.userId),
            eq(knowledgeBaseNodes.knowledgeBaseId, job.knowledgeBaseId),
            parentId == null ? isNull(knowledgeBaseNodes.parentId) : eq(knowledgeBaseNodes.parentId, parentId),
            eq(knowledgeBaseNodes.type, "FOLDER"),
            eq(knowledgeBaseNodes.name, name.slice(0, 200)),
        )).limit(1)
        if (existing) {
            parentId = existing.id
            continue
        }
        const [created] = await db.insert(knowledgeBaseNodes).values({
            userId: job.userId,
            knowledgeBaseId: job.knowledgeBaseId,
            parentId,
            type: "FOLDER",
            name: name.slice(0, 200),
            sortOrder: await nextSortOrder(db, job.userId, job.knowledgeBaseId, parentId),
        }).returning()
        parentId = created.id
    }
    return parentId
}

async function importJob(db: Db, job: KnowledgeBaseImportJobRecord) {
    const [claimed] = await db.update(knowledgeBaseImportJobs).set({
        status: "processing",
        lockedAt: new Date(),
        attemptCount: job.attemptCount + 1,
        error: null,
        updatedAt: new Date(),
    }).where(and(eq(knowledgeBaseImportJobs.id, job.id), eq(knowledgeBaseImportJobs.status, "pending"))).returning()
    if (!claimed || claimed.articleId != null) return

    try {
        const adapter = getImportSourceAdapter(claimed.sourceType as ImportSourceType)
        const document = await adapter.extract(claimed, { db, userId: claimed.userId })
        const [batch] = claimed.batchId == null ? [] : await db.select({ status: knowledgeBaseImportBatches.status })
            .from(knowledgeBaseImportBatches).where(eq(knowledgeBaseImportBatches.id, claimed.batchId)).limit(1)
        if (batch?.status === "canceled") return
        const parentId = await ensureRelativeFolders(db, claimed, document.relativePath)
        const sortOrder = await nextSortOrder(db, claimed.userId, claimed.knowledgeBaseId, parentId)
        await db.transaction(async (tx) => {
            const [node] = await tx.insert(knowledgeBaseNodes).values({
                userId: claimed.userId,
                knowledgeBaseId: claimed.knowledgeBaseId,
                parentId,
                type: "ARTICLE",
                name: document.title,
                sortOrder,
            }).returning()
            const [article] = await tx.insert(knowledgeBaseArticles).values({
                userId: claimed.userId,
                knowledgeBaseId: claimed.knowledgeBaseId,
                nodeId: node.id,
                title: document.title,
                contentMd: document.contentMd,
                metadataJson: document.metadata && Object.keys(document.metadata).length
                    ? JSON.stringify(document.metadata)
                    : null,
                ...buildPublicArticleMetadata(document.contentMd),
            }).returning()
            if (document.tags?.length) {
                await tx.insert(knowledgeBaseArticleTags).values(
                    document.tags.map((tag) => ({ articleId: article.id, tag })),
                )
            }
            await tx.update(knowledgeBaseImportJobs).set({
                articleId: article.id,
                status: "completed",
                processedPages: claimed.totalPages,
                lockedAt: null,
                error: document.warnings.length ? document.warnings.join("；").slice(0, 500) : null,
                updatedAt: new Date(),
            }).where(eq(knowledgeBaseImportJobs.id, claimed.id))
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : "导入失败"
        const retry = claimed.attemptCount < 3
        await db.update(knowledgeBaseImportJobs).set({
            status: retry ? "pending" : "failed",
            nextRetryAt: retry ? new Date(Date.now() + 15_000 * (2 ** (claimed.attemptCount - 1))) : null,
            lockedAt: null,
            error: message.slice(0, 500),
            updatedAt: new Date(),
        }).where(eq(knowledgeBaseImportJobs.id, claimed.id))
    }
}

export async function refreshImportBatch(batchId: number) {
    const db = getDb()
    const rows = await db.select({ status: knowledgeBaseImportJobs.status, value: count() })
        .from(knowledgeBaseImportJobs)
        .where(eq(knowledgeBaseImportJobs.batchId, batchId))
        .groupBy(knowledgeBaseImportJobs.status)
    const counts = new Map(rows.map((row) => [row.status, row.value]))
    const completed = counts.get("completed") ?? 0
    const failed = counts.get("failed") ?? 0
    const pending = counts.get("pending") ?? 0
    const processing = counts.get("processing") ?? 0
    const status = processing > 0 ? "processing" : pending > 0 ? "pending" : failed > 0 ? (completed > 0 ? "partial" : "failed") : "completed"
    await db.update(knowledgeBaseImportBatches).set({
        status,
        completedItems: completed,
        failedItems: failed,
        lockedAt: null,
        updatedAt: new Date(),
    }).where(eq(knowledgeBaseImportBatches.id, batchId))
    return status
}

export async function runImportBatch(batchId: number) {
    const db = getDb()
    const batch = await claimBatch(db, batchId)
    if (!batch) return
    try {
        await discoverBatchItems(db, batch)
        const staleBefore = new Date(Date.now() - LEASE_MS)
        await db.update(knowledgeBaseImportJobs).set({ status: "pending", lockedAt: null, updatedAt: new Date() })
            .where(and(
                eq(knowledgeBaseImportJobs.batchId, batch.id),
                eq(knowledgeBaseImportJobs.status, "processing"),
                or(isNull(knowledgeBaseImportJobs.lockedAt), lt(knowledgeBaseImportJobs.lockedAt, staleBefore)),
            ))
        const jobs = await db.select().from(knowledgeBaseImportJobs).where(and(
            eq(knowledgeBaseImportJobs.batchId, batch.id),
            eq(knowledgeBaseImportJobs.status, "pending"),
            or(isNull(knowledgeBaseImportJobs.nextRetryAt), lte(knowledgeBaseImportJobs.nextRetryAt, new Date())),
        )).orderBy(asc(knowledgeBaseImportJobs.id))
        for (const job of jobs) {
            const [currentBatch] = await db.select({ status: knowledgeBaseImportBatches.status })
                .from(knowledgeBaseImportBatches).where(eq(knowledgeBaseImportBatches.id, batch.id)).limit(1)
            if (currentBatch?.status === "canceled") break
            await importJob(db, job)
        }
        const [latest] = await db.select({ status: knowledgeBaseImportBatches.status })
            .from(knowledgeBaseImportBatches).where(eq(knowledgeBaseImportBatches.id, batch.id)).limit(1)
        if (latest?.status !== "canceled") await refreshImportBatch(batch.id)
    } catch (error) {
        const message = error instanceof Error ? error.message : "导入批次执行失败"
        await db.update(knowledgeBaseImportBatches).set({
            status: "failed",
            error: message.slice(0, 500),
            lockedAt: null,
            updatedAt: new Date(),
        }).where(eq(knowledgeBaseImportBatches.id, batch.id))
    }
}

export async function drainImportQueue(limit = 3) {
    const db = getDb()
    const staleBefore = new Date(Date.now() - LEASE_MS)
    const batches = await db.select({ id: knowledgeBaseImportBatches.id })
        .from(knowledgeBaseImportBatches)
        .where(or(
            and(
                eq(knowledgeBaseImportBatches.status, "pending"),
                or(isNull(knowledgeBaseImportBatches.nextRetryAt), lte(knowledgeBaseImportBatches.nextRetryAt, new Date())),
            ),
            and(eq(knowledgeBaseImportBatches.status, "processing"), lt(knowledgeBaseImportBatches.lockedAt, staleBefore)),
        ))
        .orderBy(asc(knowledgeBaseImportBatches.createdAt))
        .limit(Math.max(1, Math.min(limit, 10)))
    await Promise.all(batches.map((batch) => runImportBatch(batch.id)))
    return batches.length
}
