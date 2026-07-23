import { Alert, Spin } from 'antd';
import { useQuery } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { Navigate } from 'react-router-dom';
import { workflowApi, type WorkflowCapabilities } from './workflow-api';
export function WorkflowCapabilityRoute({
  capability,
  children,
}: { capability: keyof Pick<WorkflowCapabilities, 'view' | 'admin'> } & PropsWithChildren) {
  const query = useQuery({
    queryKey: ['workflow-capabilities'],
    queryFn: workflowApi.capabilities,
  });
  if (query.isLoading) return <Spin aria-label="Loading workflow access" />;
  if (query.error)
    return <Alert type="error" showIcon message="Workflow access could not be loaded" />;
  if (!query.data?.configured)
    return (
      <Alert
        type="warning"
        showIcon
        message="Approval workflow is not configured"
        description={query.data?.unavailableReason}
      />
    );
  return query.data[capability] ? children : <Navigate to="/access-denied" replace />;
}
