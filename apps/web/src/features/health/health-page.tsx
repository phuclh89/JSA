import { ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Col, Row, Skeleton, Space, Statistic, Tag, Typography } from 'antd';
import type { HealthResponse } from '@jsams/shared-types';
import { apiClient } from '../../services/api-client';

function StatusTag({ up }: { up: boolean }) {
  return <Tag color={up ? 'success' : 'error'}>{up ? 'UP' : 'DOWN'}</Tag>;
}
export function HealthPage() {
  const query = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => apiClient.get<HealthResponse>('/health/ready', signal, [503]),
    retry: false,
  });
  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Typography.Title level={2}>System Health</Typography.Title>
        <Typography.Text type="secondary">
          Technical availability of the JSAMS application foundation.
        </Typography.Text>
      </div>
      {query.isLoading && (
        <Card aria-label="Loading health status">
          <Skeleton active />
        </Card>
      )}
      {query.isError && (
        <Alert
          type="error"
          showIcon
          message="API health check failed"
          description={query.error.message}
        />
      )}
      <Row gutter={16}>
        <Col span={8}>
          <Card>
            <Statistic title="Frontend" value="UP" valueStyle={{ color: '#389e0d' }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card
            title="API"
            extra={<StatusTag up={query.data?.checks.application.status === 'up'} />}
          >
            <Typography.Text>{query.data ? query.data.service : 'Unavailable'}</Typography.Text>
          </Card>
        </Col>
        <Col span={8}>
          <Card
            title="Oracle"
            extra={<StatusTag up={query.data?.checks.oracle?.status === 'up'} />}
          >
            <Typography.Text>
              {query.data?.checks.oracle?.durationMs !== undefined
                ? `${query.data.checks.oracle.durationMs} ms`
                : 'Unavailable'}
            </Typography.Text>
          </Card>
        </Col>
      </Row>
      {query.data?.status === 'degraded' && (
        <Alert type="warning" showIcon message="Some dependencies are unavailable" />
      )}
      <Space>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => void query.refetch()}
          loading={query.isFetching}
        >
          Refresh
        </Button>
        <Typography.Text type="secondary">
          Last check:{' '}
          {query.data ? new Date(query.data.timestamp).toLocaleString() : 'Not available'}
        </Typography.Text>
      </Space>
    </Space>
  );
}
