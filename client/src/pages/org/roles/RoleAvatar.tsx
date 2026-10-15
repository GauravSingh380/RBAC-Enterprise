import { Avatar } from 'antd'
import { roleMeta } from './roleMeta'

export function RoleAvatar({ name, size = 36 }: { name: string; size?: number }) {
  const { icon: Icon, color } = roleMeta(name)
  return (
    <Avatar
      shape="square"
      size={size}
      style={{ background: `${color}22`, color, fontSize: size * 0.5, flexShrink: 0, borderRadius: size * 0.28 }}
      icon={<Icon />}
    />
  )
}
