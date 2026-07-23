import { Alert,Spin } from 'antd';
import { useQuery } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { jsaApi } from './jsa-api';
export function JsaCapabilityRoute({capability,children}:PropsWithChildren<{capability:'view'|'create'|'edit'}>){const query=useQuery({queryKey:['jsa-capabilities'],queryFn:jsaApi.capabilities});if(query.isLoading)return <Spin aria-label="Loading JSA access"/>;if(query.isError||!query.data?.[capability])return <Alert showIcon type="warning" message="JSA action unavailable" description={query.data?.unavailableReason??'You do not have the required JSA capability.'}/>;return children;}
