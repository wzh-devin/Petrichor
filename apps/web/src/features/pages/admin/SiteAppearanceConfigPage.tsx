"use client"

import * as React from "react"
import { IconPalette, Loader2, RefreshCw, Save, Trash2, Upload } from "@/components/iconimate"
import { toast } from "sonner"

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SiteLogo } from "@/components/site-logo"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useUploadFile } from "@/hooks/use-upload-file"
import { adminSiteAppearanceApi, uploadApi } from "@/lib/api"
import {
    DEFAULT_SITE_FONT_CONFIG,
    MAX_FONT_ASSETS,
    MAX_FONT_FILE_BYTES,
    type FontAsset,
    type SiteFontConfig,
} from "@/lib/font-config"
import {
    DEFAULT_SITE_DESCRIPTION,
    DEFAULT_SIDEBAR_TITLE,
    DEFAULT_SITE_LOGO_SRC,
    DEFAULT_SITE_NAME,
    MAX_SITE_LOGO_FILE_BYTES,
    SIDEBAR_TITLE_MAX_LENGTH,
    SITE_DESCRIPTION_MAX_LENGTH,
    SITE_NAME_MAX_LENGTH,
    type SiteLogoAsset,
} from "@/lib/site-branding"

const FONT_ACCEPT = ".ttf,.otf,.woff,.woff2"
const LOGO_ACCEPT = ".png,.jpg,.jpeg,.webp"

/** 从统一 API 错误结构中提取可直接展示的提示。 */
function resolveApiError(error: unknown, fallback: string) {
    return (
        (error as { response?: { data?: { msg?: string } } })?.response?.data?.msg ||
        (error instanceof Error ? error.message : "") ||
        fallback
    )
}

