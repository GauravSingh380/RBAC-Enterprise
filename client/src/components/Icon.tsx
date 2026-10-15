import { ICONS } from './icons'

/** Renders a sidebar icon by its name (as stored in the menus table). */
export function Icon({ name }: { name: string | null | undefined }) {
  const Component = ICONS[name ?? ''] ?? ICONS.dot
  return <Component />
}
