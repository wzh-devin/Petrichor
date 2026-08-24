import { z } from "zod"
import { discoverFeishuDocuments, extractFeishuDocx, parseFeishuImportUrl } from "@/server/integrations/feishu-client"
import type { ImportSourceAdapter } from "@/server/kb/import-source-adapter"

const inputSchema = z.object({ sourceUrl: z.string().trim().url().max(2000) })

/** 飞书策略：目录在后台分页发现，项目只保存稳定 token，不保存 OAuth 凭证。 */
export const feishuImportAdapter: ImportSourceAdapter = {
    sourceType: "feishu",

    async prepare(rawInput) {
        const input = inputSchema.parse(rawInput)
        const target = parseFeishuImportUrl(input.sourceUrl)
        return {
            sourceName: target.kind === "docx" ? "飞书文档" : "飞书目录",
            sourceRef: input.sourceUrl,
            items: [],
        }
    },

    async *discover(batch, context) {
        if (!batch.sourceRef) throw new Error("飞书来源链接不存在")
        yield* discoverFeishuDocuments(batch.sourceRef, context)
    },

    async extract(item, context) {
        if (!item.sourceRef) throw new Error("飞书文档来源标识不存在")
        return {
            title: item.title,
            contentMd: await extractFeishuDocx(item.sourceRef, context),
            relativePath: item.relativePath,
            warnings: [],
        }
    },
}
