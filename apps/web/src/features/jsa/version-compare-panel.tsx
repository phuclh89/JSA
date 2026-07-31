import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Empty, Select, Space, Spin, Switch, Tag, Typography } from 'antd';
import { useMemo, useState, type ReactNode } from 'react';
import type { JsaChangeType } from '@jsams/shared-types';
import type { ApiClientError } from '../../services/api-client';
import { versioningApi } from './versioning-api';
import './version-compare.css';

const changeColors: Partial<Record<JsaChangeType, string>> = {
  ADDED: 'green',
  MODIFIED: 'orange',
  DELETED: 'red',
  MOVED: 'blue',
};

export function VersionComparePanel({
  jsaId,
  workflowReview = false,
  defaultCollapsed = false,
  legend,
}: {
  jsaId: string;
  workflowReview?: boolean;
  defaultCollapsed?: boolean;
  legend?: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [changesOnly, setChangesOnly] = useState(true);
  const [type, setType] = useState<JsaChangeType | 'ALL'>('ALL');
  const [section, setSection] = useState('ALL');
  const query = useQuery({
    queryKey: ['jsa-version-compare', jsaId, workflowReview],
    queryFn: () =>
      workflowReview ? versioningApi.reviewCompare(jsaId) : versioningApi.compare(jsaId),
  });
  const sections = useMemo(
    () => [...new Set((query.data?.changes ?? []).map((change) => change.entityType))].sort(),
    [query.data],
  );
  const changes = useMemo(
    () =>
      (query.data?.changes ?? []).filter(
        (change) =>
          (!changesOnly || change.changeType !== 'UNCHANGED') &&
          (type === 'ALL' || change.changeType === type) &&
          (section === 'ALL' || change.entityType === section),
      ),
    [changesOnly, query.data, section, type],
  );
  if (collapsed)
    return (
      <Card
        className="version-compare version-compare--collapsed"
        title="Changes from Base"
        extra={
          <Button type="link" onClick={() => setCollapsed(false)}>
            Expand
          </Button>
        }
      />
    );
  if (query.isLoading)
    return (
      <Card
        className="version-compare"
        title="Changes from Base"
        extra={
          <Button type="link" onClick={() => setCollapsed(true)}>
            Collapse
          </Button>
        }
      >
        <Spin aria-label="Loading version comparison" />
      </Card>
    );
  if (query.error)
    return (
      <Card
        className="version-compare"
        title="Changes from Base"
        extra={
          <Button type="link" onClick={() => setCollapsed(true)}>
            Collapse
          </Button>
        }
      >
        <Alert
          type="error"
          showIcon
          message="Version comparison is unavailable"
          description={(query.error as ApiClientError).message}
          action={<a onClick={() => void query.refetch()}>Retry</a>}
        />
      </Card>
    );
  if (!query.data) return null;
  return (
    <Card
      className="version-compare"
      title="Changes from Base"
      extra={
        <Button type="link" onClick={() => setCollapsed(true)}>
          Collapse
        </Button>
      }
    >
      {legend}
      <div className="version-compare-summary" aria-label="Change summary">
        {(Object.entries(query.data.summary) as Array<[JsaChangeType, number]>).map(
          ([changeType, count]) => (
            <Tag key={changeType} color={changeColors[changeType]}>
              {changeType}: {count}
            </Tag>
          ),
        )}
      </div>
      <div className="version-compare-filters">
        <label>
          <span>Changes only</span>
          <Switch checked={changesOnly} onChange={setChangesOnly} />
        </label>
        <Select
          aria-label="Filter by change type"
          value={type}
          onChange={setType}
          options={['ALL', 'ADDED', 'MODIFIED', 'DELETED', 'MOVED', 'UNCHANGED'].map(
            (value) => ({ value, label: value }),
          )}
        />
        <Select
          aria-label="Filter by section"
          value={section}
          onChange={setSection}
          options={['ALL', ...sections].map((value) => ({ value, label: value }))}
        />
      </div>
      {changes.length ? (
        <div className="version-change-list">
          {changes.map((change) => (
            <article
              key={`${change.entityType}:${change.logicalKey}`}
              className={`version-change version-change--${change.changeType.toLowerCase()}`}
            >
              <header>
                <Space wrap>
                  <Tag>{change.entityType}</Tag>
                  <Tag color={changeColors[change.changeType]}>{change.changeType}</Tag>
                  <Typography.Text strong>{change.label}</Typography.Text>
                </Space>
              </header>
              {change.oldPosition !== undefined && (
                <Typography.Paragraph>
                  Position: <del>{change.oldPosition}</del> to <ins>{change.newPosition}</ins>
                </Typography.Paragraph>
              )}
              {change.fields.map((field) => (
                <dl key={field.field}>
                  <dt>{field.field}</dt>
                  <dd>
                    <span className="version-value-old">
                      <span className="version-value-label">Before</span>
                      {String(field.oldValue ?? '—')}
                    </span>
                    <span aria-hidden="true">→</span>
                    <span className="version-value-new">
                      <span className="version-value-label">Working</span>
                      {String(field.newValue ?? '—')}
                    </span>
                  </dd>
                </dl>
              ))}
            </article>
          ))}
        </div>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No changes match these filters" />
      )}
    </Card>
  );
}
