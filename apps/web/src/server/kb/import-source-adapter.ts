import type { getDb } from "@/server/db/client"
import type {
    KnowledgeBaseImportBatchRecord,
    KnowledgeBaseImportJobRecord,
} from "@/server/db/schema"

export const IMPORT_SOURCE_TYPES = ["markdown", "pdf", "feishu"] as const
export type ImportSourceType = typeof IMPORT_SOURCE_TYPES[number]

export interface ImportPageDraft {
    pageNo: number
    imageKey: string | null
    extractedBy: "pdf" | "vision"
    status: "pending" | "done"
    markdown: string | null
}

export interface ImportItemDraft {
    sourceType: ImportSourceType
    fileName: string
    title: string
    sourceKey?: string | null
    sourceRef?: string | null
    relativePath?: string | null
    sourcePayloadJson?: string | null
    modelConfigId?: number | null
    totalPages?: number
    processedPages?: number
    pages?: ImportPageDraft[]
}

export interface PreparedImportBatch {
    sourceName: string
    sourceRef?: string | null
    sourcePayloadJson?: string | null
    items: ImportItemDraft[]
}

export interface ImportedDocument {
    title: string
    contentMd: string
    relativePath: string | null
    warnings: string[]
}

export interface ImportContext {
    db: ReturnType<typeof getDb>
    userId: number
}

/**
 * 导入来源的唯一扩展点。适配器只处理来源发现与正文抽取；队列状态、目录和文章落库由编排器统一负责。
 */
export interface ImportSourceAdapter {
    readonly sourceType: ImportSourceType
    prepare(input: unknown, context: ImportContext): Promise<PreparedImportBatch>
    discover(
        batch: KnowledgeBaseImportBatchRecord,
        context: ImportContext,
    ): AsyncIterable<ImportItemDraft>
    extract(
        item: KnowledgeBaseImportJobRecord,
        context: ImportContext,
    ): Promise<ImportedDocument>
}

export function isImportSourceType(value: unknown): value is ImportSourceType {
    return IMPORT_SOURCE_TYPES.includes(String(value) as ImportSourceType)
}
