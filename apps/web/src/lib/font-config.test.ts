import { describe, expect, it } from "vitest"
import { DEFAULT_SITE_FONT_CONFIG, MAX_FONT_FILE_BYTES, parseSiteFontConfig, validateFontSelections } from "./font-config"

describe("字体配置", () => {
  it("允许单个字体文件最大 30 MiB", () => {
    expect(MAX_FONT_FILE_BYTES).toBe(30 * 1024 * 1024)
  })

  it("损坏配置回退到安全默认值", () => {
    expect(parseSiteFontConfig("not-json")).toEqual(DEFAULT_SITE_FONT_CONFIG)
  })

  it("只允许选择已经登记的上传字体", () => {
    const current = parseSiteFontConfig(JSON.stringify({
      assets: [{
        id: "00000000-0000-4000-8000-000000000000",
        name: "Demo",
        objectKey: "uploads/1/demo.woff2",
        format: "woff2",
        size: 100,
        createdAt: "2026-08-23T00:00:00.000Z",
      }],
      interfaceFont: "system-sans",
      contentFont: "follow-interface",
      monospaceFont: "maple-mono",
    }))

    expect(validateFontSelections({
      interfaceFont: "uploaded:00000000-0000-4000-8000-000000000000",
      contentFont: "follow-interface",
      monospaceFont: "system-mono",
    }, current).interfaceFont).toContain("uploaded:")
    expect(() => validateFontSelections({
      interfaceFont: "uploaded:11111111-1111-4111-8111-111111111111",
      contentFont: "follow-interface",
      monospaceFont: "system-mono",
    }, current)).toThrow("界面字体无效")
  })
})
