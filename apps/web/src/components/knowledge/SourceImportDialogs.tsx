"use client"

import * as React from "react"
import { FileText, FolderOpen, Loader2, UploadCloud } from "@/components/iconimate"
import { toast } from "sonner"
import { ModalShell } from "@/components/petrichor-ui/modal-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { validateMarkdownImportFile } from "@/components/knowledge/article-editor-utils"
import {
  documentImportApi,
  feishuImportApi,
  knowledgeBaseNodeApi,
  uploadApi,
  type KnowledgeBaseTreeNode,
} from "@/lib/api"

interface ImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  knowledgeBaseId: string
  defaultParentId?: string | null
  onCreated?: (batchId: string) => void
}

interface FolderOption { id: string; label: string }

function flattenFolders(nodes: KnowledgeBaseTreeNode[], depth = 0, result: FolderOption[] = []): FolderOption[] {
  for (const node of nodes) {
    if (node.type !== "FOLDER") continue
    result.push({ id: node.id, label: `${"　".repeat(depth)}${node.name}` })
    flattenFolders(node.children ?? [], depth + 1, result)
  }
  return result
}

function useTargetFolders(open: boolean, knowledgeBaseId: string, defaultParentId: string | null) {
  const [parentId, setParentId] = React.useState<string | null>(defaultParentId)
  const [folders, setFolders] = React.useState<FolderOption[]>([])
  React.useEffect(() => {
    if (!open) return
    setParentId(defaultParentId)
    void knowledgeBaseNodeApi.tree(knowledgeBaseId)
      .then((response) => setFolders(flattenFolders(response.data.roots ?? [])))
      .catch(() => setFolders([]))
  }, [defaultParentId, knowledgeBaseId, open])
  return { parentId, setParentId, folders }
}

function TargetFolderSelect({
  parentId,
  setParentId,
  folders,
  disabled,
}: {
  parentId: string | null
  setParentId: (value: string | null) => void
  folders: FolderOption[]
  disabled: boolean
}) {
  return (
    <div className="space-y-2">
      <Label>导入到文件夹</Label>
      <Select value={parentId ?? "__root__"} disabled={disabled} onValueChange={(value) => setParentId(value === "__root__" ? null : value)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__root__">知识库根目录</SelectItem>
          {folders.map((folder) => <SelectItem key={folder.id} value={folder.id}>{folder.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

async function uploadFile(file: File) {
  const presign = await uploadApi.presignPut({ filename: file.name })
  const response = await fetch(presign.data.presignedUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "text/markdown" },
    body: file,
  })
  if (!response.ok) throw new Error(`上传 ${file.name} 失败：HTTP ${response.status}`)
  return presign.data.objectKey
}

type MarkdownFile = { file: File; relativePath: string }

export function MarkdownImportDialog({
  open,
  onOpenChange,
  knowledgeBaseId,
  defaultParentId = null,
  onCreated,
}: ImportDialogProps) {
  const { parentId, setParentId, folders } = useTargetFolders(open, knowledgeBaseId, defaultParentId)
  const [files, setFiles] = React.useState<MarkdownFile[]>([])
  const [busy, setBusy] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const folderRef = React.useRef<HTMLInputElement>(null)
  const setFolderRef = React.useCallback((input: HTMLInputElement | null) => {
    folderRef.current = input
    input?.setAttribute("webkitdirectory", "")
  }, [])

  const addFiles = React.useCallback((picked: File[]) => {
    const valid: MarkdownFile[] = []
    let invalidCount = 0
    const invalidReasonSet = new Set<string>()
    for (const file of picked) {
      const error = validateMarkdownImportFile(file)
      if (error) {
        invalidCount += 1
        invalidReasonSet.add(error)
        continue
      }
      const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
      valid.push({ file, relativePath })
    }
    if (invalidCount > 0) {
      toast.error(`已跳过 ${invalidCount} 个不符合要求的文件`, {
        description: Array.from(invalidReasonSet).join("；"),
      })
    }
    setFiles((current) => {
      const known = new Set(current.map((item) => `${item.relativePath}:${item.file.size}:${item.file.lastModified}`))
      return [...current, ...valid.filter((item) => !known.has(`${item.relativePath}:${item.file.size}:${item.file.lastModified}`))].slice(0, 500)
    })
  }, [])

  const close = () => {
    if (busy) return
    setFiles([])
    onOpenChange(false)
  }

  const submit = async () => {
    if (!files.length) return toast.error("请先选择 Markdown 文件或目录")
    setBusy(true)
    try {
      const entries: Array<{ fileName: string; relativePath: string; sourceKey: string }> = []
      for (let index = 0; index < files.length; index += 4) {
        entries.push(...await Promise.all(files.slice(index, index + 4).map(async (item) => ({
          fileName: item.file.name,
          relativePath: item.relativePath,
          sourceKey: await uploadFile(item.file),
        }))))
      }
      const rootName = files[0]?.relativePath.includes("/") ? files[0].relativePath.split("/")[0] : undefined
      const response = await documentImportApi.createBatch({
        knowledgeBaseId,
        parentId,
        sourceType: "markdown",
        input: { rootName, entries },
      })
      toast.success(`已创建导入批次，共 ${entries.length} 个 Markdown 文件`)
      onCreated?.(response.data.batch.id)
      setFiles([])
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建 Markdown 导入任务失败")
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell
      open={open}
      onOpenChange={(next) => { if (!next) close() }}
      title="导入 Markdown"
      description="可选择多个 Markdown 文件，也可选择整个目录；目录层级会原样保留，并统一进入导入任务队列。"
      disableClose={busy}
      contentClassName="sm:max-w-xl"
      footer={<div className="flex w-full justify-end gap-2"><Button variant="outline" disabled={busy} onClick={close}>取消</Button><Button disabled={busy || !files.length} onClick={() => void submit()}>{busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}开始导入</Button></div>}
    >
      <input ref={fileRef} type="file" accept=".md,.markdown,text/markdown" multiple className="hidden" onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = "" }} />
      <input ref={setFolderRef} type="file" accept=".md,.markdown,text/markdown" multiple className="hidden" onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = "" }} />
      <div className="space-y-4 px-1 py-1">
        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}><FileText className="mr-2 size-4" />选择文件</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => folderRef.current?.click()}><FolderOpen className="mr-2 size-4" />选择目录</Button>
        </div>
        <div className="max-h-56 overflow-auto rounded-md border p-3 text-sm">
          {files.length ? files.map((item) => <div key={`${item.relativePath}:${item.file.lastModified}`} className="truncate py-1">{item.relativePath}</div>) : <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground"><UploadCloud className="size-5" />尚未选择文件</div>}
        </div>
        <TargetFolderSelect parentId={parentId} setParentId={setParentId} folders={folders} disabled={busy} />
      </div>
    </ModalShell>
  )
}

