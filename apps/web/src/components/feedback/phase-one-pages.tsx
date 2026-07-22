import { Alert, Typography } from 'antd';

export function BrowseHomePage() {
  return (
    <>
      <Typography.Title level={2}>Browse</Typography.Title>
      <Typography.Paragraph>Choose an available area from the navigation.</Typography.Paragraph>
    </>
  );
}
export function SecurityFoundationPage() {
  return (
    <>
      <Typography.Title level={2}>Security Administration</Typography.Title>
      <Alert
        type="info"
        showIcon
        message="Phase 1 foundation"
        description="Identity, role, permission, and data-scope administration screens will be delivered in their approved business phase."
      />
    </>
  );
}
