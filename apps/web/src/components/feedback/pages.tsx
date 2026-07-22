import { Result } from 'antd';
import { Link } from 'react-router-dom';
export function AccessDeniedPage() {
  return (
    <Result
      status="403"
      title="Access Denied"
      subTitle="Your account does not have access to this page. Contact an administrator if you believe this is incorrect."
      extra={<Link to="/browse">Return to an available page</Link>}
    />
  );
}
export function NotFoundPage() {
  return (
    <Result
      status="404"
      title="Page Not Found"
      subTitle="The requested page does not exist."
      extra={<Link to="/browse">Return to Browse</Link>}
    />
  );
}
