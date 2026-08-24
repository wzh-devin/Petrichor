// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { toast } from "sonner"

import { MarkdownImportDialog } from "./SourceImportDialogs"

vi.mock("@/lib/api", () => ({
  documentImportApi: {},
  feishuImportApi: {},
  knowledgeBaseNodeApi: {
    tree: vi.fn().mockResolvedValue({ data: { roots: [] } }),
  },
  uploadApi: {},
}))

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("Markdown 导入弹窗", () => {
  it("弹窗打开后将第二个文件输入框设置为目录选择器", async () => {
    const { rerender } = render(
      <MarkdownImportDialog
        open={false}
        onOpenChange={() => {}}
        knowledgeBaseId="1"
      />,
    )

    rerender(
      <MarkdownImportDialog
        open
        onOpenChange={() => {}}
        knowledgeBaseId="1"
      />,
    )

    await waitFor(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]')
      expect(inputs).toHaveLength(2)
      expect(inputs[1].hasAttribute("webkitdirectory")).toBe(true)
    })
  })

  it("选择目录时将多个无效文件汇总为一次提示", () => {
    render(
      <MarkdownImportDialog
        open
        onOpenChange={() => {}}
        knowledgeBaseId="1"
      />,
    )

    const folderInput = document.querySelectorAll<HTMLInputElement>('input[type="file"]')[1]
    fireEvent.change(folderInput, {
      target: {
        files: [
          new File(["text"], "notes.txt", { type: "text/plain" }),
          new File(["image"], "cover.png", { type: "image/png" }),
          new File([], "empty.md", { type: "text/markdown" }),
        ],
      },
    })

    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(toast.error).toHaveBeenCalledWith("已跳过 3 个不符合要求的文件", {
      description: "请选择 .md 或 .markdown 格式的 Markdown 文件；Markdown 文件为空，无法导入",
    })
  })
})
