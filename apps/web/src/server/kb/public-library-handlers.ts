import { sql } from "drizzle-orm"
import type { NextRequest } from "next/server"
import { z } from "zod"

import { getDb } from "@/server/db/client"
import { badRequest, notFound, ok, toErrorResponse } from "@/server/http/response"
import { cachePublicLibraryChildren } from "@/server/public-content-cache"

import { buildArticleAiSummaryExcerpt } from "./article-summary-logic"
import {
    buildPublicArticleMetadata,
    buildPublicShareInternalLink,
    buildPublicShareRepostAttribution,
    isInternalSitePath,
    resolvePublicHomepageShareStatus,
} from "./share-logic"

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50
const cacheControl = "public, max-age=60, s-maxage=60, stale-while-revalidate=300"

const optionalId = z.preprocess(
    (value) => value == null || String(value).trim() === "" ? undefined : value,
    z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
)

const inputSchema = z.object({
    knowledgeBaseId: optionalId,
    parentId: optionalId,
    pageNum: z.coerce.number().int().positive().max(100_000).default(1),
    pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
})

type PublicLibraryInput = z.infer<typeof inputSchema>
type RawRow = Record<string, unknown>

const loadCachedPublicLibraryChildren = cachePublicLibraryChildren(loadPublicLibraryChildren)

export async function publicLibraryChildren(request: NextRequest) {
    try {
        const params = request.nextUrl.searchParams
        const input = inputSchema.parse({
            knowledgeBaseId: params.get("knowledgeBaseId"),
            parentId: params.get("parentId"),
            pageNum: params.get("pageNum") || undefined,
            pageSize: params.get("pageSize") || undefined,
        })
        if (input.parentId && !input.knowledgeBaseId) {
            throw badRequest("parentId 必须与 knowledgeBaseId 一起使用")
        }

        const locationKey = [
            input.knowledgeBaseId ?? "root",
            input.parentId ?? "root",
            input.pageNum,
            input.pageSize,
        ].join(":")
        return ok(await loadCachedPublicLibraryChildren(locationKey, input), {
            headers: { "Cache-Control": cacheControl },
        })
    } catch (error) {
        return toErrorResponse(error, request.nextUrl.pathname)
    }
}

export async function loadPublicLibraryChildren(input: PublicLibraryInput) {
    return input.knowledgeBaseId
        ? loadKnowledgeBaseLevel(input)
        : loadKnowledgeBaseRoot(input)
}

async function loadKnowledgeBaseRoot(input: PublicLibraryInput) {
    const offset = (input.pageNum - 1) * input.pageSize
    const rows = readRows(await getDb().execute(sql`
        select kb.id, kb.name, kb.description
        from petrichor_kb_knowledge_base kb
        where exists (
            select 1
            from petrichor_kb_article article
            join petrichor_kb_article_share share on share.article_id = article.id
            where article.knowledge_base_id = kb.id
              and share.enabled = true
              and share.revoked_at is null
        )
        order by lower(kb.name), kb.id
        limit ${input.pageSize + 1}
        offset ${offset}
    `))
    const hasMore = rows.length > input.pageSize

    return {
        current: { type: "ROOT" as const, id: null, name: "文章" },
        breadcrumbs: [],
        items: rows.slice(0, input.pageSize).map((row) => ({
            type: "KNOWLEDGE_BASE" as const,
            id: String(row.id),
            name: String(row.name ?? "未命名知识库"),
            description: stringOrNull(row.description),
            hasChildren: true,
        })),
        pageNum: input.pageNum,
        pageSize: input.pageSize,
        hasMore,
    }
}

