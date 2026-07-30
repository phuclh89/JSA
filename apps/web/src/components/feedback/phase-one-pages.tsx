import { Alert, Typography } from 'antd';

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
