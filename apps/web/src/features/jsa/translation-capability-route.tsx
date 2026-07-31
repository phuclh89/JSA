import { useQuery } from '@tanstack/react-query';
import { Alert, Spin } from 'antd';
import type { PropsWithChildren } from 'react';
import { Navigate } from 'react-router-dom';
import type { TranslationCapabilities } from '@jsams/shared-types';
import { translationApi } from './translation-api';

export function TranslationCapabilityRoute({
  capability,
  children,
}: {
  capability: keyof Pick<
    TranslationCapabilities,
    'view' | 'assign' | 'translate' | 'approve' | 'print'
  >;
} & PropsWithChildren) {
  const query = useQuery({
    queryKey: ['translation-capabilities'],
    queryFn: translationApi.capabilities,
  });
  if (query.isLoading) return <Spin aria-label="Loading Translation access" />;
  if (query.error)
    return <Alert type="error" showIcon message="Translation access could not be loaded" />;
  if (!query.data?.configured)
    return (
      <Alert
        type="warning"
        showIcon
        message="Translations are not configured"
        description={query.data?.unavailableReason}
      />
    );
  return query.data[capability] ? children : <Navigate to="/access-denied" replace />;
}