async function loadKnowledgeBaseLevel(input: PublicLibraryInput) {
    const knowledgeBaseId = input.knowledgeBaseId!
    const [knowledgeBase] = readRows(await getDb().execute(sql`
        select kb.id, kb.name, kb.description
        from petrichor_kb_knowledge_base kb
        where kb.id = ${knowledgeBaseId}
          and exists (
              select 1
              from petrichor_kb_article article
              join petrichor_kb_article_share share on share.article_id = article.id
              where article.knowledge_base_id = kb.id
                and share.enabled = true
                and share.revoked_at is null
          )
        limit 1
    `))
    if (!knowledgeBase) {
        throw notFound("公开目录不存在")
    }

    const folderPath = input.parentId
        ? await loadVisibleFolderPath(knowledgeBaseId, input.parentId)
        : []
    if (input.parentId && folderPath.length === 0) {
        throw notFound("公开目录不存在")
    }

    const offset = (input.pageNum - 1) * input.pageSize
    const rows = readRows(await getDb().execute(sql`
        with recursive public_nodes(id, parent_id) as (
            select node.id, node.parent_id
            from petrichor_kb_node node
            join petrichor_kb_article article on article.node_id = node.id
            join petrichor_kb_article_share share on share.article_id = article.id
            where node.knowledge_base_id = ${knowledgeBaseId}
              and node.type = 'ARTICLE'
              and share.enabled = true
              and share.revoked_at is null
            union
            select parent.id, parent.parent_id
            from petrichor_kb_node parent
            join public_nodes child on child.parent_id = parent.id
            where parent.knowledge_base_id = ${knowledgeBaseId}
        ), visible_items as (
            select
                0 as item_group,
                folder.sort_order,
                folder.id as node_id,
                'FOLDER'::text as kind,
                folder.name,
                null::bigint as article_id,
                null::text as share_code,
                null::text as content_md,
                null::text as public_excerpt,
                null::text as ai_summary,
                null::integer as reading_minutes,
                null::timestamptz as updated_at,
                null::timestamptz as expires_at,
                null::text as password_hash,
                null::boolean as is_repost,
                null::text as original_url,
                null::text as original_author_name,
                null::text as internal_url,
                null::integer as pin_order,
                null::boolean as enabled,
                null::timestamptz as revoked_at
            from petrichor_kb_node folder
            join public_nodes visible on visible.id = folder.id
            where folder.knowledge_base_id = ${knowledgeBaseId}
              and folder.parent_id is not distinct from ${input.parentId ?? null}
              and folder.type = 'FOLDER'
            union all
            select
                1 as item_group,
                node.sort_order,
                node.id as node_id,
                'ARTICLE'::text as kind,
                article.title as name,
                article.id as article_id,
                share.share_code,
                article.content_md,
                article.public_excerpt,
                article.ai_summary,
                article.reading_minutes,
                article.updated_at,
                share.expires_at,
                share.password_hash,
                share.is_repost,
                share.original_url,
                share.original_author_name,
                share.internal_url,
                share.pin_order,
                share.enabled,
                share.revoked_at
            from petrichor_kb_node node
            join petrichor_kb_article article on article.node_id = node.id
            join petrichor_kb_article_share share on share.article_id = article.id
            where node.knowledge_base_id = ${knowledgeBaseId}
              and node.parent_id is not distinct from ${input.parentId ?? null}
              and node.type = 'ARTICLE'
              and share.enabled = true
              and share.revoked_at is null
        )
        select * from visible_items
        order by item_group, sort_order, node_id
        limit ${input.pageSize + 1}
        offset ${offset}
    `))
    const hasMore = rows.length > input.pageSize
    const items = rows.slice(0, input.pageSize).map(mapLevelItem)
    const knowledgeBaseBreadcrumb = {
        type: "KNOWLEDGE_BASE" as const,
        id: String(knowledgeBase.id),
        name: String(knowledgeBase.name ?? "未命名知识库"),
    }
    const breadcrumbs = [knowledgeBaseBreadcrumb, ...folderPath]
    const current = folderPath.at(-1) ?? {
        ...knowledgeBaseBreadcrumb,
        description: stringOrNull(knowledgeBase.description),
    }

    return {
        current,
        breadcrumbs,
        items,
        pageNum: input.pageNum,
        pageSize: input.pageSize,
        hasMore,
    }
}

