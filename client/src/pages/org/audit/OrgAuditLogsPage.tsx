import { useAuth } from '../../../auth/useAuth'
import { auditLogsService } from '../../../services/organization.service'
import AuditLogsView from '../../shared/AuditLogsView'

export default function OrgAuditLogsPage() {
  const { organization } = useAuth()
  return (
    <AuditLogsView
      title="Audit log"
      description={`Every sensitive action in ${organization?.name}. Expand a row to see details.`}
      load={auditLogsService.list}
    />
  )
}
