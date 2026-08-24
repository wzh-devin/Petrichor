import { CODE_DRAWING_KEY, type TCodeDrawingElement } from "@platejs/code-drawing"
import { MarkdownPlugin } from "@platejs/markdown"
import { createPlateEditor } from "platejs/react"
import { describe, expect, it } from "vitest"
import { KEYS, type Value } from "platejs"

import { MarkdownKit } from "@/components/editor/plugins/markdown-kit"
import {
  normalizeMermaidCodeDrawings,
  normalizeMermaidSvgDataUrl,
  readSvgDataUrlAspectRatio,
  serializeMermaidCodeDrawing,
} from "@/components/plate/plate-mermaid"

describe("Plate Mermaid 节点转换", () => {
  it("为百分比宽度 SVG 读取 viewBox 宽高比", () => {
    const image = `data:image/svg+xml;base64,${btoa(
      '<svg width="100%" viewBox="0 0 2061.228515625 1134"></svg>'
    )}`

    expect(readSvgDataUrlAspectRatio(image)).toBe("2061.228515625 / 1134")
    expect(readSvgDataUrlAspectRatio("data:image/png;base64,test")).toBeUndefined()
  })

  it("将 Mermaid foreignObject 的裸 br 修复为合法 SVG XML", () => {
    const image = `data:image/svg+xml;base64,${btoa(
      '<svg viewBox="0 0 100 50"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">first<br>second</div></foreignObject></svg>'
    )}`
    const normalized = normalizeMermaidSvgDataUrl(image)
    const svg = new TextDecoder().decode(
      Uint8Array.from(atob(normalized.split(",")[1]), (char) => char.charCodeAt(0))
    )

    expect(svg).toContain("first<br/>second")
    expect(svg).not.toContain("<br>")
  })

  it("Markdown 解析和序列化保持 Mermaid fenced code block", () => {
    const editor = createPlateEditor({ plugins: [...MarkdownKit] })
    const value = normalizeMermaidCodeDrawings(
      editor.getApi(MarkdownPlugin).markdown.deserialize(
        "```mermaid\nflowchart LR\nA --> B\n```"
      )
    )

    expect(value[0]).toMatchObject({
      type: CODE_DRAWING_KEY,
      data: { code: "flowchart LR\nA --> B", drawingMode: "Image" },
    })
    expect(
      editor.getApi(MarkdownPlugin).markdown.serialize({ value })
    ).toContain("```mermaid\nflowchart LR\nA --> B\n```")
  })

  it("递归转换 Mermaid 代码块并保留其他语言代码块", () => {
    const value = [
      {
        type: "blockquote",
        children: [
          {
            type: KEYS.codeBlock,
            lang: "Mermaid",
            children: [
              { type: KEYS.codeLine, children: [{ text: "flowchart LR" }] },
              { type: KEYS.codeLine, children: [{ text: "A --> B" }] },
            ],
          },
        ],
      },
      {
        type: KEYS.codeBlock,
        lang: "typescript",
        children: [{ type: KEYS.codeLine, children: [{ text: "const ok = true" }] }],
      },
    ] as Value

    const normalized = normalizeMermaidCodeDrawings(value)

    expect(normalized[0]).toMatchObject({
      children: [{
        type: CODE_DRAWING_KEY,
        data: {
          code: "flowchart LR\nA --> B",
          drawingMode: "Image",
          drawingType: "Mermaid",
        },
      }],
    })
    expect(normalized[1]).toEqual(value[1])
  })

  it("序列化时恢复 Mermaid fenced code block", () => {
    const node = {
      type: CODE_DRAWING_KEY,
      data: {
        code: "sequenceDiagram\nA->>B: hello",
        drawingMode: "Image",
        drawingType: "Mermaid",
      },
      children: [{ text: "" }],
    } as TCodeDrawingElement

    expect(serializeMermaidCodeDrawing(node)).toEqual({
      type: "code",
      lang: "mermaid",
      value: "sequenceDiagram\nA->>B: hello",
    })
  })
})
