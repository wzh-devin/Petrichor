import { describe, expect, it } from "vitest"

import {
  normalizeArticleMetadata,
  parseArticleFrontmatter,
  synchronizeArticleMetadata,
} from "./article-metadata"

describe("文章 frontmatter", () => {
  it("解析图片示例并从正文移除控制区", () => {
    const parsed = parseArticleFrontmatter(`---
title: Markdown 语法详解
date: 2026-08-24
tags:
  - Markdown
  - 写作
  - Obsidian
aliases:
  - Markdown 教程
  - Markdown 语法手册
---

# Markdown 语法详解

正文`)

    expect(parsed).toEqual({
      hasFrontmatter: true,
      contentMd: "# Markdown 语法详解\n\n正文",
      metadata: {
        title: "Markdown 语法详解",
        date: "2026-08-24",
        tags: ["Markdown", "写作", "Obsidian"],
        aliases: ["Markdown 教程", "Markdown 语法手册"],
      },
    })
  })

  it("没有 frontmatter 时保持原文", () => {
    const markdown = "# 标题\n\n正文"
    expect(parseArticleFrontmatter(markdown)).toEqual({
      hasFrontmatter: false,
      contentMd: markdown,
      metadata: {},
    })
  })

  it("拒绝未闭合、嵌套对象与错误保留字段类型", () => {
    expect(() => parseArticleFrontmatter("---\ntitle: 测试\n正文")).toThrow("缺少闭合")
    expect(() => parseArticleFrontmatter("---\nauthor:\n  name: Devin\n---\n正文")).toThrow("只支持文本或文本列表")
    expect(() => normalizeArticleMetadata({ tags: "Markdown" })).toThrow("tags")
    const oversizedList = Array.from({ length: 50 }, (_, index) => `${index}`.padEnd(500, "x"))
    expect(() => normalizeArticleMetadata({ a: oversizedList, b: oversizedList, c: oversizedList })).toThrow("64 KB")
  })

  it("同步保留字段", () => {
    expect(synchronizeArticleMetadata({ title: "旧标题", tags: ["旧"], date: "2026-08-24" }, "新标题", ["新"])).toEqual({
      title: "新标题",
      tags: ["新"],
      date: "2026-08-24",
    })
  })
})
