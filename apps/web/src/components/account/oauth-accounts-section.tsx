"use client"

import * as React from "react"
import { RefreshCw, Unlink } from "@/components/iconimate"
import { toast } from "sonner"

import {
  listLinkedOAuthProviders,
  oauthLoginAdapters,
  type OAuthLoginAdapter,
  type OAuthLoginProviderId,
  unlinkOAuthProvider,
} from "@/components/auth/oauth-login-adapters"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

/** 展示并管理当前用户的 GitHub、Google 等 OAuth 账号绑定。 */
export function OAuthAccountsSection() {
  const [linkedProviderIds, setLinkedProviderIds] = React.useState<OAuthLoginProviderId[]>([])
  const [loaded, setLoaded] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [unlinkTarget, setUnlinkTarget] = React.useState<OAuthLoginAdapter | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  /** 刷新当前用户的 OAuth 绑定状态。 */
  const fetchAccounts = React.useCallback(async () => {
    try {
      setLinkedProviderIds(await listLinkedOAuthProviders())
      setLoaded(true)
    } catch {
      toast.error("加载第三方账号失败，请稍后重试")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    // fetchAccounts 只在异步请求完成后更新状态，规则无法跨函数识别 await 边界。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchAccounts()
  }, [fetchAccounts])

  /** 确认后解除本站绑定，并立即刷新状态。 */
  const submitUnlink = async () => {
    if (!unlinkTarget) return
    setSubmitting(true)
    try {
      await unlinkOAuthProvider(unlinkTarget.id)
      setUnlinkTarget(null)
      toast.success(`已解除 ${unlinkTarget.label} 绑定`)
      await fetchAccounts()
    } catch {
      toast.error("解除绑定失败，请重新登录后再试")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-lg border px-4 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="text-sm font-medium">第三方账号</div>
          <div className="text-sm text-muted-foreground">
            解绑后当前登录不会退出，下次使用该方式登录时会重新绑定。
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setLoading(true)
            void fetchAccounts()
          }}
          disabled={loading || submitting}
        >
          <RefreshCw className="mr-1 h-4 w-4" />
          刷新
        </Button>
      </div>

      <div className="mt-4 space-y-3">
        {oauthLoginAdapters.map((adapter) => {
          const { Icon } = adapter
          const linked = linkedProviderIds.includes(adapter.id)
          return (
            <div
              key={adapter.id}
              className="flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {adapter.label}
                    {loaded ? <Badge variant={linked ? "secondary" : "outline"}>{linked ? "已绑定" : "未绑定"}</Badge> : null}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {!loaded ? "正在读取绑定状态…" : linked ? "已关联到当前账号" : "下次使用该方式登录时会重新绑定"}
                  </div>
                </div>
              </div>
              {loaded && linked ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setUnlinkTarget(adapter)}
                  disabled={submitting}
                  aria-label={`解除 ${adapter.label} 绑定`}
                >
                  <Unlink className="mr-1 h-4 w-4" />
                  解除绑定
                </Button>
              ) : null}
            </div>
          )
        })}
      </div>

      <AlertDialog open={unlinkTarget !== null} onOpenChange={(open) => !open && !submitting && setUnlinkTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>解除 {unlinkTarget?.label} 绑定？</AlertDialogTitle>
            <AlertDialogDescription>
              本操作只删除 Petrichor 内的账号关联，当前登录会话仍然有效。退出后再次使用该方式登录时，需要重新完成 OAuth 绑定。
              如果这是唯一登录方式，请先确认仍能访问该第三方账号，否则当前会话失效后可能无法找回账号。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>取消</AlertDialogCancel>
            <Button type="button" variant="destructive" onClick={() => void submitUnlink()} disabled={submitting}>
              {submitting ? "解除中..." : "确认解除"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
