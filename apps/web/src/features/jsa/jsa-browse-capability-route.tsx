import { useQuery } from '@tanstack/react-query';
import { Alert, Spin } from 'antd';
import type { PropsWithChildren } from 'react';
import { Navigate } from 'react-router-dom';
import { browseApi } from './browse-api';

export function JsaBrowseCapabilityRoute({
  capability,
  children,
}: { capability: 'view' | 'favorite' } & PropsWithChildren) {
  const query = useQuery({
    queryKey: ['jsa-browse-capabilities'],
    queryFn: browseApi.capabilities,
  });
  if (query.isLoading) return <Spin aria-label="Loading Browse access" />;
  if (query.error)
    return <Alert type="error" showIcon message="Browse access could not be loaded" />;
  if (capability === 'favorite' && !query.data?.favoriteConfigured)
    return (
      <Alert
        type="warning"
        showIcon
        message="Favorites are not configured"
        description={query.data?.unavailableReason}
      />
    );
  return query.data?.[capability] ? children : <Navigate to="/access-denied" replace />;
}
