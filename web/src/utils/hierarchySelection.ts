export type HierarchySelectionItem = {
  id: string | number
  name: string
  parent_id?: string | number | null
}

export function getHierarchyPathLabel<T extends HierarchySelectionItem>(
  items: T[],
  itemOrId: T | string | number | null | undefined,
  separator = ' / ',
) {
  if (!itemOrId) return ''

  const item =
    typeof itemOrId === 'object'
      ? itemOrId
      : items.find((candidate) => String(candidate.id) === String(itemOrId))

  if (!item) return ''
  if (!item.parent_id) return item.name

  const parent = items.find((candidate) => String(candidate.id) === String(item.parent_id))
  return parent ? `${parent.name}${separator}${item.name}` : item.name
}
