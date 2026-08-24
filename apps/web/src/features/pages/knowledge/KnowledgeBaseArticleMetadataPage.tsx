import * as React from "react"
import { ChevronLeft, Plus, Save, Trash2 } from "@/components/iconimate"
import { useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"

import { resolveAxiosErrorMessage } from "@/components/knowledge/article-share-utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { knowledgeBaseArticleApi } from "@/lib/api"
import {
  ARTICLE_METADATA_MAX_FIELDS,
  normalizeArticleMetadata,
  type ArticleMetadata,
} from "@/lib/article-metadata"
import {
  dashboardRoutes,
  knowledgeBaseArticlePath,
  knowledgeBasePath,
} from "@/lib/dashboard-routes"

type MetadataField = {
  id: number
  key: string
  kind: "text" | "list"
  value: string
}

const fieldsSignature = (fields: MetadataField[]) => JSON.stringify(
  fields.map(({ key, kind, value }) => ({ key, kind, value })),
)

const resolveFieldKind = (key: string, kind: MetadataField["kind"]) => {
  if (key.trim() === "title") return "text"
  if (key.trim() === "tags") return "list"
  return kind
}

/** 将配置页输入转换为持久化元数据，并在保存前拒绝空字段与重复字段。 */
const buildMetadata = (fields: MetadataField[]): ArticleMetadata => {
  const metadata: ArticleMetadata = {}
  const keys = new Set<string>()
  for (const field of fields) {
    const key = field.key.trim()
    if (!key) throw new Error("请填写元数据字段名")
    if (keys.has(key)) throw new Error(`元数据字段重复：${key}`)
    keys.add(key)
    metadata[key] = resolveFieldKind(key, field.kind) === "list"
      ? field.value.split("\n").map((item) => item.trim()).filter(Boolean)
      : field.value
  }
  return normalizeArticleMetadata(metadata)
}

/** 文章元数据配置页：只更新文章绑定信息，不读取或提交正文。 */
export function KnowledgeBaseArticleMetadataPage() {
  const { knowledgeBaseId, articleId } = useParams()
  const navigate = useNavigate()
  const nextIdRef = React.useRef(0)
  const baselineRef = React.useRef("[]")
  const [articleTitle, setArticleTitle] = React.useState("文章元数据")
  const [articlePath, setArticlePath] = React.useState("")
  const [fields, setFields] = React.useState<MetadataField[]>([])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const dirty = fieldsSignature(fields) !== baselineRef.current
  const backPath = knowledgeBaseId && articleId
    ? knowledgeBaseArticlePath(knowledgeBaseId, articleId)
    : knowledgeBaseId
      ? knowledgeBasePath(knowledgeBaseId)
      : dashboardRoutes.knowledge

  React.useEffect(() => {
    if (!articleId) {
      setError("缺少文章 ID")
      setLoading(false)
      return
    }
    let canceled = false
    setLoading(true)
    setError(null)
    knowledgeBaseArticleApi.detail(articleId)
      .then(({ data }) => {
        if (canceled) return
        nextIdRef.current = 0
        const nextFields = Object.entries(data.metadata ?? {}).map(([key, value]) => ({
          id: nextIdRef.current++,
          key,
          kind: Array.isArray(value) ? "list" as const : "text" as const,
          value: Array.isArray(value) ? value.join("\n") : value,
        }))
        setArticleTitle(data.title)
        setArticlePath(data.path)
        setFields(nextFields)
        baselineRef.current = fieldsSignature(nextFields)
      })
      .catch((reason: unknown) => {
        if (!canceled) setError(resolveAxiosErrorMessage(reason, "加载文章元数据失败"))
      })
      .finally(() => {
        if (!canceled) setLoading(false)
      })
    return () => {
      canceled = true
    }
  }, [articleId])

  React.useEffect(() => {
    if (!dirty) return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [dirty])

  const updateField = (id: number, patch: Partial<MetadataField>) => {
    setFields((current) => current.map((field) => {
      if (field.id !== id) return field
      const next = { ...field, ...patch }
      return { ...next, kind: resolveFieldKind(next.key, next.kind) }
    }))
  }

  const handleBack = () => {
    if (dirty && !window.confirm("元数据尚未保存，确定离开吗？")) return
    navigate(backPath)
  }

  const handleSave = async () => {
    if (!articleId || saving) return
    try {
      setSaving(true)
      const metadata = buildMetadata(fields)
      const { data } = await knowledgeBaseArticleApi.updateMetadata({ articleId, metadata })
      nextIdRef.current = 0
      const nextFields = Object.entries(data.metadata).map(([key, value]) => ({
        id: nextIdRef.current++,
        key,
        kind: Array.isArray(value) ? "list" as const : "text" as const,
        value: Array.isArray(value) ? value.join("\n") : value,
      }))
      setArticleTitle(data.title)
      setFields(nextFields)
      baselineRef.current = fieldsSignature(nextFields)
      toast.success("文章元数据已保存")
    } catch (reason: unknown) {
      toast.error(resolveAxiosErrorMessage(reason, "保存文章元数据失败"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Button type="button" variant="ghost" className="-ml-3 mb-3" onClick={handleBack}>
              <ChevronLeft className="size-4" />
              返回文章
            </Button>
            <h1 className="truncate text-2xl font-semibold tracking-tight">{articleTitle}</h1>
            <p className="mt-1 truncate text-sm text-muted-foreground">{articlePath || "配置文章绑定的元数据信息"}</p>
          </div>
          <Button type="button" onClick={() => void handleSave()} disabled={loading || saving || !dirty}>
            <Save className="size-4" />
            {saving ? "保存中..." : "保存"}
          </Button>
        </div>

        <div className="mb-5 flex items-end justify-between gap-4 border-b pb-4">
          <div>
            <h2 className="text-base font-medium">文章元数据</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              title 会同步文章标题，tags 会同步文章标签；列表值每行一项。
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || fields.length >= ARTICLE_METADATA_MAX_FIELDS}
            onClick={() => setFields((current) => [
              ...current,
              { id: nextIdRef.current++, key: "", kind: "text", value: "" },
            ])}
          >
            <Plus className="size-4" />
            添加字段
          </Button>
        </div>

        {loading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">正在加载元数据...</p>
        ) : error ? (
          <div role="alert" className="border-y border-destructive/30 py-6 text-sm text-destructive">{error}</div>
        ) : fields.length === 0 ? (
          <div className="border-y py-12 text-center">
            <p className="text-sm font-medium">这篇文章还没有元数据</p>
            <p className="mt-1 text-sm text-muted-foreground">可手动添加，或在导入 Markdown 时使用 YAML frontmatter。</p>
          </div>
        ) : (
          <div className="divide-y border-y">
            {fields.map((field) => {
              const reservedKind = field.key.trim() === "title" || field.key.trim() === "tags"
              return (
                <div key={field.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_8rem_2fr_auto] sm:items-start">
                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium">字段名</span>
                    <Input
                      value={field.key}
                      placeholder="例如 date"
                      aria-label="元数据字段名"
                      onChange={(event) => updateField(field.id, { key: event.target.value })}
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium">类型</span>
                    <Select
                      value={field.kind}
                      disabled={reservedKind}
                      onValueChange={(value) => updateField(field.id, { kind: value as MetadataField["kind"] })}
                    >
                      <SelectTrigger className="w-full" aria-label="元数据类型">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">文本</SelectItem>
                        <SelectItem value="list">列表</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium">内容</span>
                    {field.kind === "list" ? (
                      <Textarea
                        value={field.value}
                        rows={3}
                        placeholder="每行一项"
                        aria-label={`${field.key || "未命名"}字段内容`}
                        onChange={(event) => updateField(field.id, { value: event.target.value })}
                      />
                    ) : (
                      <Input
                        value={field.value}
                        placeholder="填写内容"
                        aria-label={`${field.key || "未命名"}字段内容`}
                        onChange={(event) => updateField(field.id, { value: event.target.value })}
                      />
                    )}
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mt-6 text-muted-foreground hover:text-destructive"
                    aria-label={`删除${field.key || "未命名"}字段`}
                    onClick={() => setFields((current) => current.filter((item) => item.id !== field.id))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              )
            })}
          </div>
        )}

        <p className="mt-3 text-right text-xs text-muted-foreground">
          {fields.length} / {ARTICLE_METADATA_MAX_FIELDS} 个字段
        </p>
      </div>
    </div>
  )
}
