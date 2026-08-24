import { eq } from "drizzle-orm"
import { decodeApiKey, encodeApiKey } from "@/server/ai/config-logic"
import { feishuConnections } from "@/server/db/schema"
import { badRequest } from "@/server/http/response"
import type { ImportContext, ImportItemDraft } from "@/server/kb/import-source-adapter"

const FEISHU_API = "https://open.feishu.cn"
const MAX_DISCOVERED_DOCUMENTS = 10_000

type FeishuTarget =
    | { kind: "docx"; token: string }
    | { kind: "wiki"; token: string }
    | { kind: "folder"; token: string }

interface FeishuConnectionToken {
    accessToken: string
}

interface FeishuApiResponse<T> {
    code?: number
    msg?: string
    data?: T
}

function isOfficialFeishuHost(hostname: string) {
    return hostname === "feishu.cn"
        || hostname.endsWith(".feishu.cn")
        || hostname === "larksuite.com"
        || hostname.endsWith(".larksuite.com")
}

export function parseFeishuImportUrl(rawUrl: string): FeishuTarget {
    let url: URL
    try {
        url = new URL(rawUrl)
    } catch {
        throw badRequest("飞书链接格式不正确")
    }
    if (url.protocol !== "https:" || !isOfficialFeishuHost(url.hostname.toLowerCase())) {
        throw badRequest("仅支持飞书或 Lark 官方 HTTPS 链接")
    }
    const parts = url.pathname.split("/").filter(Boolean)
    const docxIndex = parts.indexOf("docx")
    if (docxIndex >= 0 && parts[docxIndex + 1]) return { kind: "docx", token: parts[docxIndex + 1] }
    const wikiIndex = parts.indexOf("wiki")
    if (wikiIndex >= 0 && parts[wikiIndex + 1]) return { kind: "wiki", token: parts[wikiIndex + 1] }
    const folderIndex = parts.indexOf("folder")
    if (folderIndex >= 0 && parts[folderIndex + 1]) return { kind: "folder", token: parts[folderIndex + 1] }
    throw badRequest("仅支持飞书文档、知识库节点或云空间文件夹链接")
}

function feishuAppCredentials() {
    const appId = process.env.FEISHU_APP_ID?.trim()
    const appSecret = process.env.FEISHU_APP_SECRET?.trim()
    if (!appId || !appSecret) throw new Error("服务端尚未配置 FEISHU_APP_ID / FEISHU_APP_SECRET")
    return { appId, appSecret }
}

async function parseFeishuResponse<T>(response: Response): Promise<T> {
    const payload = await response.json() as FeishuApiResponse<T>
    if (!response.ok || (payload.code != null && payload.code !== 0) || !payload.data) {
        throw new Error(payload.msg || `飞书接口请求失败：HTTP ${response.status}`)
    }
    return payload.data
}

async function getAppAccessToken() {
    const { appId, appSecret } = feishuAppCredentials()
    const response = await fetch(`${FEISHU_API}/open-apis/auth/v3/app_access_token/internal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    })
    const payload = await response.json() as { code?: number; msg?: string; app_access_token?: string }
    if (!response.ok || payload.code !== 0 || !payload.app_access_token) {
        throw new Error(payload.msg || "获取飞书应用凭证失败")
    }
    return payload.app_access_token
}

async function loadAccessToken(context: ImportContext): Promise<FeishuConnectionToken> {
    const [connection] = await context.db.select().from(feishuConnections)
        .where(eq(feishuConnections.userId, context.userId)).limit(1)
    if (!connection) throw new Error("尚未连接飞书账号，请先授权")

    const accessToken = decodeApiKey(connection.accessTokenEncrypted)
    if (accessToken && (!connection.accessTokenExpiresAt || connection.accessTokenExpiresAt.getTime() > Date.now() + 60_000)) {
        return { accessToken }
    }
    const refreshToken = decodeApiKey(connection.refreshTokenEncrypted)
    if (!refreshToken) throw new Error("飞书授权已过期，请重新连接")

    const response = await fetch(`${FEISHU_API}/open-apis/authen/v1/oidc/refresh_access_token`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${await getAppAccessToken()}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ grant_type: "refresh_token", refresh_token: refreshToken }),
    })
    const data = await parseFeishuResponse<{
        access_token: string
        refresh_token?: string
        expires_in?: number
        refresh_expires_in?: number
    }>(response)
    const now = Date.now()
    await context.db.update(feishuConnections).set({
        accessTokenEncrypted: encodeApiKey(data.access_token),
        refreshTokenEncrypted: encodeApiKey(data.refresh_token || refreshToken),
        accessTokenExpiresAt: new Date(now + (data.expires_in ?? 7200) * 1000),
        refreshTokenExpiresAt: data.refresh_expires_in
            ? new Date(now + data.refresh_expires_in * 1000)
            : connection.refreshTokenExpiresAt,
        updatedAt: new Date(),
    }).where(eq(feishuConnections.id, connection.id))
    return { accessToken: data.access_token }
}

async function feishuGet<T>(path: string, accessToken: string): Promise<T> {
    const response = await fetch(`${FEISHU_API}${path}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    })
    return parseFeishuResponse<T>(response)
}

