import { useQuery } from '@tanstack/react-query';
import { Alert, Empty, Modal, Spin, Table, Tag } from 'antd';
import type { JsaVersionHistoryItem } from '@jsams/shared-types';
import { versioningApi } from './versioning-api';

export function VersionHistoryModal({
  jsaId,
  open,
  onClose,
}: {
  jsaId?: string;
  open: boolean;
  onClose: () => void;
}) {
  const query = useQuery({
    queryKey: ['jsa-version-history', jsaId],
    queryFn: () => versioningApi.history(jsaId!),
    enabled: open && Boolean(jsaId),
  });
  return (
    <Modal title="JSA Version history" open={open} footer={null} onCancel={onClose} width={900}>
      {query.isLoading ? (
        <Spin aria-label="Loading version history" />
      ) : query.error ? (
        <Alert type="error" showIcon message="Version history could not be loaded" />
      ) : (
        <Table<JsaVersionHistoryItem>
          rowKey="versionId"
          size="small"
          scroll={{ x: 760 }}
          dataSource={query.data}
          pagination={false}
          locale={{ emptyText: <Empty description="No versions are available" /> }}
          columns={[
            { title: 'Version', dataIndex: 'versionNumber', width: 90 },
            { title: 'Label', dataIndex: 'versionLabel', render: (value) => value || '—' },
            { title: 'Status', dataIndex: 'status', render: (value) => <Tag>{value}</Tag> },
            { title: 'Base Version ID', dataIndex: 'baseVersionId', render: (value) => value || '—' },
            { title: 'Created by', dataIndex: 'createdBy' },
            { title: 'Created', dataIndex: 'createdAt', width: 190 },
          ]}
        />
      )}
    </Modal>
  );
}
