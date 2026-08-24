import type { Metadata } from "next"
import type { PublicArticleListItem } from "@/lib/api"
import { DEFAULT_SITE_DESCRIPTION, DEFAULT_SITE_LOGO_SRC, DEFAULT_SITE_NAME } from "@/lib/site-branding"
import { getPublicBaseUrl, toAbsolutePublicUrl } from "@/server/public-site/site-url"

type PublicMetadataOptions = {
    title: string
    description: string
    pathname: string
    index?: boolean
    type?: "website" | "article"
    tags?: string[]
    updatedAt?: string
}

function defaultDescription(siteName: string) {
    return `${siteName} 公开文章、知识与灵感更新。`
}

function cleanDescription(value: string, siteName: string) {
    return value.replace(/\s+/g, " ").trim().slice(0, 160) || defaultDescription(siteName)
}

function withSiteName(title: string, siteName: string) {
    return title === siteName ? siteName : `${title} | ${siteName}`
}

export function buildRootMetadata(
    siteName = DEFAULT_SITE_NAME,
    icon = { url: DEFAULT_SITE_LOGO_SRC, type: "image/jpeg" },
    siteDescription = DEFAULT_SITE_DESCRIPTION,
): Metadata {
    const baseUrl = getPublicBaseUrl()
    const description = cleanDescription(siteDescription, siteName)

    return {
        metadataBase: new URL(baseUrl),
        title: {
            default: siteName,
            template: `%s | ${siteName}`,
        },
        description,
        icons: {
            icon: [icon],
        },
        alternates: {
            canonical: toAbsolutePublicUrl("/", baseUrl),
            types: {
                "application/atom+xml": toAbsolutePublicUrl("/atom.xml", baseUrl),
                "application/rss+xml": toAbsolutePublicUrl("/rss.xml", baseUrl),
            },
        },
        openGraph: {
            title: siteName,
            description,
            url: toAbsolutePublicUrl("/", baseUrl),
            siteName,
            locale: "zh_CN",
            type: "website",
        },
        twitter: {
            card: "summary",
            title: siteName,
            description,
        },
    }
}

export function buildPublicMetadata({
    title,
    description,
    pathname,
    index = true,
    type = "website",
    tags,
    updatedAt,
}: PublicMetadataOptions, siteName = DEFAULT_SITE_NAME): Metadata {
    const baseUrl = getPublicBaseUrl()
    const canonical = toAbsolutePublicUrl(pathname, baseUrl)
    const normalizedTitle = withSiteName(title, siteName)
    const normalizedDescription = cleanDescription(description, siteName)

    return {
        metadataBase: new URL(baseUrl),
        title: title === siteName ? { absolute: siteName } : title,
        description: normalizedDescription,
        alternates: {
            canonical,
            types: {
                "application/atom+xml": toAbsolutePublicUrl("/atom.xml", baseUrl),
                "application/rss+xml": toAbsolutePublicUrl("/rss.xml", baseUrl),
            },
        },
        openGraph: {
            title: normalizedTitle,
            description: normalizedDescription,
            url: canonical,
            siteName,
            type,
            locale: "zh_CN",
            ...(type === "article" && updatedAt ? { modifiedTime: updatedAt, tags } : {}),
        },
        twitter: {
            card: "summary",
            title: normalizedTitle,
            description: normalizedDescription,
        },
        robots: index
            ? { index: true, follow: true }
            : { index: false, follow: false, googleBot: { index: false, follow: false } },
    }
}

export function buildStaticPublicPageMetadata(pathname: string, siteName = DEFAULT_SITE_NAME): Metadata {
    if (pathname === "/tags") {
        return buildPublicMetadata({
            title: "标签",
            description: `按标签浏览 ${siteName} 公开文章。`,
            pathname,
        }, siteName)
    }

    if (pathname === "/about") {
        return buildPublicMetadata({
            title: "关于",
            description: "了解 CiZai 的个人介绍、技术栈与创作方向。",
            pathname,
        }, siteName)
    }

    if (pathname === "/graph") {
        return buildPublicMetadata({
            title: "全站星图",
            description: "把公开文章、分类、标签以及 AI 抽取的概念与实体连成一张可交互的点群星图。",
            pathname,
        }, siteName)
    }

    if (pathname === "/projects") {
        return buildPublicMetadata({
            title: "开源项目",
            description: "CiZai 做过、参与过的一些开源项目。",
            pathname,
        }, siteName)
    }

    return buildPublicMetadata({
        title: siteName,
        description: defaultDescription(siteName),
        pathname: "/",
    }, siteName)
}

