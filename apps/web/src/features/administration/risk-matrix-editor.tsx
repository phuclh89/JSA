import { PlusOutlined, SaveOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  MatrixCompletenessResult,
  RiskAxisLevel,
  RiskMatrixCell,
  RiskMatrixVersionDetail,
  RiskResultDefinition,
} from '@jsams/shared-types';
import {
  Alert,
  Button,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { ApiClientError } from '../../services/api-client';
import { apiClient } from '../../services/api-client';
import { MatrixPreview } from './matrix-preview';
import './administration.css';

type AxisDraft = Omit<RiskAxisLevel, 'id' | 'rowVersion'> & { ref: string };
type ResultDraft = Omit<RiskResultDefinition, 'id' | 'rowVersion'> & { ref: string };
type CellDraft = {
  ref: string;
  likelihoodRef: string;
  severityRef: string;
  riskResultRef: string;
  ratingCode: string | null;
  ratingValue: number | null;
  displayColor?: string;
  guidanceText?: string;
  active: boolean;
};
interface Draft {
  rowVersion: string;
  likelihoods: AxisDraft[];
  severities: AxisDraft[];
  results: ResultDraft[];
  cells: CellDraft[];
}
const newRef = (prefix: string) => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
export function RiskMatrixEditor() {
  const { id = '' } = useParams();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['risk-matrix-version', id],
    queryFn: () => apiClient.get<RiskMatrixVersionDetail>(`/risk-matrix-versions/${id}`),
  });
  const [draft, setDraft] = useState<Draft>();
  useEffect(() => {
    if (query.data) setDraft(toDraft(query.data));
  }, [query.data]);
  const save = useMutation({
    mutationFn: (value: Draft) =>
      apiClient.put<RiskMatrixVersionDetail, Draft>(
        `/risk-matrix-versions/${id}/configuration`,
        value,
      ),
    onSuccess: (value) => {
      client.setQueryData(['risk-matrix-version', id], value);
      setDraft(toDraft(value));
      void client.invalidateQueries({ queryKey: ['risk-matrix-versions'] });
    },
  });
  if (query.isLoading || !draft)
    return (
      <div className="session-loading">
        <Spin size="large" />
        <span>Loading Matrix Editor</span>
      </div>
    );
  if (query.error)
    return (
      <Alert
        type="error"
        showIcon
        message="Unable to load Matrix Version"
        description={(query.error as Error).message}
      />
    );
  const version = query.data!;
  const readOnly = version.immutable;
  const updateAxis = (type: 'likelihoods' | 'severities', ref: string, patch: Partial<AxisDraft>) =>
    setDraft((value) =>
      value
        ? {
            ...value,
            [type]: value[type].map((item) => (item.ref === ref ? { ...item, ...patch } : item)),
          }
        : value,
    );
  const removeAxis = (type: 'likelihoods' | 'severities', ref: string) =>
    setDraft((value) =>
      value
        ? {
            ...value,
            [type]: value[type].filter((item) => item.ref !== ref),
            cells: value.cells.filter((cell) =>
              type === 'likelihoods' ? cell.likelihoodRef !== ref : cell.severityRef !== ref,
            ),
          }
        : value,
    );
  const addAxis = (type: 'likelihoods' | 'severities') =>
    setDraft((value) =>
      value
        ? {
            ...value,
            [type]: [
              ...value[type],
              {
                ref: newRef(type),
                code: '',
                label: '',
                numericValue: null,
                displayOrder: value[type].length + 1,
                definition: '',
                active: true,
              },
            ],
          }
        : value,
    );
  const addResult = () =>
    setDraft((value) =>
      value
        ? {
            ...value,
            results: [
              ...value.results,
              {
                ref: newRef('result'),
                code: '',
                name: '',
                displayOrder: value.results.length + 1,
                prohibited: false,
                active: true,
              },
            ],
          }
        : value,
    );
  const generateMissing = () =>
    setDraft((value) => {
      if (!value || !value.results[0]) return value;
      const keys = new Set(value.cells.map((cell) => `${cell.likelihoodRef}:${cell.severityRef}`));
      const added = value.likelihoods.flatMap((likelihood) =>
        value.severities
          .filter((severity) => !keys.has(`${likelihood.ref}:${severity.ref}`))
          .map((severity) => ({
            ref: newRef('cell'),
            likelihoodRef: likelihood.ref,
            severityRef: severity.ref,
            riskResultRef: value.results[0]!.ref,
            ratingCode: '',
            ratingValue: null,
            active: true,
          })),
      );
      return { ...value, cells: [...value.cells, ...added] };
    });
  const preview = toPreview(version, draft);
  return (
    <section className="admin-page">
      <header className="matrix-editor-header">
        <div>
          <Typography.Title level={1}>
            {version.matrixName} — {version.versionCode}
          </Typography.Title>
          <Space wrap>
            <Tag>
              {version.dimension}×{version.dimension}
            </Tag>
            <Tag color={preview.completeness.complete ? 'green' : 'gold'}>
              {preview.completeness.complete ? 'Complete' : 'Incomplete'}
            </Tag>
            {readOnly ? (
              <Tag color="blue">Read-only effective/historical</Tag>
            ) : (
              <Tag>Editable draft</Tag>
            )}
          </Space>
        </div>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          disabled={readOnly}
          title={readOnly ? 'Assigned Matrix Versions are immutable' : undefined}
          loading={save.isPending}
          onClick={() => save.mutate(draft)}
        >
          Save configuration
        </Button>
      </header>
      {readOnly ? (
        <Alert
          type="info"
          showIcon
          message="This Matrix Version is immutable"
          description="Create a new Matrix Version for material changes."
        />
      ) : null}
      {save.error ? (
        <Alert
          type="error"
          showIcon
          message={(save.error as ApiClientError).message}
          description={(save.error as ApiClientError).details.map(String).join(' · ')}
        />
      ) : null}
      <Alert
        type={preview.completeness.complete ? 'success' : 'warning'}
        showIcon
        message={
          preview.completeness.complete
            ? 'Matrix is complete and may be assigned.'
            : `${preview.completeness.missingCells.length} combinations are missing. Assignment remains blocked.`
        }
      />
      <Tabs
        items={[
          {
            key: 'likelihood',
            label: 'Likelihood rows',
            children: (
              <AxisTable
                title="Likelihood"
                items={draft.likelihoods}
                readOnly={readOnly}
                onAdd={() => addAxis('likelihoods')}
                onUpdate={(ref, patch) => updateAxis('likelihoods', ref, patch)}
                onRemove={(ref) => removeAxis('likelihoods', ref)}
              />
            ),
          },
          {
            key: 'severity',
            label: 'Severity columns',
            children: (
              <AxisTable
                title="Severity"
                items={draft.severities}
                severity
                readOnly={readOnly}
                onAdd={() => addAxis('severities')}
                onUpdate={(ref, patch) => updateAxis('severities', ref, patch)}
                onRemove={(ref) => removeAxis('severities', ref)}
              />
            ),
          },
          {
            key: 'results',
            label: 'Risk Results',
            children: (
              <ResultTable
                items={draft.results}
                readOnly={readOnly}
                onAdd={addResult}
                onChange={(ref, patch) =>
                  setDraft((value) =>
                    value
                      ? {
                          ...value,
                          results: value.results.map((item) =>
                            item.ref === ref ? { ...item, ...patch } : item,
                          ),
                        }
                      : value,
                  )
                }
                onRemove={(ref) =>
                  setDraft((value) =>
                    value
                      ? {
                          ...value,
                          results: value.results.filter((item) => item.ref !== ref),
                          cells: value.cells.filter((cell) => cell.riskResultRef !== ref),
                        }
                      : value,
                  )
                }
              />
            ),
          },
          {
            key: 'cells',
            label: 'Matrix Cells',
            children: (
              <CellEditor
                draft={draft}
                readOnly={readOnly}
                onGenerate={generateMissing}
                onChange={(ref, patch) =>
                  setDraft((value) =>
                    value
                      ? {
                          ...value,
                          cells: value.cells.map((item) =>
                            item.ref === ref ? { ...item, ...patch } : item,
                          ),
                        }
                      : value,
                  )
                }
              />
            ),
          },
          {
            key: 'preview',
            label: 'Preview & legend',
            children: <MatrixPreview version={preview} />,
          },
        ]}
      />
    </section>
  );
}

