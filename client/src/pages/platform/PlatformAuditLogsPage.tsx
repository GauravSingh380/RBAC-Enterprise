import { platformService } from '../../services/platform.service'
import AuditLogsView from '../shared/AuditLogsView'

export default function PlatformAuditLogsPage() {
  return (
    <AuditLogsView
      title="Platform audit log"
      description="Every audited action across all organizations, plus logins and platform changes."
      load={platformService.auditLogs}
      showOrganization
    />
  )
}
