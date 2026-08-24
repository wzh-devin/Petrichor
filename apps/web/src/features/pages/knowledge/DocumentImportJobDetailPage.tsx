"use client"

import * as React from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Eye, Loader2, RefreshCw } from "@/components/iconimate"
import { toast } from "sonner"
import { AppPagination } from "@/components/app-pagination"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { dashboardRoutes, knowledgeBaseArticlePath } from "@/lib/dashboard-routes"
import { documentImportApi, type DocumentImportBatchResponse, type DocumentImportItemResponse, type DocumentImportPageResponse } from "@/lib/api"
import { cn } from "@/lib/utils"
import { formatDateTime, resolveApiErrorMessage, StatusBadge } from "@/features/pages/knowledge/document-import-job-shared"

const PAGE_SIZE = 50

export function DocumentImportJobDetailPage() {
  const { jobId: batchId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()
  const [batch, setBatch] = React.useState<DocumentImportBatchResponse | null>(null)
  const [items, setItems] = React.useState<DocumentImportItemResponse[]>([])
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(0)
  const [loading, setLoading] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [pagesByItem, setPagesByItem] = React.useState<Record<string, DocumentImportPageResponse[]>>({})

  const load = React.useCallback(async () => {
    if (!batchId) return
    setLoading(true)
    try {
      const response = await documentImportApi.detail({ batchId, pageNum: page + 1, pageSize: PAGE_SIZE })
      setBatch(response.data.batch)
      setItems(response.data.items.rows ?? [])
      setTotal(response.data.items.total)
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, "加载批次详情失败"))
    } finally { setLoading(false) }
  }, [batchId, page])

  React.useEffect(() => { void load() }, [load])
  React.useEffect(() => {
    if (!batch || !["pending", "processing"].includes(batch.status)) return
    const timer = window.setInterval(() => void load(), 4000)
    return () => window.clearInterval(timer)
  }, [batch, load])

  const retry = async () => {
    if (!batchId) return
    setBusy(true)
    try {
      const response = await documentImportApi.retryFailedPages({ batchId })
      toast.success(`已重新排队 ${response.data.retried} 个失败项目`)
      await load()
    } catch (error) { toast.error(resolveApiErrorMessage(error, "重试失败")) }
    finally { setBusy(false) }
  }

  const cancel = async () => {
    if (!batchId) return
    setBusy(true)
    try { await documentImportApi.cancel({ batchId }); toast.success("批次已取消"); await load() }
    catch (error) { toast.error(resolveApiErrorMessage(error, "取消失败")) }
    finally { setBusy(false) }
  }

  const togglePages = async (item: DocumentImportItemResponse) => {
    if (pagesByItem[item.id]) {
      setPagesByItem((current) => { const next = { ...current }; delete next[item.id]; return next })
      return
    }
    try {
      const response = await documentImportApi.itemDetail({ itemId: item.id })
      setPagesByItem((current) => ({ ...current, [item.id]: response.data.pages }))
    } catch (error) { toast.error(resolveApiErrorMessage(error, "加载页面明细失败")) }
  }

  return (
    <div className="flex w-full flex-col gap-6 px-4 py-6 sm:px-6 lg:px-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">{batch?.sourceName || "导入批次详情"}</h1><p className="mt-1 text-sm text-muted-foreground">按文档分页展示；PDF 可按需展开页面明细。</p></div>
        <div className="flex gap-2"><Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw className={cn("mr-2 size-4", loading && "animate-spin")} />刷新</Button><Button variant="outline" onClick={() => navigate(dashboardRoutes.imports)}><ArrowLeft className="mr-2 size-4" />返回列表</Button></div>
      </div>
      {loading && !batch ? <div className="rounded-lg border py-16 text-center text-muted-foreground"><Loader2 className="mr-2 inline size-4 animate-spin" />加载中…</div> : batch ? (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4"><StatusBadge status={batch.status} /><span className="text-sm text-muted-foreground">完成 {batch.completedItems} / {batch.totalItems}{batch.failedItems ? ` · 失败 ${batch.failedItems}` : ""}</span><div className="ml-auto flex gap-2">{["failed", "partial"].includes(batch.status) ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void retry()}>重试失败项目</Button> : null}{["pending", "processing"].includes(batch.status) ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void cancel()}>取消批次</Button> : null}</div></div>
          {batch.error ? <p className="text-sm text-destructive">{batch.error}</p> : null}
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader><TableRow className="hover:bg-transparent"><TableHead>文档</TableHead><TableHead>路径</TableHead><TableHead>状态</TableHead><TableHead>尝试</TableHead><TableHead>更新时间</TableHead><TableHead className="w-14" /></TableRow></TableHeader>
              <TableBody>
                {items.map((item) => <React.Fragment key={item.id}>
                  <TableRow><TableCell><div className="font-medium">{item.title}</div><div className="text-xs text-muted-foreground">{item.fileName}</div>{item.error ? <div className="mt-1 max-w-xl text-xs text-destructive">{item.error}</div> : null}</TableCell><TableCell className="max-w-xs truncate text-sm text-muted-foreground">{item.relativePath || "-"}</TableCell><TableCell><StatusBadge status={item.status} /></TableCell><TableCell>{item.attemptCount}</TableCell><TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(item.updatedAt)}</TableCell><TableCell>{item.articleId ? <Button size="icon" variant="ghost" aria-label="打开文章" onClick={() => navigate(knowledgeBaseArticlePath(batch.knowledgeBaseId, item.articleId as string))}><Eye className="size-4" /></Button> : item.sourceType === "pdf" ? <Button size="sm" variant="ghost" onClick={() => void togglePages(item)}>页面</Button> : null}</TableCell></TableRow>
                  {pagesByItem[item.id] ? <TableRow><TableCell colSpan={6}><div className="flex flex-wrap gap-2 py-1">{pagesByItem[item.id].map((entry) => <span key={entry.pageNo} className={cn("rounded border px-2 py-1 text-xs", entry.status === "failed" && "text-destructive")}>第 {entry.pageNo} 页 · {entry.extractedBy === "pdf" ? "本地" : "模型"} · {entry.status === "done" ? "完成" : entry.status === "failed" ? "失败" : "等待"}</span>)}</div></TableCell></TableRow> : null}
                </React.Fragment>)}
                {!items.length ? <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">暂无文档项目</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          </div>
          <AppPagination page={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
        </>
      ) : <div className="rounded-lg border py-16 text-center text-muted-foreground">批次不存在或已被删除</div>}
    </div>
  )
}

export default DocumentImportJobDetailPage
