import { Button, Result } from 'antd'
import { Link } from 'react-router-dom'

export default function ForbiddenPage() {
  return (
    <Result
      status="403"
      title="Access denied"
      subTitle="You don't have permission to view this page. Ask an administrator if you need access."
      extra={
        <Link to="/dashboard">
          <Button type="primary">Back to dashboard</Button>
        </Link>
      }
    />
  )
}
