"use client"

import * as React from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Eye, Loader2, RefreshCw, Trash2 } from "@/components/iconimate"
import { toast } from "sonner"
import { AppPagination } from "@/components/app-pagination"
import { ModalShell } from "@/components/petrichor-ui/modal-shell"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { importJobDetailPath, knowledgeBasePath } from "@/lib/dashboard-routes"
import { documentImportApi, type DocumentImportBatchResponse } from "@/lib/api"
import { cn } from "@/lib/utils"
import { formatDateTime, resolveApiErrorMessage, resolveProgressPercent, resolveTargetText, StatusBadge } from "@/features/pages/knowledge/document-import-job-shared"

const PAGE_SIZE = 20

export function DocumentImportJobsPage() {
  const { knowledgeBaseId } = useParams<{ knowledgeBaseId: string }>()
  const navigate = useNavigate()
  const [rows, setRows] = React.useState<DocumentImportBatchResponse[]>([])
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(0)
  const [loading, setLoading] = React.useState(false)
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const response = await documentImportApi.list({ knowledgeBaseId, pageNum: page + 1, pageSize: PAGE_SIZE })
      setRows(response.data.rows ?? [])
      setTotal(response.data.total)
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, "加载导入任务失败"))
    } finally { setLoading(false) }
  }, [knowledgeBaseId, page])

  React.useEffect(() => { void load() }, [load])
  React.useEffect(() => {
    if (!rows.some((row) => row.status === "pending" || row.status === "processing")) return
    const timer = window.setInterval(() => void load(), 4000)
    return () => window.clearInterval(timer)
  }, [load, rows])

  const deleteSelected = async () => {
    if (!selected.size) return
    setLoading(true)
    try {
      await documentImportApi.deleteMany({ ids: [...selected] })
      toast.success(`已删除 ${selected.size} 个导入批次`)
      setSelected(new Set())
      setConfirmOpen(false)
      await load()
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, "删除失败"))
    } finally { setLoading(false) }
  }

  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id))
  return (
    <div className="flex w-full flex-col gap-6 px-4 py-6 sm:px-6 lg:px-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><h1 className="text-2xl font-semibold">文档导入任务</h1><p className="mt-1 text-sm text-muted-foreground">统一查看 Markdown、PDF 和飞书导入批次；列表按服务端分页加载。</p></div>
        <div className="flex flex-wrap gap-2">
          {selected.size ? <Button variant="destructive" onClick={() => setConfirmOpen(true)}><Trash2 className="mr-2 size-4" />删除所选（{selected.size}）</Button> : null}
          <Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw className={cn("mr-2 size-4", loading && "animate-spin")} />刷新</Button>
          {knowledgeBaseId ? <Button variant="outline" onClick={() => navigate(knowledgeBasePath(knowledgeBaseId))}><ArrowLeft className="mr-2 size-4" />返回知识库</Button> : null}
        </div>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader><TableRow className="hover:bg-transparent"><TableHead className="w-10"><Checkbox checked={allSelected} onCheckedChange={(checked) => setSelected(checked ? new Set(rows.map((row) => row.id)) : new Set())} /></TableHead><TableHead>来源</TableHead><TableHead>导入到</TableHead><TableHead>进度</TableHead><TableHead>状态</TableHead><TableHead>创建时间</TableHead><TableHead className="w-14" /></TableRow></TableHeader>
          <TableBody>
            {loading && !rows.length ? <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground"><Loader2 className="mr-2 inline size-4 animate-spin" />加载中…</TableCell></TableRow> : rows.length ? rows.map((batch) => (
              <TableRow key={batch.id}>
                <TableCell><Checkbox checked={selected.has(batch.id)} onCheckedChange={(checked) => setSelected((current) => { const next = new Set(current); if (checked) next.add(batch.id); else next.delete(batch.id); return next })} /></TableCell>
                <TableCell><div className="font-medium">{batch.sourceName}</div><div className="text-xs uppercase text-muted-foreground">{batch.sourceType}</div></TableCell>
                <TableCell className="text-sm text-muted-foreground">{resolveTargetText(batch)}</TableCell>
                <TableCell><div className="w-40 max-w-full"><div className="flex justify-between text-xs text-muted-foreground"><span>{resolveProgressPercent(batch)}%</span><span>{batch.completedItems}/{batch.totalItems}</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn("h-full", batch.failedItems ? "bg-destructive" : "bg-primary")} style={{ width: `${resolveProgressPercent(batch)}%` }} /></div></div></TableCell>
                <TableCell><StatusBadge status={batch.status} /></TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(batch.createdAt)}</TableCell>
                <TableCell><Button size="icon" variant="ghost" aria-label="查看批次详情" onClick={() => navigate(importJobDetailPath(batch.id))}><Eye className="size-4" /></Button></TableCell>
              </TableRow>
            )) : <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">暂无导入任务</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <AppPagination page={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
      <ModalShell open={confirmOpen} onOpenChange={setConfirmOpen} title="删除导入批次" description="只删除任务及识别记录，已经生成的知识库文章不会被删除。" footer={<div className="flex w-full justify-end gap-2"><Button variant="outline" onClick={() => setConfirmOpen(false)}>取消</Button><Button variant="destructive" onClick={() => void deleteSelected()}>删除</Button></div>} />
    </div>
  )
}

export default DocumentImportJobsPage
