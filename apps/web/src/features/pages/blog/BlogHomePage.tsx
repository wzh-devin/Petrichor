"use client"

import * as React from "react"
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom"

import { BookOpen, ChevronLeft, ChevronRight, FileText, Folder } from "@/components/iconimate"
import { ArticleStatusBadges } from "@/features/pages/blog/ArticleStatusBadges"
import { RetypesetSiteFooter, RetypesetSiteHeader, RetypesetSiteNav } from "@/features/pages/blog/RetypesetSiteChrome"
import {
    publicArticleShareApi,
    publicLibraryApi,
    type PublicLibraryChildrenResponse,
    type PublicLibraryItem,
} from "@/lib/api"

const PAGE_SIZE = 20

const copy = {
    rootTitle: "文章",
    rootDescription: "按知识库与目录浏览已发布内容。",
    directory: "目录",
    article: "文章",
    empty: "当前目录暂无已发布内容。",
    loadFailed: "目录加载失败",
    retry: "重新加载",
    previous: "上一页",
    next: "下一页",
    repost: "转载",
    internalLink: "内部链接",
    expired: "已过期",
    passwordRequired: "需要访问密码",
    readingTime: (minutes: number) => `${minutes} min`,
    expiredTitle: (date: string | null) => (date ? `已过期：${date}` : "已过期"),
} as const

function parsePage(value: string | null) {
    const page = Number(value)
    return Number.isInteger(page) && page > 0 ? page : 1
}

function getDatePart(value: string) {
    return value.split("T")[0] || value
}

function isSpaArticleHref(href: string) {
    return href.startsWith("/p/")
}

function resolveError(error: unknown) {
    return (error as { response?: { data?: { msg?: string } } })?.response?.data?.msg
        || (error instanceof Error ? error.message : "")
        || "加载失败"
}

function PublicLibraryFrame({ children }: { children: React.ReactNode }) {
    return (
        <section id="articles" className="retypeset-home relative z-10 min-h-screen overflow-hidden">
            <div className="blog-home-grid pointer-events-none absolute inset-0 z-0" />
            <div className="relative z-10 mx-auto min-h-dvh w-full max-w-[51.462rem] px-[min(7.25vw,3.731rem)] py-10 lg:mx-[max(5.75rem,calc(50vw-34.25rem))] lg:my-20 lg:min-h-full lg:max-w-[min(calc(75vw-16rem),44rem)] lg:p-0">
                <RetypesetSiteHeader dockVisible />
                <RetypesetSiteNav activeSection="articles" dockVisible />
                <main id="article-index-list" className="mb-12">
                    {children}
                </main>
                <RetypesetSiteFooter dockVisible />
            </div>
        </section>
    )
}

function Breadcrumbs({ data }: { data: PublicLibraryChildrenResponse }) {
    if (data.breadcrumbs.length === 0) return null

    return (
        <nav aria-label="目录路径" className="retypeset-font-navbar mb-7 flex flex-wrap items-center gap-1.5 text-sm opacity-75">
            <Link className="retypeset-highlight-hover py-1" to="/">{copy.rootTitle}</Link>
            {data.breadcrumbs.map((item) => (
                <React.Fragment key={`${item.type}-${item.id}`}>
                    <ChevronRight className="size-3.5 shrink-0 opacity-50" aria-hidden="true" />
                    <Link
                        className="retypeset-highlight-hover max-w-56 truncate py-1"
                        to={item.type === "KNOWLEDGE_BASE"
                            ? `/library/${item.id}`
                            : `/library/${data.breadcrumbs[0]?.id}/${item.id}`}
                        aria-current={data.current.id === item.id ? "page" : undefined}
                    >
                        {item.name}
                    </Link>
                </React.Fragment>
            ))}
        </nav>
    )
}

