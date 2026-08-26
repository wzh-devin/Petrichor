import { describe, expect, it } from "vitest"

import { resolveLoginRedirect } from "./login-redirect"

describe("resolveLoginRedirect", () => {
  it("保留站内路径及查询参数", () => {
    expect(resolveLoginRedirect("/dashboard/knowledge?page=2#article", "/dashboard"))
      .toBe("/dashboard/knowledge?page=2#article")
  })

  it("拒绝外部地址和协议相对地址", () => {
    expect(resolveLoginRedirect("https://evil.example", "/dashboard")).toBe("/dashboard")
    expect(resolveLoginRedirect("//evil.example/path", "/dashboard")).toBe("/dashboard")
    expect(resolveLoginRedirect("/\\evil.example/path", "/dashboard")).toBe("/dashboard")
  })
})
