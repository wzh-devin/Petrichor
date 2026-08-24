import type { Metadata } from "next"
import { loadPublicSiteAppearanceForFirstPaint } from "@/server/appearance/public-loader"
import { loadPublicSiteArticles } from "@/server/public-site/articles"
import { resolvePublicRouteMetadata } from "@/server/public-site/metadata"
import { SpaEntry } from "../spa-entry"

type CatchAllParams = {
    path?: string[]
}

type CatchAllPageProps = {
    params: Promise<CatchAllParams>
}

export async function generateMetadata({ params }: CatchAllPageProps): Promise<Metadata> {
    const resolvedParams = await params
    const pathSegments = resolvedParams.path ?? []
    const [appearance, articles] = await Promise.all([
        loadPublicSiteAppearanceForFirstPaint(),
        pathSegments[0] === "p"
            ? loadPublicSiteArticles({ includeNonIndexable: true })
            : Promise.resolve([]),
    ])

    return resolvePublicRouteMetadata(pathSegments, articles, appearance.siteName)
}

export default function CatchAllPage() {
    return <SpaEntry />
}