function DirectoryItem({ item, knowledgeBaseId }: {
    item: Extract<PublicLibraryItem, { type: "KNOWLEDGE_BASE" | "FOLDER" }>
    knowledgeBaseId?: string
}) {
    const href = item.type === "KNOWLEDGE_BASE"
        ? `/library/${item.id}`
        : `/library/${knowledgeBaseId}/${item.id}`
    const Icon = item.type === "KNOWLEDGE_BASE" ? BookOpen : Folder

    return (
        <li className="border-b border-current/10 last:border-b-0">
            <Link
                to={href}
                className="group flex min-h-20 items-center gap-4 py-4 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-current/40"
            >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-current/15 opacity-80">
                    <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="retypeset-font-title retypeset-c-primary block break-words text-lg font-semibold leading-snug lg:text-xl">
                        {item.name}
                    </span>
                    <span className="retypeset-font-time mt-1 block text-xs opacity-65">
                        {item.type === "KNOWLEDGE_BASE" ? item.description?.trim() || "知识库" : copy.directory}
                    </span>
                </span>
                <ChevronRight className="size-4 shrink-0 opacity-45 transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </Link>
        </li>
    )
}

function ArticleItem({ item }: { item: Extract<PublicLibraryItem, { type: "ARTICLE" }> }) {
    const prefetch = React.useCallback(() => {
        if (!item.expired && !item.hasPassword && item.shareCode && isSpaArticleHref(item.href)) {
            void publicArticleShareApi.prefetchDetail(item.shareCode)
        }
    }, [item.expired, item.hasPassword, item.href, item.shareCode])
    const title = (
        <>
            {item.title}
            <ArticleStatusBadges article={item} copy={copy} formatDate={getDatePart} />
        </>
    )
    const linkClassName = "retypeset-highlight-hover break-words outline-none focus-visible:ring-2 focus-visible:ring-current/40"

    return (
        <li className="border-b border-current/10 py-6 last:border-b-0 lg:py-7">
            <article>
                <div className="mb-2 flex items-center gap-2 text-xs opacity-55">
                    <FileText className="size-3.5" aria-hidden="true" />
                    <span>{copy.article}</span>
                </div>
                <h2 className="retypeset-font-title retypeset-c-primary text-[1.35rem] font-bold leading-tight lg:text-[1.55rem]">
                    {isSpaArticleHref(item.href) ? (
                        <Link className={linkClassName} to={item.href} onMouseEnter={prefetch} onFocus={prefetch}>
                            {title}
                        </Link>
                    ) : (
                        <a className={linkClassName} href={item.href} onMouseEnter={prefetch} onFocus={prefetch}>
                            {title}
                        </a>
                    )}
                </h2>
                <p className="mt-3 line-clamp-3 break-words text-sm leading-6 opacity-80 lg:text-base lg:leading-7">
                    {item.excerpt}
                </p>
                <div className="retypeset-font-time mt-3 flex items-center gap-2 text-xs opacity-60 lg:text-sm">
                    <time dateTime={getDatePart(item.updatedAt)}>{getDatePart(item.updatedAt)}</time>
                    <span aria-hidden="true">·</span>
                    <span>{copy.readingTime(item.readingMinutes)}</span>
                </div>
            </article>
        </li>
    )
}

function LoadingState() {
    return (
        <div role="status" aria-label="目录加载中" className="animate-pulse border-t border-current/10">
            {["w-7/12", "w-9/12", "w-6/12"].map((width) => (
                <div key={width} className="border-b border-current/10 py-6">
                    <div className={`skeleton-bar h-6 ${width}`} />
                    <div className="skeleton-bar mt-3 h-4 w-full" />
                    <div className="skeleton-bar mt-2 h-4 w-4/5" />
                </div>
            ))}
        </div>
    )
}

