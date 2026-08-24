import { getServerConfig } from "@/config/server"
import { buildLocalObjectUrlFromBase, isLocalObjectStorageEnabled } from "@/server/upload/local-storage"
import { createS3PresignedUrl } from "@/server/upload/s3-presign"

/** 为字体和站点 Logo 生成当前存储环境可访问的地址。 */
export function resolveAppearanceAssetUrl(objectKey: string, baseUrl: string) {
    if (isLocalObjectStorageEnabled()) {
        return buildLocalObjectUrlFromBase(baseUrl, objectKey)
    }
    const config = getServerConfig().s3
    if (!config) return ""
    return createS3PresignedUrl({
        ...config,
        expiresSeconds: config.downloadExpireSeconds,
        method: "GET",
        objectKey,
    })
}
