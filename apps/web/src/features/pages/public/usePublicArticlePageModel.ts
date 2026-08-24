import * as React from "react"
import type { MindElixirData } from "mind-elixir"

import type { PublicSharedArticleDetailResponse } from "@/lib/api"
import type { PublicArticlePageModel } from "@/features/pages/public/PublicArticlePageView"
import {
  buildFallbackMindmapData,
  scrollToHeading,
} from "@/features/pages/public/public-article-utils"
import { usePublicArticleActiveHeading } from "@/features/pages/public/usePublicArticleActiveHeading"
import { usePublicArticleInitialHashScroll } from "@/features/pages/public/usePublicArticleInitialHashScroll"
import { usePublicArticleScrollOffset } from "@/features/pages/public/usePublicArticleScrollOffset"
import { usePublicArticleShareDetail } from "@/features/pages/public/usePublicArticleShareDetail"
import { usePublicArticleToc } from "@/features/pages/public/usePublicArticleToc"

const SCROLL_OFFSET_EXTRA_PX = 16

function usePublicArticleDerivedFields(
  data: PublicSharedArticleDetailResponse | null,
  tocAll: PublicArticlePageModel["tocAll"],
) {
  const title = data?.title || "未命名文章"
  const tags = Array.isArray(data?.tags) ? data.tags : null
  const createdAt = data?.createdAt ?? null
  const updatedAt = data?.updatedAt ?? null
  const aiSummary = data?.aiSummary?.trim() || null
  const originalUrl = data?.originalUrl?.trim() || ""
  const originalAuthorName = data?.originalAuthorName?.trim() || ""
  const repostSource = data?.isRepost && originalUrl && originalAuthorName
    ? { originalUrl, originalAuthorName }
    : null

  const mindmapData = React.useMemo(() => {
    const fromApi = (data?.mindmapData ?? null) as MindElixirData | null
    if (fromApi) return fromApi
    if (!data) return null
    return buildFallbackMindmapData(data.title || "文章", tocAll)
  }, [data, tocAll])

  return {
    title,
    tags,
    createdAt,
    updatedAt,
    aiSummary,
    repostSource,
    mindmapData,
  }
}

export function usePublicArticlePageModel(shareCode: string | undefined): PublicArticlePageModel {
  const passwordId = React.useId()
  const [tab, setTab] = React.useState<PublicArticlePageModel["tab"]>("article")
  const { loading, error, data, needPassword, accessPassword, setAccessPassword, submitPassword } =
    usePublicArticleShareDetail(shareCode)
  const { tocAll, navToc, headingIds } = usePublicArticleToc(data?.contentMd, data?.tocJson)
  const { articleRef, scrollOffsetPx } = usePublicArticleScrollOffset(SCROLL_OFFSET_EXTRA_PX)
  const { activeHeadingId, setActiveHeadingId } = usePublicArticleActiveHeading({ tab, navToc, scrollOffsetPx })

  const handleScrollTo = React.useCallback((id: string) => {
    scrollToHeading(id)
    setActiveHeadingId(id)
  }, [setActiveHeadingId])
  usePublicArticleInitialHashScroll({
    shareCode,
    tab,
    contentMd: data?.contentMd,
    headingIds,
    onScrollTo: handleScrollTo,
  })
  const derived = usePublicArticleDerivedFields(data, tocAll)

  return {
    shareCode,
    hasArticleData: Boolean(data),
    loading, error, needPassword,
    passwordId,
    accessPassword, onAccessPasswordChange: setAccessPassword, onSubmitPassword: submitPassword,
    articleRef,
    title: derived.title, tags: derived.tags,
    createdAt: derived.createdAt, updatedAt: derived.updatedAt,
    aiSummary: derived.aiSummary,
    repostSource: derived.repostSource,
    tab, onTabChange: setTab,
    contentMd: data?.contentMd || "",
    contentJson: data?.contentJson ?? null,
    contentMetaJson: data?.contentMetaJson ?? null,
    tocAll, activeHeadingId, onTocClick: handleScrollTo,
    mindmapData: derived.mindmapData,
  }
}