function docxItem(token: string, title: string, relativePath: string): ImportItemDraft {
    return {
        sourceType: "feishu",
        fileName: `${title || token}.md`,
        title: (title || "未命名飞书文档").slice(0, 200),
        sourceRef: `docx:${token}`,
        relativePath: `${relativePath || title || token}.md`,
    }
}

async function getDocxTitle(token: string, accessToken: string) {
    const data = await feishuGet<{ document?: { title?: string } }>(`/open-apis/docx/v1/documents/${encodeURIComponent(token)}`, accessToken)
    return data.document?.title?.trim() || "未命名飞书文档"
}

export async function *discoverFeishuDocuments(rawUrl: string, context: ImportContext): AsyncIterable<ImportItemDraft> {
    const target = parseFeishuImportUrl(rawUrl)
    const { accessToken } = await loadAccessToken(context)
    let discovered = 0
    const yieldChecked = (item: ImportItemDraft) => {
        discovered += 1
        if (discovered > MAX_DISCOVERED_DOCUMENTS) throw new Error("飞书目录文档超过 10000 个，请缩小导入范围")
        return item
    }

    if (target.kind === "docx") {
        const title = await getDocxTitle(target.token, accessToken)
        yield yieldChecked(docxItem(target.token, title, `${title}.md`))
        return
    }

    if (target.kind === "folder") {
        const queue: Array<{ token: string; path: string }> = [{ token: target.token, path: "" }]
        while (queue.length > 0) {
            const folder = queue.shift()
            if (!folder) break
            let pageToken = ""
            do {
                const query = new URLSearchParams({ folder_token: folder.token, page_size: "50" })
                if (pageToken) query.set("page_token", pageToken)
                const data = await feishuGet<{
                    files?: Array<{ token?: string; name?: string; type?: string }>
                    has_more?: boolean
                    next_page_token?: string
                }>(`/open-apis/drive/v1/files?${query}`, accessToken)
                for (const file of data.files ?? []) {
                    if (!file.token || !file.name) continue
                    const childPath = folder.path ? `${folder.path}/${file.name}` : file.name
                    if (file.type === "folder") queue.push({ token: file.token, path: childPath })
                    else if (file.type === "docx") yield yieldChecked(docxItem(file.token, file.name, `${childPath}.md`))
                }
                pageToken = data.has_more ? data.next_page_token || "" : ""
            } while (pageToken)
        }
        return
    }

    const root = await feishuGet<{
        node?: { space_id?: string; node_token?: string; obj_token?: string; obj_type?: string; title?: string }
    }>(`/open-apis/wiki/v2/spaces/get_node?token=${encodeURIComponent(target.token)}`, accessToken)
    const rootNode = root.node
    if (!rootNode?.space_id || !rootNode.node_token) throw new Error("无法读取飞书知识库节点")
    if (rootNode.obj_type === "docx" && rootNode.obj_token) {
        yield yieldChecked(docxItem(rootNode.obj_token, rootNode.title || "未命名飞书文档", `${rootNode.title || "未命名飞书文档"}.md`))
    }
    const queue: Array<{ token: string; path: string }> = [{ token: rootNode.node_token, path: rootNode.title || "" }]
    while (queue.length > 0) {
        const parent = queue.shift()
        if (!parent) break
        let pageToken = ""
        do {
            const query = new URLSearchParams({ page_size: "50", parent_node_token: parent.token })
            if (pageToken) query.set("page_token", pageToken)
            const data = await feishuGet<{
                items?: Array<{ node_token?: string; obj_token?: string; obj_type?: string; title?: string; has_child?: boolean }>
                has_more?: boolean
                page_token?: string
            }>(`/open-apis/wiki/v2/spaces/${encodeURIComponent(rootNode.space_id)}/nodes?${query}`, accessToken)
            for (const node of data.items ?? []) {
                if (!node.node_token) continue
                const title = node.title || "未命名飞书文档"
                const nodePath = parent.path ? `${parent.path}/${title}` : title
                if (node.obj_type === "docx" && node.obj_token) {
                    yield yieldChecked(docxItem(node.obj_token, title, `${nodePath}.md`))
                }
                if (node.has_child) queue.push({ token: node.node_token, path: nodePath })
            }
            pageToken = data.has_more ? data.page_token || "" : ""
        } while (pageToken)
    }
}

export async function extractFeishuDocx(sourceRef: string, context: ImportContext) {
    const [kind, token] = sourceRef.split(":", 2)
    if (kind !== "docx" || !token) throw new Error("飞书文档来源标识无效")
    const { accessToken } = await loadAccessToken(context)
    const data = await feishuGet<{ content?: string }>(
        `/open-apis/docx/v1/documents/${encodeURIComponent(token)}/raw_content`,
        accessToken,
    )
    const content = data.content?.trim()
    if (!content) throw new Error("飞书文档没有可导入的正文")
    return content
}

export { feishuAppCredentials, getAppAccessToken, parseFeishuResponse }
