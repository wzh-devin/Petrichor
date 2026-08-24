import { describe, expect, it } from "vitest"

import {
  resolveTreeDropPosition,
  resolveTreeTargetIndex,
} from "@/features/pages/knowledge/knowledge-tree-dnd"

describe("knowledge tree drag and drop", () => {
  it("distinguishes sibling insertion from dropping into a folder", () => {
    const over = { top: 100, height: 40 }

    expect(resolveTreeDropPosition({ top: 96, height: 8 }, over, true)).toBe("before")
    expect(resolveTreeDropPosition({ top: 116, height: 8 }, over, true)).toBe("inside")
    expect(resolveTreeDropPosition({ top: 136, height: 8 }, over, true)).toBe("after")
    expect(resolveTreeDropPosition({ top: 116, height: 8 }, over, false)).toBe("after")
  })

  it("calculates the insertion index after removing the moving sibling", () => {
    const siblings = ["a", "b", "c", "d"]

    expect(resolveTreeTargetIndex(siblings, "a", "b", "after")).toBe(1)
    expect(resolveTreeTargetIndex(siblings, "d", "b", "before")).toBe(1)
    expect(resolveTreeTargetIndex(siblings, "b", "c", "before")).toBeNull()
  })
})
