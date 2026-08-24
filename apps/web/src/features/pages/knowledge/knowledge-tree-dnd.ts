export type TreeDropPosition = "before" | "inside" | "after"

type DragRect = {
  height: number
  top: number
}

export function resolveTreeDropPosition(
  activeRect: DragRect | null | undefined,
  overRect: DragRect | null | undefined,
  canDropInside: boolean,
): TreeDropPosition {
  if (!activeRect || !overRect || overRect.height <= 0) {
    return canDropInside ? "inside" : "after"
  }

  const activeCenterY = activeRect.top + activeRect.height / 2
  const ratio = (activeCenterY - overRect.top) / overRect.height

  if (canDropInside && ratio >= 0.25 && ratio <= 0.75) {
    return "inside"
  }
  return ratio < 0.5 ? "before" : "after"
}

export function resolveTreeTargetIndex(
  siblingIds: string[],
  movingNodeId: string,
  overNodeId: string,
  position: Exclude<TreeDropPosition, "inside">,
): number | null {
  const overIndex = siblingIds.indexOf(overNodeId)
  if (overIndex < 0) {
    return null
  }

  let targetIndex = overIndex + (position === "after" ? 1 : 0)
  const activeIndex = siblingIds.indexOf(movingNodeId)
  if (activeIndex >= 0 && activeIndex < targetIndex) {
    targetIndex -= 1
  }

  return activeIndex === targetIndex ? null : targetIndex
}
