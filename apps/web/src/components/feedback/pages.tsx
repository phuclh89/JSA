import { Result } from 'antd';
import { Link } from 'react-router-dom';
export function AccessDeniedPage() {
  return (
    <Result
      status="403"
      title="Access Denied"
      subTitle="You do not have permission to view this page."
      extra={<Link to="/system/health">Return to health check</Link>}
    />
  );
}
export function NotFoundPage() {
  return (
    <Result
      status="404"
      title="Page Not Found"
      subTitle="The requested page does not exist."
      extra={<Link to="/system/health">Return to health check</Link>}
    />
  );
}
