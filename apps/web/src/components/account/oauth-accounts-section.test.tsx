// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { listAccounts, unlinkAccount, toastError, toastSuccess } = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  unlinkAccount: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({ listAccounts, unlinkAccount }),
}))

vi.mock("sonner", () => ({
  toast: { error: toastError, success: toastSuccess },
}))

import { OAuthAccountsSection } from "./oauth-accounts-section"

beforeEach(() => {
  listAccounts.mockReset()
  unlinkAccount.mockReset()
  toastError.mockReset()
  toastSuccess.mockReset()
})

afterEach(() => cleanup())

describe("OAuthAccountsSection", () => {
  it("确认后解除已绑定供应商并刷新状态", async () => {
    listAccounts
      .mockResolvedValueOnce({ data: [{ providerId: "github" }], error: null })
      .mockResolvedValueOnce({ data: [], error: null })
    unlinkAccount.mockResolvedValue({ data: { status: true }, error: null })

    render(<OAuthAccountsSection />)

    fireEvent.click(await screen.findByRole("button", { name: "解除 GitHub 绑定" }))
    expect(unlinkAccount).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "确认解除" }))

    await waitFor(() => expect(unlinkAccount).toHaveBeenCalledWith({ providerId: "github" }))
    await waitFor(() => expect(listAccounts).toHaveBeenCalledTimes(2))
    expect(toastSuccess).toHaveBeenCalledWith("已解除 GitHub 绑定")
    expect(screen.queryByRole("button", { name: "解除 GitHub 绑定" })).toBeNull()
  })

  it("解绑失败时保留绑定状态并提示重新登录", async () => {
    listAccounts.mockResolvedValue({ data: [{ providerId: "google" }], error: null })
    unlinkAccount.mockResolvedValue({ data: null, error: { message: "Session is not fresh" } })

    render(<OAuthAccountsSection />)
    fireEvent.click(await screen.findByRole("button", { name: "解除 Google 绑定" }))
    fireEvent.click(screen.getByRole("button", { name: "确认解除" }))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("解除绑定失败，请重新登录后再试"))
    expect(screen.getByRole("heading", { name: "解除 Google 绑定？" })).toBeTruthy()
    expect(listAccounts).toHaveBeenCalledTimes(1)
  })
})
