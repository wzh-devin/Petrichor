import { parseDocument } from "yaml"

export const ARTICLE_METADATA_MAX_FIELDS = 32
export const ARTICLE_METADATA_MAX_KEY_LENGTH = 64
export const ARTICLE_METADATA_MAX_VALUE_LENGTH = 500
export const ARTICLE_METADATA_MAX_TITLE_LENGTH = 200
export const ARTICLE_METADATA_MAX_LIST_ITEMS = 50
export const ARTICLE_METADATA_MAX_BYTES = 64 * 1024
export const ARTICLE_FRONTMATTER_MAX_BYTES = 64 * 1024

export type ArticleMetadataValue = string | string[]
export type ArticleMetadata = Record<string, ArticleMetadataValue>

export type ParsedArticleFrontmatter = {
  contentMd: string
  metadata: ArticleMetadata
  hasFrontmatter: boolean
}

const RESERVED_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"])
const textByteLength = (value: string) => new TextEncoder().encode(value).byteLength

const normalizeMetadataKey = (rawKey: string) => {
  const key = rawKey.trim()
  if (!key) throw new Error("元数据字段名不能为空")
  if (key.length > ARTICLE_METADATA_MAX_KEY_LENGTH) {
    throw new Error(`元数据字段名不能超过 ${ARTICLE_METADATA_MAX_KEY_LENGTH} 个字符`)
  }
  if (RESERVED_OBJECT_KEYS.has(key)) throw new Error(`元数据字段名不受支持：${key}`)
  if (/\p{C}/u.test(key)) throw new Error(`元数据字段名包含控制字符：${key}`)
  return key
}

const normalizeMetadataText = (value: string, key: string) => {
  const text = value.trim()
  if (!text) throw new Error(`元数据“${key}”的值不能为空`)
  if (text.length > ARTICLE_METADATA_MAX_VALUE_LENGTH) {
    throw new Error(`元数据“${key}”的单项内容不能超过 ${ARTICLE_METADATA_MAX_VALUE_LENGTH} 个字符`)
  }
  return text
}

/**
 * 校验并规范化文章元数据，收敛 API、导入与配置页的共同信任边界。
 *
 * @param rawMetadata 待校验的未知元数据
 * @return 可安全持久化与渲染的元数据对象
 */
export const normalizeArticleMetadata = (rawMetadata: unknown): ArticleMetadata => {
  if (rawMetadata == null) return {}
  if (typeof rawMetadata !== "object" || Array.isArray(rawMetadata)) {
    throw new Error("文章元数据必须是键值对象")
  }

  const entries = Object.entries(rawMetadata)
  if (entries.length > ARTICLE_METADATA_MAX_FIELDS) {
    throw new Error(`文章元数据最多包含 ${ARTICLE_METADATA_MAX_FIELDS} 个字段`)
  }

  const normalizedEntries: Array<[string, ArticleMetadataValue]> = []
  const keySet = new Set<string>()
  for (const [rawKey, rawValue] of entries) {
    const key = normalizeMetadataKey(rawKey)
    if (keySet.has(key)) throw new Error(`元数据字段重复：${key}`)
    keySet.add(key)

    if (Array.isArray(rawValue)) {
      if (rawValue.length > ARTICLE_METADATA_MAX_LIST_ITEMS) {
        throw new Error(`元数据“${key}”最多包含 ${ARTICLE_METADATA_MAX_LIST_ITEMS} 项`)
      }
      if (rawValue.some((item) => typeof item !== "string")) {
        throw new Error(`元数据“${key}”只支持文本列表`)
      }
      const values = [...new Set(rawValue.map((item) => normalizeMetadataText(item, key)))]
      normalizedEntries.push([key, values])
      continue
    }

    if (typeof rawValue !== "string") {
      throw new Error(`元数据“${key}”只支持文本或文本列表`)
    }
    normalizedEntries.push([key, normalizeMetadataText(rawValue, key)])
  }

  const metadata = Object.fromEntries(normalizedEntries)
  if (metadata.title !== undefined && typeof metadata.title !== "string") {
    throw new Error("元数据“title”必须是文本")
  }
  if (typeof metadata.title === "string" && metadata.title.length > ARTICLE_METADATA_MAX_TITLE_LENGTH) {
    throw new Error(`元数据“title”不能超过 ${ARTICLE_METADATA_MAX_TITLE_LENGTH} 个字符`)
  }
  if (metadata.tags !== undefined && !Array.isArray(metadata.tags)) {
    throw new Error("元数据“tags”必须是文本列表")
  }
  if (textByteLength(JSON.stringify(metadata)) > ARTICLE_METADATA_MAX_BYTES) {
    throw new Error("文章元数据不能超过 64 KB")
  }
  return metadata
}

/**
 * 解析 Markdown 文件首部的 YAML frontmatter，并返回已移除控制区的正文。
 *
 * @param markdown 原始 Markdown 文本
 * @return 正文、规范化元数据与是否命中 frontmatter
 */
export const parseArticleFrontmatter = (markdown: string): ParsedArticleFrontmatter => {
  const normalizedMarkdown = markdown.replace(/\r\n?/g, "\n")
  const lines = normalizedMarkdown.split("\n")
  if (lines[0]?.trim() !== "---") {
    return { contentMd: markdown, metadata: {}, hasFrontmatter: false }
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---")
  if (closingIndex < 0) throw new Error("Markdown frontmatter 缺少闭合的 ---")

  const yamlSource = lines.slice(1, closingIndex).join("\n")
  if (textByteLength(yamlSource) > ARTICLE_FRONTMATTER_MAX_BYTES) {
    throw new Error("Markdown frontmatter 不能超过 64 KB")
  }

  const document = parseDocument(yamlSource, {
    schema: "failsafe",
    stringKeys: true,
    uniqueKeys: true,
    strict: true,
  })
  const issue = document.errors[0] ?? document.warnings[0]
  if (issue) throw new Error(`Markdown frontmatter 解析失败：${issue.message}`)

  const metadata = normalizeArticleMetadata(document.toJS({ maxAliasCount: 0 }))
  const contentMd = lines.slice(closingIndex + 1).join("\n").replace(/^\n+/, "")
  if (!contentMd.trim()) throw new Error("Markdown frontmatter 后没有可导入的正文内容")
  return { contentMd, metadata, hasFrontmatter: true }
}

/** 让元数据中的标题和标签跟随文章核心字段，避免公开展示出现过期副本。 */
export const synchronizeArticleMetadata = (
  metadata: ArticleMetadata,
  title: string,
  tags: string[],
): ArticleMetadata => {
  const synchronized = { ...metadata }
  if ("title" in synchronized) synchronized.title = title.trim()
  if ("tags" in synchronized) synchronized.tags = [...tags]
  return synchronized
}

/** 从数据库文本中读取元数据；历史或损坏数据安全降级为空对象。 */
export const parseStoredArticleMetadata = (metadataJson: string | null | undefined): ArticleMetadata => {
  if (!metadataJson?.trim()) return {}
  try {
    return normalizeArticleMetadata(JSON.parse(metadataJson))
  } catch {
    return {}
  }
}
