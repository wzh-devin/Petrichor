// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { signInSocial } = vi.hoisted(() => ({ signInSocial: vi.fn() }))

vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({ signIn: { social: signInSocial } }),
}))

import { LoginForm } from "./login-form"

const oauthOptions = {
  callbackURL: "/dashboard/knowledge",
  errorCallbackURL: "/login?redirect=%2Fdashboard%2Fknowledge",
}

beforeEach(() => {
  signInSocial.mockReset()
  signInSocial.mockResolvedValue({ data: {}, error: null })
})

afterEach(() => cleanup())

describe("LoginForm OAuth 登录", () => {
  it("将第三方登录入口放在主登录按钮下方", () => {
    render(
      <MemoryRouter>
        <LoginForm oauthOptions={oauthOptions} />
      </MemoryRouter>,
    )

    const loginButton = screen.getByRole("button", { name: "登录" })
    const githubButton = screen.getByRole("button", { name: "GitHub" })

    expect(loginButton.compareDocumentPosition(githubButton)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it("通过适配器向 Better Auth 传递 GitHub 和 Google 授权参数", async () => {
    render(
      <MemoryRouter>
        <LoginForm oauthOptions={oauthOptions} />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole("button", { name: "GitHub" }))
    await waitFor(() => expect(signInSocial).toHaveBeenCalledWith({
      provider: "github",
      ...oauthOptions,
    }))

    fireEvent.click(screen.getByRole("button", { name: "Google" }))
    await waitFor(() => expect(signInSocial).toHaveBeenLastCalledWith({
      provider: "google",
      ...oauthOptions,
    }))
  })

  it("OAuth 客户端失败时显示通用错误", async () => {
    signInSocial.mockResolvedValueOnce({
      data: null,
      error: { message: "Provider not found" },
    })
    render(
      <MemoryRouter>
        <LoginForm oauthOptions={oauthOptions} />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole("button", { name: "Google" }))

    expect(await screen.findByText("第三方登录失败，请稍后重试")).toBeTruthy()
    expect(screen.queryByText("Provider not found")).toBeNull()
  })
})
