// Renders a feature icon by its stored name (unknown names → a check mark).
import { CheckCircleOutlined } from '@ant-design/icons'
import { FEATURE_ICONS } from './iconMap'

export function FeatureIcon({ name }: { name?: string | null }) {
  const Icon = FEATURE_ICONS[name ?? ''] ?? CheckCircleOutlined
  return <Icon />
}
