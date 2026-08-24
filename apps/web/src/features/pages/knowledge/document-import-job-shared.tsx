import { cn } from "@/lib/utils"
import type { DocumentImportBatchResponse, DocumentImportJobStatus } from "@/lib/api"

export const STATUS_META: Record<DocumentImportJobStatus, { label: string; className: string }> = {
  pending: { label: "等待中", className: "bg-muted text-muted-foreground" },
  processing: { label: "进行中", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  completed: { label: "已完成", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  partial: { label: "部分失败", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  failed: { label: "失败", className: "bg-destructive/10 text-destructive" },
  canceled: { label: "已取消", className: "bg-muted text-muted-foreground" },
}

export function resolveApiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error && "response" in error) {
    const msg = (error as { response?: { data?: { msg?: unknown } } }).response?.data?.msg
    if (typeof msg === "string" && msg) return msg
  }
  return error instanceof Error && error.message ? error.message : fallback
}

export function formatDateTime(value?: string | null) {
  if (!value) return "-"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export function StatusBadge({ status }: { status: DocumentImportJobStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.pending
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", meta.className)}>{meta.label}</span>
}

export function resolveTargetText(batch: DocumentImportBatchResponse) {
  return `${batch.knowledgeBaseName || `知识库 #${batch.knowledgeBaseId}`} / ${batch.parentFolderName || "知识库根目录"}`
}

export function resolveProgressPercent(batch: DocumentImportBatchResponse) {
  return batch.totalItems > 0 ? Math.round(((batch.completedItems + batch.failedItems + batch.skippedItems) / batch.totalItems) * 100) : 0
}