async function loadVisibleFolderPath(knowledgeBaseId: number, folderId: number) {
    const rows = readRows(await getDb().execute(sql`
        with recursive public_nodes(id, parent_id) as (
            select node.id, node.parent_id
            from petrichor_kb_node node
            join petrichor_kb_article article on article.node_id = node.id
            join petrichor_kb_article_share share on share.article_id = article.id
            where node.knowledge_base_id = ${knowledgeBaseId}
              and node.type = 'ARTICLE'
              and share.enabled = true
              and share.revoked_at is null
            union
            select parent.id, parent.parent_id
            from petrichor_kb_node parent
            join public_nodes child on child.parent_id = parent.id
            where parent.knowledge_base_id = ${knowledgeBaseId}
        ), folder_path(id, parent_id, name, visited, up) as (
            select node.id, node.parent_id, node.name, array[node.id]::bigint[], 0
            from petrichor_kb_node node
            join public_nodes visible on visible.id = node.id
            where node.id = ${folderId}
              and node.knowledge_base_id = ${knowledgeBaseId}
              and node.type = 'FOLDER'
            union all
            select parent.id, parent.parent_id, parent.name, child.visited || parent.id, child.up + 1
            from petrichor_kb_node parent
            join folder_path child on child.parent_id = parent.id
            where parent.knowledge_base_id = ${knowledgeBaseId}
              and parent.type = 'FOLDER'
              and child.up < 100
              and not parent.id = any(child.visited)
        )
        select id, name from folder_path order by up desc
    `))

    return rows.map((row) => ({
        type: "FOLDER" as const,
        id: String(row.id),
        name: String(row.name ?? "未命名文件夹"),
    }))
}

function mapLevelItem(row: RawRow) {
    if (row.kind === "FOLDER") {
        return {
            type: "FOLDER" as const,
            id: String(row.node_id),
            name: String(row.name ?? "未命名文件夹"),
            hasChildren: true,
        }
    }

    const contentMd = String(row.content_md ?? "")
    const fallback = buildPublicArticleMetadata(contentMd)
    const share = {
        enabled: Boolean(row.enabled),
        revokedAt: dateOrNull(row.revoked_at),
        expiresAt: dateOrNull(row.expires_at),
        passwordHash: stringOrNull(row.password_hash),
        isRepost: Boolean(row.is_repost),
        originalUrl: stringOrNull(row.original_url),
        originalAuthorName: stringOrNull(row.original_author_name),
        internalUrl: stringOrNull(row.internal_url),
    }
    const status = resolvePublicHomepageShareStatus(share)
    const repost = buildPublicShareRepostAttribution(share)
    const internalLink = buildPublicShareInternalLink(share)
    const shareCode = String(row.share_code ?? "")
    const internalUrl = internalLink.internalUrl

    return {
        type: "ARTICLE" as const,
        articleId: String(row.article_id),
        shareCode,
        title: String(row.name ?? "未命名文章"),
        excerpt: buildArticleAiSummaryExcerpt({ summary: stringOrNull(row.ai_summary) })
            || stringOrNull(row.public_excerpt)?.trim()
            || fallback.publicExcerpt,
        updatedAt: formatDate(row.updated_at),
        readingMinutes: positiveInteger(row.reading_minutes) ?? fallback.readingMinutes,
        href: internalUrl && isInternalSitePath(internalUrl) ? internalUrl : `/p/${shareCode}`,
        expired: status.expired,
        expiresAt: formatDateOrNull(row.expires_at),
        hasPassword: status.hasPassword,
        isRepost: repost.isRepost,
        isInternalLink: internalUrl != null,
        isPinned: row.pin_order != null,
        pinOrder: positiveInteger(row.pin_order),
    }
}

function readRows(raw: unknown): RawRow[] {
    return [...raw as Iterable<RawRow>]
}

function stringOrNull(value: unknown) {
    return typeof value === "string" && value.trim() ? value : null
}

function dateOrNull(value: unknown) {
    return value instanceof Date || typeof value === "string" ? value : null
}

function formatDate(value: unknown) {
    const date = value instanceof Date ? value : new Date(String(value ?? ""))
    return Number.isNaN(date.getTime()) ? "" : date.toISOString()
}

function formatDateOrNull(value: unknown) {
    const formatted = formatDate(value)
    return formatted || null
}

function positiveInteger(value: unknown) {
    const number = Number(value)
    return Number.isInteger(number) && number > 0 ? number : null
}
