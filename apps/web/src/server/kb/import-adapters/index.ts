import type { ImportSourceAdapter, ImportSourceType } from "@/server/kb/import-source-adapter"
import { feishuImportAdapter } from "@/server/kb/import-adapters/feishu"
import { markdownImportAdapter } from "@/server/kb/import-adapters/markdown"
import { pdfImportAdapter } from "@/server/kb/import-adapters/pdf"

const adapters: Record<ImportSourceType, ImportSourceAdapter> = {
    markdown: markdownImportAdapter,
    pdf: pdfImportAdapter,
    feishu: feishuImportAdapter,
}

export function getImportSourceAdapter(sourceType: ImportSourceType): ImportSourceAdapter {
    return adapters[sourceType]
}
