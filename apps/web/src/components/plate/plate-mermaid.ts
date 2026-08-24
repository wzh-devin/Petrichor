import {
  CODE_DRAWING_KEY,
  type TCodeDrawingElement,
} from "@platejs/code-drawing"
import type { MdCode, MdRules } from "@platejs/markdown"
import { KEYS, type Descendant, type Value } from "platejs"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const readNodeText = (node: unknown): string => {
  if (!isRecord(node)) return ""
  if (typeof node.text === "string") return node.text
  if (!Array.isArray(node.children)) return ""
  return node.children.map(readNodeText).join("")
}

const normalizeMermaidNode = (node: Descendant): Descendant => {
  if (!isRecord(node)) return node

  if (
    node.type === KEYS.codeBlock
    && typeof node.lang === "string"
    && node.lang.trim().toLowerCase() === "mermaid"
  ) {
    const code = Array.isArray(node.children)
      ? node.children.map(readNodeText).join("\n")
      : ""
    return {
      type: CODE_DRAWING_KEY,
      data: {
        code,
        drawingMode: "Image",
        drawingType: "Mermaid",
      },
      children: [{ text: "" }],
    } as TCodeDrawingElement
  }

  if (!Array.isArray(node.children)) return node
  return {
    ...node,
    children: node.children.map((child) => normalizeMermaidNode(child as Descendant)),
  } as Descendant
}

/** 将 Markdown 或历史 JSON 中的 Mermaid 代码块统一转换为 Plate 图表节点。 */
export const normalizeMermaidCodeDrawings = (value: Value): Value =>
  value.map(normalizeMermaidNode) as Value

/** 将 Mermaid 图表节点还原为标准 fenced code block，保证保存与导出可移植。 */
export const serializeMermaidCodeDrawing = (node: TCodeDrawingElement): MdCode => ({
  type: "code",
  lang: "mermaid",
  value: node.data?.code ?? "",
})

export const mermaidMarkdownRules: MdRules = {
  [CODE_DRAWING_KEY]: {
    serialize: (node: TCodeDrawingElement) => serializeMermaidCodeDrawing(node),
  },
}

/** 从 Mermaid SVG 数据地址读取 viewBox，用于没有固有高度的百分比宽度 SVG。 */
export const readSvgDataUrlAspectRatio = (image: string): string | undefined => {
  if (!image.startsWith("data:image/svg+xml;base64,")) return undefined
  try {
    const svg = globalThis.atob(image.slice(image.indexOf(",") + 1))
    const viewBox = svg.match(/viewBox="[\d.-]+ [\d.-]+ ([\d.]+) ([\d.]+)"/)
    return viewBox ? `${viewBox[1]} / ${viewBox[2]}` : undefined
  } catch {
    return undefined
  }
}

const decodeSvgDataUrl = (image: string): string => {
  const binary = globalThis.atob(image.slice(image.indexOf(",") + 1))
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)))
}

const encodeSvgDataUrl = (svg: string): string => {
  const bytes = new TextEncoder().encode(svg)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `data:image/svg+xml;base64,${globalThis.btoa(binary)}`
}

/** 修复 Mermaid foreignObject 中不符合独立 SVG/XML 语法的裸换行标签。 */
export const normalizeMermaidSvgDataUrl = (image: string): string => {
  if (!image.startsWith("data:image/svg+xml;base64,")) return image
  try {
    const svg = decodeSvgDataUrl(image)
    const normalized = svg.replaceAll("<br>", "<br/>")
    return normalized === svg ? image : encodeSvgDataUrl(normalized)
  } catch {
    return image
  }
}