export function BlogHomePage() {
    const { knowledgeBaseId, folderId } = useParams<{ knowledgeBaseId?: string; folderId?: string }>()
    const location = useLocation()
    const [searchParams] = useSearchParams()
    const pageNum = parsePage(searchParams.get("page"))
    const [reload, setReload] = React.useState(0)
    const requestKey = `${knowledgeBaseId ?? "root"}:${folderId ?? "root"}:${pageNum}:${reload}`
    const [result, setResult] = React.useState<{
        key: string
        data: PublicLibraryChildrenResponse | null
        error: string | null
    }>({ key: "", data: null, error: null })
    const loading = result.key !== requestKey
    const data = loading ? null : result.data
    const error = loading ? null : result.error
    const currentDescription = data?.current.type === "ROOT"
        ? copy.rootDescription
        : data?.current.type === "KNOWLEDGE_BASE"
            ? data.current.description?.trim()
            : null

    React.useEffect(() => {
        const controller = new AbortController()
        void publicLibraryApi.children({
            knowledgeBaseId,
            parentId: folderId,
            pageNum,
            pageSize: PAGE_SIZE,
            signal: controller.signal,
        }).then((response) => {
            setResult({ key: requestKey, data: response.data, error: null })
        }).catch((requestError: unknown) => {
            if (!controller.signal.aborted) {
                setResult({ key: requestKey, data: null, error: resolveError(requestError) })
            }
        })

        return () => controller.abort()
    }, [folderId, knowledgeBaseId, pageNum, requestKey])

    const pageHref = (page: number) => page === 1 ? location.pathname : `${location.pathname}?page=${page}`

    return (
        <PublicLibraryFrame>
            {data ? <Breadcrumbs data={data} /> : null}
            <header className="mb-8 lg:mb-10">
                <h1 className="retypeset-font-title retypeset-c-primary text-3xl font-bold leading-tight lg:text-4xl">
                    {data?.current.name || copy.rootTitle}
                </h1>
                {currentDescription ? (
                    <p className="mt-3 text-sm leading-6 opacity-70 lg:text-base">
                        {currentDescription}
                    </p>
                ) : null}
            </header>

            {loading ? <LoadingState /> : error ? (
                <div className="border-y border-current/10 py-12 text-center">
                    <p className="retypeset-c-primary font-semibold">{copy.loadFailed}</p>
                    <p className="mt-2 text-sm opacity-70">{error}</p>
                    <button
                        type="button"
                        className="retypeset-highlight-hover mt-5 py-1 text-sm font-semibold"
                        onClick={() => setReload((value) => value + 1)}
                    >
                        {copy.retry}
                    </button>
                </div>
            ) : !data || data.items.length === 0 ? (
                <p className="border-y border-current/10 py-12 text-center text-sm opacity-70">{copy.empty}</p>
            ) : (
                <ul className="border-t border-current/10">
                    {data.items.map((item) => item.type === "ARTICLE" ? (
                        <ArticleItem key={`article-${item.articleId}`} item={item} />
                    ) : (
                        <DirectoryItem key={`${item.type}-${item.id}`} item={item} knowledgeBaseId={knowledgeBaseId} />
                    ))}
                </ul>
            )}

            {data && (data.pageNum > 1 || data.hasMore) ? (
                <nav aria-label="目录分页" className="retypeset-font-navbar mt-8 flex items-center justify-between border-t border-current/10 pt-5 text-sm">
                    {data.pageNum > 1 ? (
                        <Link className="retypeset-highlight-hover inline-flex items-center gap-1 py-1" to={pageHref(data.pageNum - 1)}>
                            <ChevronLeft className="size-4" aria-hidden="true" />{copy.previous}
                        </Link>
                    ) : <span />}
                    <span className="opacity-55">{data.pageNum}</span>
                    {data.hasMore ? (
                        <Link className="retypeset-highlight-hover inline-flex items-center gap-1 py-1" to={pageHref(data.pageNum + 1)}>
                            {copy.next}<ChevronRight className="size-4" aria-hidden="true" />
                        </Link>
                    ) : <span />}
                </nav>
            ) : null}
        </PublicLibraryFrame>
    )
}