export function buildDashboardMetadata(pathname: string, siteName = DEFAULT_SITE_NAME): Metadata {
    return buildPublicMetadata({
        title: pathname.startsWith("/login") ? "登录" : "工作台",
        description: `${siteName} 私有工作台。`,
        pathname,
        index: false,
    }, siteName)
}

export function buildArticleMetadata(
    article: PublicArticleListItem | null,
    pathname: string,
    siteName = DEFAULT_SITE_NAME,
): Metadata {
    if (!article) {
        return buildPublicMetadata({
            title: "文章不可用",
            description: "这篇公开文章不存在、已撤销或尚未发布。",
            pathname,
            index: false,
            type: "article",
        }, siteName)
    }

    const index = !article.expired && !article.hasPassword
    return buildPublicMetadata({
        title: article.title,
        description: article.hasPassword ? "这篇文章需要访问密码。" : article.excerpt,
        pathname,
        index,
        type: "article",
        tags: article.tags,
        updatedAt: article.updatedAt,
    }, siteName)
}

export function resolvePublicRouteMetadata(
    pathSegments: readonly string[],
    articles: readonly PublicArticleListItem[],
    siteName = DEFAULT_SITE_NAME,
): Metadata {
    const [firstSegment, secondSegment] = pathSegments
    const pathname = pathSegments.length > 0 ? `/${pathSegments.join("/")}` : "/"

    if (!firstSegment) {
        return buildStaticPublicPageMetadata("/", siteName)
    }
    if (firstSegment === "tags" && pathSegments.length === 1) {
        return buildStaticPublicPageMetadata("/tags", siteName)
    }
    if (firstSegment === "about" && pathSegments.length === 1) {
        return buildStaticPublicPageMetadata("/about", siteName)
    }
    if (firstSegment === "graph" && pathSegments.length === 1) {
        return buildStaticPublicPageMetadata("/graph", siteName)
    }
    if (firstSegment === "projects" && pathSegments.length === 1) {
        return buildStaticPublicPageMetadata("/projects", siteName)
    }
    if (firstSegment === "demo" && pathSegments.length === 1) {
        return buildPublicMetadata({
            title: "演示模式",
            description: `免登录体验 ${siteName} 工作台：知识库、编辑器与 AI 助手，数据仅存于浏览器内存。`,
            pathname,
            index: false,
        }, siteName)
    }
    if (firstSegment === "p" && secondSegment) {
        const article = articles.find((item) => item.shareCode === secondSegment) ?? null
        return buildArticleMetadata(article, pathname, siteName)
    }
    if (firstSegment === "library"
        && pathSegments.length >= 2
        && pathSegments.length <= 3
        && pathSegments.slice(1).every((segment) => /^[1-9]\d*$/.test(segment))) {
        return buildPublicMetadata({
            title: "文章",
            description: `按知识库与目录浏览 ${siteName} 已发布内容。`,
            pathname,
        }, siteName)
    }
    if (firstSegment === "dashboard" || firstSegment === "login" || firstSegment === "auth") {
        return buildDashboardMetadata(pathname, siteName)
    }
    if (firstSegment === "b" && secondSegment) {
        // 阅后即焚链接：私密、一次性，绝不索引、也不泄露文章标题。
        return buildPublicMetadata({
            title: "私密链接",
            description: "这是一个阅后即焚的私密访问链接。",
            pathname,
            index: false,
        }, siteName)
    }

    return buildPublicMetadata({
        title: "页面未找到",
        description: `这个 ${siteName} 页面不存在或暂未公开。`,
        pathname,
        index: false,
    }, siteName)
}