/** 管理全站名称、Logo 与字体配置。 */
export function SiteAppearanceConfigPage() {
    const [siteName, setSiteName] = React.useState(DEFAULT_SITE_NAME)
    const [siteDescription, setSiteDescription] = React.useState(DEFAULT_SITE_DESCRIPTION)
    const [sidebarTitle, setSidebarTitle] = React.useState(DEFAULT_SIDEBAR_TITLE)
    const [siteLogo, setSiteLogo] = React.useState<SiteLogoAsset | null>(null)
    const [siteLogoUrl, setSiteLogoUrl] = React.useState(DEFAULT_SITE_LOGO_SRC)
    const [pendingLogoFile, setPendingLogoFile] = React.useState<File | null>(null)
    const [pendingLogoUrl, setPendingLogoUrl] = React.useState("")
    const [resetSiteLogo, setResetSiteLogo] = React.useState(false)
    const [fontConfig, setFontConfig] = React.useState<SiteFontConfig>({
        ...DEFAULT_SITE_FONT_CONFIG,
        assets: [],
    })
    const [loading, setLoading] = React.useState(true)
    const [saving, setSaving] = React.useState(false)
    const [deleting, setDeleting] = React.useState(false)
    const [deleteTarget, setDeleteTarget] = React.useState<FontAsset | null>(null)
    const fontInputRef = React.useRef<HTMLInputElement>(null)
    const logoInputRef = React.useRef<HTMLInputElement>(null)
    const pendingLogoUrlRef = React.useRef("")
    const {
        isUploading: isFontUploading,
        progress: fontUploadProgress,
        uploadFile: uploadFontFile,
    } = useUploadFile()
    const {
        isUploading: isLogoUploading,
        progress: logoUploadProgress,
        uploadFile: uploadLogoFile,
    } = useUploadFile()

    React.useEffect(() => () => {
        if (pendingLogoUrlRef.current) URL.revokeObjectURL(pendingLogoUrlRef.current)
    }, [])

    const fetchConfig = React.useCallback(async () => {
        setLoading(true)
        try {
            const res = await adminSiteAppearanceApi.detail()
            setSiteName(res.data.siteName)
            setSiteDescription(res.data.siteDescription)
            setSidebarTitle(res.data.sidebarTitle)
            setSiteLogo(res.data.siteLogo)
            if (pendingLogoUrlRef.current) URL.revokeObjectURL(pendingLogoUrlRef.current)
            pendingLogoUrlRef.current = ""
            setPendingLogoFile(null)
            setPendingLogoUrl("")
            setResetSiteLogo(false)
            setFontConfig(res.data.fontConfig)
            if (res.data.siteLogo) {
                const logoRes = await uploadApi.presignGet(res.data.siteLogo.objectKey)
                setSiteLogoUrl(logoRes.data.url)
            } else {
                setSiteLogoUrl(DEFAULT_SITE_LOGO_SRC)
            }
        } catch (error) {
            toast.error(resolveApiError(error, "加载外观设置失败"))
        } finally {
            setLoading(false)
        }
    }, [])

    React.useEffect(() => {
        const timer = window.setTimeout(() => void fetchConfig(), 0)
        return () => window.clearTimeout(timer)
    }, [fetchConfig])

    /** 保存文本、字体和待处理 Logo，并在成功后刷新首屏配置。 */
    const handleSave = async () => {
        setSaving(true)
        let siteLogoObjectKey: string | null | undefined = resetSiteLogo ? null : undefined
        if (pendingLogoFile) {
            try {
                const uploaded = await uploadLogoFile(pendingLogoFile)
                siteLogoObjectKey = uploaded.key
            } catch {
                setSaving(false)
                return
            }
        }
        try {
            await adminSiteAppearanceApi.update({
                siteName,
                siteDescription,
                sidebarTitle,
                siteLogoObjectKey,
                fontConfig: {
                    interfaceFont: fontConfig.interfaceFont,
                    contentFont: fontConfig.contentFont,
                    monospaceFont: fontConfig.monospaceFont,
                },
            })
            toast.success("外观设置已保存，正在应用到全站")
            window.location.reload()
        } catch (error) {
            toast.error(resolveApiError(error, "保存外观设置失败"))
            setSaving(false)
        }
    }

    /** 选择 Logo 后只生成本地预览，统一在“保存设置”时上传。 */
    const handleLogoFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        event.target.value = ""
        if (!file) return

        const extension = file.name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0]
        if (!extension || !LOGO_ACCEPT.split(",").includes(extension)) {
            toast.error("仅支持 PNG、JPEG、WebP 图片")
            return
        }
        if (file.size === 0 || file.size > MAX_SITE_LOGO_FILE_BYTES) {
            toast.error("站点 Logo 不能为空且不能超过 5 MiB")
            return
        }
        if (pendingLogoUrlRef.current) URL.revokeObjectURL(pendingLogoUrlRef.current)
        const objectUrl = URL.createObjectURL(file)
        pendingLogoUrlRef.current = objectUrl
        setPendingLogoFile(file)
        setPendingLogoUrl(objectUrl)
        setResetSiteLogo(false)
    }

    /** 上传并登记字体文件。 */
    const handleFontFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        event.target.value = ""
        if (!file) return

        const extension = file.name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0]
        if (!extension || !FONT_ACCEPT.split(",").includes(extension)) {
            toast.error("仅支持 TTF、OTF、WOFF、WOFF2 字体文件")
            return
        }
        if (file.size > MAX_FONT_FILE_BYTES) {
            toast.error("字体文件不能超过 30 MiB")
            return
        }

        let uploaded
        try {
            uploaded = await uploadFontFile(file)
        } catch {
            return
        }

        try {
            const res = await adminSiteAppearanceApi.registerFont({
                name: file.name.replace(/\.[^.]+$/, ""),
                objectKey: uploaded.key,
            })
            setFontConfig(res.data.fontConfig)
            toast.success(`字体“${file.name}”已上传`)
        } catch (error) {
            toast.error(resolveApiError(error, "登记字体失败"))
        }
    }

    /** 删除不再使用的字体资源。 */
    const handleDelete = async () => {
        if (!deleteTarget) return
        setDeleting(true)
        try {
            const res = await adminSiteAppearanceApi.deleteFont(deleteTarget.id)
            setFontConfig(res.data.fontConfig)
            toast.success(`字体“${deleteTarget.name}”已删除`)
            setDeleteTarget(null)
        } catch (error) {
            toast.error(resolveApiError(error, "删除字体失败"))
        } finally {
            setDeleting(false)
        }
    }

    const uploadedOptions = fontConfig.assets.map((asset) => ({
        label: asset.name,
        value: `uploaded:${asset.id}`,
    }))
    const interfaceOptions = [
        { label: "系统无衬线字体", value: "system-sans" },
        { label: "系统衬线字体", value: "system-serif" },
        { label: "Maple Mono", value: "maple-mono" },
        ...uploadedOptions,
    ]
    const contentOptions = [
        { label: "跟随界面字体", value: "follow-interface" },
        ...interfaceOptions,
    ]
    const monospaceOptions = [
        { label: "系统等宽字体", value: "system-mono" },
        { label: "Maple Mono", value: "maple-mono" },
        ...uploadedOptions,
    ]
    const logoPreviewSrc = pendingLogoUrl || (resetSiteLogo ? DEFAULT_SITE_LOGO_SRC : siteLogoUrl)
    const hasCustomLogo = Boolean(pendingLogoFile || (!resetSiteLogo && siteLogo))

    return (
        <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <IconPalette className="size-5 text-muted-foreground" />
                        <h1 className="text-2xl font-semibold tracking-tight">外观设置</h1>
                    </div>
                    <p className="text-sm text-muted-foreground">统一管理全站站点标识与字体。</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchConfig}
                        disabled={loading || saving || isFontUploading || isLogoUploading}
                    >
                        {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                        刷新
                    </Button>
                    <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={loading || saving || isFontUploading || isLogoUploading || !siteName.trim() || !siteDescription.trim() || !sidebarTitle.trim()}
                    >
                        {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                        保存设置
                    </Button>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">站点标识</CardTitle>
                    <CardDescription>配置浏览器页面标题、全站 Logo 与工作台左侧栏显示名称。</CardDescription>
                </CardHeader>
                <CardContent className="divide-y">
                    <div className="grid gap-3 pb-5 sm:grid-cols-[1fr_18rem] sm:items-center">
                        <div className="space-y-1">
                            <Label htmlFor="site-logo" className="text-sm font-medium">站点 Logo</Label>
                            <p className="text-xs leading-5 text-muted-foreground">
                                同步用于浏览器标签、工作台侧栏和公开页面。建议上传正方形图片。
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <SiteLogo
                                src={logoPreviewSrc}
                                alt={`${sidebarTitle || siteName} Logo`}
                                size={48}
                                className="size-12 rounded-lg border"
                            />
                            <input
                                ref={logoInputRef}
                                id="site-logo"
                                type="file"
                                accept={LOGO_ACCEPT}
                                className="sr-only"
                                onChange={handleLogoFileChange}
                                disabled={loading || saving || isLogoUploading}
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => logoInputRef.current?.click()}
                                disabled={loading || saving || isLogoUploading}
                            >
                                {isLogoUploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                                {isLogoUploading ? `上传中 ${logoUploadProgress}%` : "选择图片"}
                            </Button>
                            {hasCustomLogo ? (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={loading || saving || isLogoUploading}
                                    onClick={() => {
                                        if (pendingLogoUrlRef.current) URL.revokeObjectURL(pendingLogoUrlRef.current)
                                        pendingLogoUrlRef.current = ""
                                        setPendingLogoFile(null)
                                        setPendingLogoUrl("")
                                        setResetSiteLogo(true)
                                    }}
                                >
                                    恢复默认
                                </Button>
                            ) : null}
                            {resetSiteLogo ? (
                                <span className="w-full text-xs text-muted-foreground">保存后恢复内置 Logo</span>
                            ) : pendingLogoFile ? (
                                <span className="w-full truncate text-xs text-muted-foreground" title={pendingLogoFile.name}>
                                    待保存：{pendingLogoFile.name}
                                </span>
                            ) : null}
                        </div>
                    </div>
                    <div className="grid gap-3 py-5 sm:grid-cols-[1fr_18rem] sm:items-center">
                        <div className="space-y-1">
                            <Label htmlFor="site-name" className="text-sm font-medium">站点名称</Label>
                            <p className="text-xs leading-5 text-muted-foreground">用于浏览器标签和页面元数据。</p>
                        </div>
                        <Input
                            id="site-name"
                            value={siteName}
                            maxLength={SITE_NAME_MAX_LENGTH}
                            disabled={loading || saving}
                            onChange={(event) => setSiteName(event.target.value)}
                        />
                    </div>
                    <div className="grid gap-3 py-5 sm:grid-cols-[1fr_18rem] sm:items-center">
                        <div className="space-y-1">
                            <Label htmlFor="site-description" className="text-sm font-medium">站点描述</Label>
                            <p className="text-xs leading-5 text-muted-foreground">
                                显示在公开页面站点标题下方，并用于首页描述元数据。
                            </p>
                        </div>
                        <Textarea
                            id="site-description"
                            value={siteDescription}
                            maxLength={SITE_DESCRIPTION_MAX_LENGTH}
                            rows={3}
                            disabled={loading || saving}
                            onChange={(event) => setSiteDescription(event.target.value)}
                        />
                    </div>
                    <div className="grid gap-3 pt-5 sm:grid-cols-[1fr_18rem] sm:items-center">
                        <div className="space-y-1">
                            <Label htmlFor="sidebar-title" className="text-sm font-medium">侧栏标题</Label>
                            <p className="text-xs leading-5 text-muted-foreground">显示在工作台左上角的 Logo 后方。</p>
                        </div>
                        <Input
                            id="sidebar-title"
                            value={sidebarTitle}
                            maxLength={SIDEBAR_TITLE_MAX_LENGTH}
                            disabled={loading || saving}
                            onChange={(event) => setSidebarTitle(event.target.value)}
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">字体</CardTitle>
                    <CardDescription>选择每类内容使用的字体；字体加载失败时会自动回退到系统字体。</CardDescription>
                </CardHeader>
                <CardContent className="divide-y">
                    <FontSettingRow
                        label="界面字体"
                        description="用于登录页、工作台、菜单、按钮和表单。"
                        value={fontConfig.interfaceFont}
                        options={interfaceOptions}
                        disabled={loading || saving}
                        onChange={(interfaceFont) => setFontConfig((current) => ({ ...current, interfaceFont: interfaceFont as SiteFontConfig["interfaceFont"] }))}
                    />
                    <FontSettingRow
                        label="正文字体"
                        description="用于编辑器、文章正文和公开阅读页面。"
                        value={fontConfig.contentFont}
                        options={contentOptions}
                        disabled={loading || saving}
                        onChange={(contentFont) => setFontConfig((current) => ({ ...current, contentFont: contentFont as SiteFontConfig["contentFont"] }))}
                    />
                    <FontSettingRow
                        label="等宽字体"
                        description="用于代码块、行内代码和技术字段。"
                        value={fontConfig.monospaceFont}
                        options={monospaceOptions}
                        disabled={loading || saving}
                        onChange={(monospaceFont) => setFontConfig((current) => ({ ...current, monospaceFont: monospaceFont as SiteFontConfig["monospaceFont"] }))}
                    />
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1.5">
                        <CardTitle className="text-base">已上传字体</CardTitle>
                        <CardDescription>
                            支持 TTF、OTF、WOFF、WOFF2，单个不超过 30 MiB。上传前请确认拥有 Web 嵌入授权。
                        </CardDescription>
                    </div>
                    <div>
                        <input
                            ref={fontInputRef}
                            type="file"
                            accept={FONT_ACCEPT}
                            className="sr-only"
                            onChange={handleFontFileChange}
                            disabled={isFontUploading || isLogoUploading || fontConfig.assets.length >= MAX_FONT_ASSETS}
                        />
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => fontInputRef.current?.click()}
                            disabled={isFontUploading || isLogoUploading || fontConfig.assets.length >= MAX_FONT_ASSETS}
                        >
                            {isFontUploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                            {isFontUploading ? `上传中 ${fontUploadProgress}%` : "上传字体"}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {isFontUploading ? (
                        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-muted" aria-label={`上传进度 ${fontUploadProgress}%`}>
                            <div className="h-full bg-primary transition-[width]" style={{ width: `${fontUploadProgress}%` }} />
                        </div>
                    ) : null}
                    {fontConfig.assets.length === 0 ? (
                        <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                            暂无上传字体。系统字体和 Maple Mono 可直接使用。
                        </div>
                    ) : (
                        <div className="divide-y rounded-lg border">
                            {fontConfig.assets.map((asset) => {
                                const active = isFontActive(fontConfig, asset.id)
                                return (
                                    <div key={asset.id} className="flex items-center gap-3 px-4 py-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <p className="truncate text-sm font-medium">{asset.name}</p>
                                                {active ? <Badge variant="secondary">使用中</Badge> : null}
                                            </div>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                {asset.format.toUpperCase()} · {formatBytes(asset.size)}
                                            </p>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="size-8"
                                            disabled={active}
                                            title={active ? "请先切换使用该字体的设置" : `删除 ${asset.name}`}
                                            onClick={() => setDeleteTarget(asset)}
                                        >
                                            <Trash2 className="size-4 text-destructive" />
                                            <span className="sr-only">删除 {asset.name}</span>
                                        </Button>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null) }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>删除字体？</AlertDialogTitle>
                        <AlertDialogDescription>
                            将从字体库和对象存储中删除“{deleteTarget?.name}”，此操作不可撤销。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" disabled={deleting} onClick={handleDelete}>
                            {deleting ? <Loader2 className="size-4 animate-spin" /> : null}
                            删除
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}

function FontSettingRow({
    label,
    description,
    value,
    options,
    disabled,
    onChange,
}: {
    label: string
    description: string
    value: string
    options: Array<{ label: string; value: string }>
    disabled: boolean
    onChange: (value: string) => void
}) {
    return (
        <div className="grid gap-3 py-5 first:pt-0 last:pb-0 sm:grid-cols-[1fr_18rem] sm:items-center">
            <div className="space-y-1">
                <Label className="text-sm font-medium">{label}</Label>
                <p className="text-xs leading-5 text-muted-foreground">{description}</p>
            </div>
            <Select value={value} onValueChange={onChange} disabled={disabled}>
                <SelectTrigger className="w-full" aria-label={label}>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    )
}

function isFontActive(config: SiteFontConfig, id: string) {
    const selection = `uploaded:${id}`
    return config.interfaceFont === selection || config.contentFont === selection || config.monospaceFont === selection
}

function formatBytes(bytes: number) {
    return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KiB` : `${(bytes / 1024 / 1024).toFixed(1)} MiB`
}