function AxisTable({
  title,
  items,
  severity,
  readOnly,
  onAdd,
  onUpdate,
  onRemove,
}: {
  title: string;
  items: AxisDraft[];
  severity?: boolean;
  readOnly: boolean;
  onAdd: () => void;
  onUpdate: (ref: string, patch: Partial<AxisDraft>) => void;
  onRemove: (ref: string) => void;
}) {
  return (
    <div className="matrix-section">
      <div className="matrix-editor-actions">
        <Typography.Title level={2}>{title}</Typography.Title>
        <Button icon={<PlusOutlined />} disabled={readOnly} onClick={onAdd}>
          Add {title}
        </Button>
      </div>
      <Table
        className="matrix-editor-table"
        rowKey="ref"
        dataSource={items}
        pagination={false}
        scroll={{ x: 1100 }}
        columns={[
          {
            title: 'Displayed code',
            render: (_: unknown, r: AxisDraft) => (
              <Input
                aria-label={`${title} displayed code`}
                value={r.code}
                disabled={readOnly}
                onChange={(event) => onUpdate(r.ref, { code: event.target.value })}
              />
            ),
          },
          {
            title: 'Label',
            render: (_: unknown, r: AxisDraft) => (
              <Input
                aria-label={`${title} label`}
                value={r.label}
                disabled={readOnly}
                onChange={(event) => onUpdate(r.ref, { label: event.target.value })}
              />
            ),
          },
          {
            title: 'Optional numeric value',
            render: (_: unknown, r: AxisDraft) => (
              <InputNumber
                aria-label={`${title} optional numeric value`}
                value={r.numericValue}
                disabled={readOnly}
                onChange={(value) => onUpdate(r.ref, { numericValue: value })}
              />
            ),
          },
          {
            title: 'Display order',
            render: (_: unknown, r: AxisDraft) => (
              <InputNumber
                aria-label={`${title} display order`}
                min={1}
                value={r.displayOrder}
                disabled={readOnly}
                onChange={(value) => onUpdate(r.ref, { displayOrder: value ?? 1 })}
              />
            ),
          },
          {
            title: 'Definition',
            render: (_: unknown, r: AxisDraft) => (
              <Input.TextArea
                aria-label={`${title} definition`}
                value={r.definition}
                disabled={readOnly}
                autoSize
                onChange={(event) => onUpdate(r.ref, { definition: event.target.value })}
              />
            ),
          },
          ...(severity
            ? [
                {
                  title: 'People impact',
                  render: (_: unknown, r: AxisDraft) => (
                    <Input.TextArea
                      aria-label="People impact definition"
                      value={r.peopleDefinition}
                      disabled={readOnly}
                      autoSize
                      onChange={(event) =>
                        onUpdate(r.ref, { peopleDefinition: event.target.value })
                      }
                    />
                  ),
                },
                {
                  title: 'Asset impact',
                  render: (_: unknown, r: AxisDraft) => (
                    <Input.TextArea
                      aria-label="Asset impact definition"
                      value={r.assetDefinition}
                      disabled={readOnly}
                      autoSize
                      onChange={(event) => onUpdate(r.ref, { assetDefinition: event.target.value })}
                    />
                  ),
                },
                {
                  title: 'Environmental impact',
                  render: (_: unknown, r: AxisDraft) => (
                    <Input.TextArea
                      aria-label="Environmental impact definition"
                      value={r.environmentDefinition}
                      disabled={readOnly}
                      autoSize
                      onChange={(event) =>
                        onUpdate(r.ref, { environmentDefinition: event.target.value })
                      }
                    />
                  ),
                },
              ]
            : []),
          {
            title: 'Actions',
            render: (_: unknown, r: AxisDraft) => (
              <Popconfirm
                title={`Remove ${title}? Associated cells will also be removed.`}
                onConfirm={() => onRemove(r.ref)}
              >
                <Button danger disabled={readOnly}>
                  Remove
                </Button>
              </Popconfirm>
            ),
          },
        ]}
      />
    </div>
  );
}
function ResultTable({
  items,
  readOnly,
  onAdd,
  onChange,
  onRemove,
}: {
  items: ResultDraft[];
  readOnly: boolean;
  onAdd: () => void;
  onChange: (ref: string, patch: Partial<ResultDraft>) => void;
  onRemove: (ref: string) => void;
}) {
  return (
    <div className="matrix-section">
      <div className="matrix-editor-actions">
        <Typography.Title level={2}>Risk Results</Typography.Title>
        <Button icon={<PlusOutlined />} disabled={readOnly} onClick={onAdd}>
          Add Risk Result
        </Button>
      </div>
      <Table
        rowKey="ref"
        dataSource={items}
        pagination={false}
        scroll={{ x: 1200 }}
        columns={[
          {
            title: 'Stable result code',
            render: (_: unknown, r: ResultDraft) => (
              <Input
                aria-label="Stable Risk Result code"
                value={r.code}
                disabled={readOnly}
                onChange={(e) => onChange(r.ref, { code: e.target.value })}
              />
            ),
          },
          {
            title: 'Result name',
            render: (_: unknown, r: ResultDraft) => (
              <Input
                value={r.name}
                disabled={readOnly}
                onChange={(e) => onChange(r.ref, { name: e.target.value })}
              />
            ),
          },
          {
            title: 'Semantic meaning',
            render: (_: unknown, r: ResultDraft) => (
              <Input
                value={r.semanticCategory}
                disabled={readOnly}
                onChange={(e) => onChange(r.ref, { semanticCategory: e.target.value })}
              />
            ),
          },
          {
            title: 'Color metadata',
            render: (_: unknown, r: ResultDraft) => (
              <Input
                aria-label="Configured display color"
                value={r.displayColor}
                disabled={readOnly}
                placeholder="#d03238"
                onChange={(e) => onChange(r.ref, { displayColor: e.target.value })}
              />
            ),
          },
          {
            title: 'Guidance',
            render: (_: unknown, r: ResultDraft) => (
              <Input.TextArea
                value={r.guidanceText}
                disabled={readOnly}
                autoSize
                onChange={(e) => onChange(r.ref, { guidanceText: e.target.value })}
              />
            ),
          },
          {
            title: 'Order',
            render: (_: unknown, r: ResultDraft) => (
              <InputNumber
                min={1}
                value={r.displayOrder}
                disabled={readOnly}
                onChange={(value) => onChange(r.ref, { displayOrder: value ?? 1 })}
              />
            ),
          },
          {
            title: 'Actions',
            render: (_: unknown, r: ResultDraft) => (
              <Popconfirm
                title="Remove this Risk Result and its cells?"
                onConfirm={() => onRemove(r.ref)}
              >
                <Button danger disabled={readOnly}>
                  Remove
                </Button>
              </Popconfirm>
            ),
          },
        ]}
      />
    </div>
  );
}
function CellEditor({
  draft,
  readOnly,
  onGenerate,
  onChange,
}: {
  draft: Draft;
  readOnly: boolean;
  onGenerate: () => void;
  onChange: (ref: string, patch: Partial<CellDraft>) => void;
}) {
  const likelihood = new Map(draft.likelihoods.map((item) => [item.ref, item]));
  const severity = new Map(draft.severities.map((item) => [item.ref, item]));
  return (
    <div className="matrix-section">
      <div className="matrix-editor-actions">
        <div>
          <Typography.Title level={2}>Matrix Cells</Typography.Title>
          <Typography.Paragraph>
            Each displayed rating and Risk Result is explicitly configured. Axis position never
            calculates a result.
          </Typography.Paragraph>
        </div>
        <Button disabled={readOnly || draft.results.length === 0} onClick={onGenerate}>
          Generate missing combinations
        </Button>
      </div>
      <Table
        rowKey="ref"
        dataSource={draft.cells}
        pagination={{ pageSize: 25 }}
        scroll={{ x: 1200 }}
        columns={[
          {
            title: 'Likelihood code',
            render: (_: unknown, r: CellDraft) => (
              <strong>{likelihood.get(r.likelihoodRef)?.code}</strong>
            ),
          },
          {
            title: 'Severity code',
            render: (_: unknown, r: CellDraft) => (
              <strong>{severity.get(r.severityRef)?.code}</strong>
            ),
          },
          {
            title: 'Cell rating code',
            render: (_: unknown, r: CellDraft) => (
              <Input
                aria-label={`Rating for ${likelihood.get(r.likelihoodRef)?.code} and ${severity.get(r.severityRef)?.code}`}
                value={r.ratingCode ?? ''}
                disabled={readOnly}
                onChange={(e) => onChange(r.ref, { ratingCode: e.target.value })}
              />
            ),
          },
          {
            title: 'Optional numeric rating',
            render: (_: unknown, r: CellDraft) => (
              <InputNumber
                value={r.ratingValue}
                disabled={readOnly}
                onChange={(value) => onChange(r.ref, { ratingValue: value })}
              />
            ),
          },
          {
            title: 'Risk Result',
            render: (_: unknown, r: CellDraft) => (
              <Select
                aria-label="Risk Result"
                value={r.riskResultRef}
                disabled={readOnly}
                options={draft.results.map((item) => ({
                  value: item.ref,
                  label: `${item.code} — ${item.name}`,
                }))}
                onChange={(value) => onChange(r.ref, { riskResultRef: value })}
              />
            ),
          },
          {
            title: 'Cell color override',
            render: (_: unknown, r: CellDraft) => (
              <Input
                value={r.displayColor}
                disabled={readOnly}
                onChange={(e) => onChange(r.ref, { displayColor: e.target.value })}
              />
            ),
          },
          {
            title: 'Cell guidance override',
            render: (_: unknown, r: CellDraft) => (
              <Input.TextArea
                value={r.guidanceText}
                disabled={readOnly}
                autoSize
                onChange={(e) => onChange(r.ref, { guidanceText: e.target.value })}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
function toDraft(version: RiskMatrixVersionDetail): Draft {
  return {
    rowVersion: version.rowVersion,
    likelihoods: version.likelihoods.map(({ id, rowVersion, ...item }) => {
      void rowVersion;
      return { ref: id, ...item };
    }),
    severities: version.severities.map(({ id, rowVersion, ...item }) => {
      void rowVersion;
      return { ref: id, ...item };
    }),
    results: version.results.map(({ id, rowVersion, ...item }) => {
      void rowVersion;
      return { ref: id, ...item };
    }),
    cells: version.cells.map((item) => ({
      ref: item.id,
      likelihoodRef: item.likelihoodId,
      severityRef: item.severityId,
      riskResultRef: item.riskResultId,
      ratingCode: item.ratingCode,
      ratingValue: item.ratingValue,
      ...(item.displayColor ? { displayColor: item.displayColor } : {}),
      ...(item.guidanceText ? { guidanceText: item.guidanceText } : {}),
      active: item.active,
    })),
  };
}
function toPreview(version: RiskMatrixVersionDetail, draft: Draft): RiskMatrixVersionDetail {
  const results = draft.results.map<RiskResultDefinition>((item) => ({
    id: item.ref,
    code: item.code,
    name: item.name,
    description: item.description,
    semanticCategory: item.semanticCategory,
    displayOrder: item.displayOrder,
    displayColor: item.displayColor,
    guidanceText: item.guidanceText,
    prohibited: item.prohibited,
    active: item.active,
    rowVersion: '1',
  }));
  const resultMap = new Map(results.map((item) => [item.id, item]));
  const cells = draft.cells.map<RiskMatrixCell>((item) => {
    const result = resultMap.get(item.riskResultRef);
    return {
      id: item.ref,
      likelihoodId: item.likelihoodRef,
      severityId: item.severityRef,
      ratingCode: item.ratingCode,
      ratingValue: item.ratingValue,
      riskResultId: item.riskResultRef,
      riskResultCode: result?.code ?? 'INVALID',
      riskResultName: result?.name ?? 'Invalid result',
      displayColor: item.displayColor ?? result?.displayColor,
      guidanceText: item.guidanceText ?? result?.guidanceText,
      active: item.active,
      rowVersion: '1',
    };
  });
  const pairs = new Set(cells.map((item) => `${item.likelihoodId}:${item.severityId}`));
  const missingCells = draft.likelihoods.flatMap((l) =>
    draft.severities
      .filter((s) => !pairs.has(`${l.ref}:${s.ref}`))
      .map((s) => ({
        likelihoodId: l.ref,
        likelihoodCode: l.code,
        severityId: s.ref,
        severityCode: s.code,
      })),
  );
  const expectedCellCount = version.dimension * version.dimension;
  const errors: MatrixCompletenessResult['errors'] = [];
  if (
    draft.likelihoods.length !== version.dimension ||
    draft.severities.length !== version.dimension
  )
    errors.push({ code: 'AXIS_COUNT_INVALID', message: 'Axis count does not match dimension.' });
  if (missingCells.length)
    errors.push({ code: 'MATRIX_CELL_MISSING', message: 'Missing combinations.' });
  if (cells.some((item) => !item.ratingCode && item.ratingValue == null))
    errors.push({ code: 'MATRIX_CELL_RATING_MISSING', message: 'A rating is missing.' });
  return {
    ...version,
    likelihoods: draft.likelihoods.map((item) => ({ id: item.ref, ...item, rowVersion: '1' })),
    severities: draft.severities.map((item) => ({ id: item.ref, ...item, rowVersion: '1' })),
    results,
    cells,
    completeness: {
      complete: errors.length === 0 && cells.length === expectedCellCount,
      expectedCellCount,
      actualCellCount: cells.length,
      missingCells,
      errors,
    },
  };
}