export function FeishuImportDialog({
  open,
  onOpenChange,
  knowledgeBaseId,
  defaultParentId = null,
  onCreated,
}: ImportDialogProps) {
  const { parentId, setParentId, folders } = useTargetFolders(open, knowledgeBaseId, defaultParentId)
  const [sourceUrl, setSourceUrl] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [connection, setConnection] = React.useState<{ configured: boolean; connected: boolean; displayName: string | null } | null>(null)

  React.useEffect(() => {
    if (!open) return
    void feishuImportApi.status().then((response) => setConnection(response.data)).catch(() => setConnection(null))
  }, [open])

  const submit = async () => {
    if (!sourceUrl.trim()) return toast.error("请输入飞书目录或文档链接")
    setBusy(true)
    try {
      const response = await documentImportApi.createBatch({
        knowledgeBaseId,
        parentId,
        sourceType: "feishu",
        input: { sourceUrl: sourceUrl.trim() },
      })
      toast.success("飞书导入批次已创建，目录会在后台分页读取")
      onCreated?.(response.data.batch.id)
      setSourceUrl("")
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建飞书导入任务失败")
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell
      open={open}
      onOpenChange={(next) => { if (!busy) onOpenChange(next) }}
      title="导入飞书目录或文档"
      description="支持飞书文档、知识库节点和云空间文件夹；目录会在后台分页发现，不会一次返回全部内容。"
      disableClose={busy}
      contentClassName="sm:max-w-xl"
      footer={<div className="flex w-full justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>取消</Button><Button disabled={busy || !connection?.connected || !sourceUrl.trim()} onClick={() => void submit()}>{busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}开始导入</Button></div>}
    >
      <div className="space-y-4 px-1 py-1">
        <div className="rounded-md border p-3 text-sm">
          {!connection?.configured ? "管理员尚未配置飞书应用" : connection.connected ? `已连接：${connection.displayName || "飞书账号"}` : <Button asChild variant="outline"><a href="/api/integrations/feishu/connect">连接飞书账号</a></Button>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="feishu-import-url">飞书链接</Label>
          <Input id="feishu-import-url" value={sourceUrl} disabled={busy} placeholder="https://example.feishu.cn/wiki/..." onChange={(event) => setSourceUrl(event.target.value)} />
        </div>
        <TargetFolderSelect parentId={parentId} setParentId={setParentId} folders={folders} disabled={busy} />
      </div>
    </ModalShell>
  )
}
