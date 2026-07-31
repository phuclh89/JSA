import { useQuery } from '@tanstack/react-query';
import type { TranslationListItem } from '@jsams/shared-types';
import { Alert, Empty, Input, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { ApiClientError } from '../../services/api-client';
import { translationApi } from './translation-api';
import './translation.css';

const kinds = ['tasks', 'review', 'published', 'outdated'] as const;
const labels = {
  tasks: 'My Translation Tasks',
  review: 'STC Review',
  published: 'Published',
  outdated: 'Outdated',
};

export function TranslationWorkspacePage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const kind = kinds.includes(requested as any) ? (requested as (typeof kinds)[number]) : 'tasks';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.get('pageSize')) || 25));
  const keyword = params.get('q')?.trim() || undefined;
  const status = params.get('status') || undefined;
  const sort = params.get('sort') || 'updatedAt';
  const direction = params.get('direction') === 'asc' ? 'asc' : 'desc';
  const list = useQuery({
    queryKey: ['translation-list', kind, page, pageSize, keyword, status, sort, direction],
    queryFn: () => translationApi.list(kind, { page, pageSize, keyword, status, sort, direction }),
  });
  const updateParams = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes))
      if (value) next.set(key, value);
      else next.delete(key);
    setParams(next);
  };
  const columns: ColumnsType<TranslationListItem> = [
    { title: 'JSA No.', dataIndex: 'jsaNumber', key: 'jsaNumber', width: 180, sorter: true },
    {
      title: 'Job title',
      dataIndex: 'jobTitle',
      key: 'jobTitle',
      ellipsis: true,
      sorter: true,
    },
    {
      title: 'Language',
      render: (_, item) => `${item.targetLanguageCode} — ${item.targetLanguageName}`,
      width: 190,
    },
    {
      title: 'Source Version',
      render: (_, item) => item.sourceVersionLabel ?? `Version ${item.sourceVersionNumber}`,
      width: 150,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      sorter: true,
      render: (value) => (
        <Tag color={value === 'OUTDATED' ? 'default' : value === 'PUBLISHED' ? 'green' : 'blue'}>
          {value.replaceAll('_', ' ')}
        </Tag>
      ),
      width: 150,
    },
    { title: 'Translator', dataIndex: 'translatorDisplayName', width: 180 },
    {
      title: 'Updated',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      sorter: true,
      render: (value) => new Date(value).toLocaleString(),
      width: 180,
    },
  ];
  return (
    <main className="translation-workspace">
      <Typography.Title level={1}>Translations</Typography.Title>
      <Tabs
        activeKey={kind}
        onChange={(tab) => setParams({ tab, page: '1', pageSize: String(pageSize) })}
        items={kinds.map((tab) => ({ key: tab, label: labels[tab] }))}
      />
      <Space wrap className="translation-list-filters">
        <Input.Search
          allowClear
          defaultValue={keyword}
          placeholder="Search JSA number or job title"
          onSearch={(value) => updateParams({ q: value.trim() || undefined, page: '1' })}
          style={{ width: 320 }}
        />
        <Select
          allowClear
          value={status}
          placeholder="Status"
          onChange={(value) => updateParams({ status: value, page: '1' })}
          style={{ width: 190 }}
          options={[
            'ASSIGNED',
            'IN_TRANSLATION',
            'STC_REVIEW',
            'RETURNED',
            'PUBLISHED',
            'OUTDATED',
          ].map((value) => ({ value, label: value.replaceAll('_', ' ') }))}
        />
      </Space>
      {list.error ? (
        <Alert type="error" showIcon message={(list.error as ApiClientError).message} />
      ) : null}
      <Table
        rowKey="translationId"
        loading={list.isLoading}
        dataSource={list.data?.items ?? []}
        columns={columns}
        scroll={{ x: 1100 }}
        pagination={{
          current: page,
          pageSize,
          total: list.data?.total ?? 0,
          showSizeChanger: true,
          pageSizeOptions: [10, 25, 50, 100],
          showTotal: (total) => `${total} translations`,
        }}
        locale={{ emptyText: <Empty description={`No ${labels[kind]}`} /> }}
        onChange={(pagination, _filters, sorter) => {
          const activeSorter = Array.isArray(sorter) ? sorter[0] : sorter;
          const field = typeof activeSorter?.columnKey === 'string' ? activeSorter.columnKey : sort;
          updateParams({
            page: String(pagination.current ?? 1),
            pageSize: String(pagination.pageSize ?? pageSize),
            sort: field,
            direction: activeSorter?.order === 'ascend' ? 'asc' : 'desc',
          });
        }}
        onRow={(item) => ({
          tabIndex: 0,
          onDoubleClick: () => navigate(`/jsa/translations/${item.translationId}`),
          onKeyDown: (event) => {
            if (event.key === 'Enter') navigate(`/jsa/translations/${item.translationId}`);
          },
        })}
      />
    </main>
  );
}
