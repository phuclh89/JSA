import { useQuery } from '@tanstack/react-query';
import { Alert, Input, Table, Typography } from 'antd';
import { useState } from 'react';
import type { ApiClientError } from '../../services/api-client';
import { apiClient } from '../../services/api-client';
import './administration.css';
type Audit = Record<string, any>;
type Page = { items: Audit[]; total: number };
export function AccessAuditPage() {
  const [search, setSearch] = useState(new URLSearchParams(location.search).get('target') ?? ''),
    [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['access-audit', search, page],
    queryFn: () =>
      apiClient.get<Page>(
        `/access-administration/audit-events?search=${encodeURIComponent(search)}&offset=${(page - 1) * 25}&limit=25`,
      ),
  });
  return (
    <main className="admin-page">
      <header>
        <Typography.Text className="eyebrow">USER ACCESS ADMINISTRATION</Typography.Text>
        <Typography.Title level={1}>Access Audit</Typography.Title>
        <Typography.Paragraph type="secondary">
          Append-only evidence of access-administration changes. Audit rows are read-only.
        </Typography.Paragraph>
      </header>
      <Input.Search
        aria-label="Filter audit events"
        placeholder="Action or target username"
        defaultValue={search}
        onSearch={setSearch}
      />
      {q.error && <Alert type="error" message={(q.error as ApiClientError).message} />}
      <div className="admin-table-wrap">
        <Table
          rowKey="ID"
          loading={q.isLoading}
          dataSource={q.data?.items}
          pagination={{
            current: page,
            pageSize: 25,
            total: q.data?.total,
            onChange: setPage,
            showSizeChanger: false,
          }}
          columns={[
            { title: 'Time', dataIndex: 'OCCURRED_AT' },
            { title: 'Actor', dataIndex: 'ACTOR_USERNAME_SNAPSHOT' },
            { title: 'Action', dataIndex: 'ACTION_CODE' },
            {
              title: 'Target',
              render: (_, r) =>
                r.TARGET_USERNAME_SNAPSHOT || `${r.TARGET_TYPE} ${r.TARGET_ID ?? ''}`,
            },
            { title: 'Reason', dataIndex: 'REASON_TEXT', render: (v) => v || '—' },
            { title: 'Correlation ID', dataIndex: 'CORRELATION_ID' },
          ]}
        />
      </div>
    </main>
  );
}
