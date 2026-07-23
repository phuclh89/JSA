import {
  Alert,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Tag,
  Transfer,
  Typography,
  message,
} from 'antd';
import {
  DeleteOutlined,
  InfoCircleOutlined,
  PlusCircleOutlined,
  SaveOutlined,
  ToolOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type {
  JsaDraftBasicStep,
  JsaDraftDetail,
  JsaDraftHazard,
  JsaDraftTask,
  JsaPositionSnapshot,
  JsaToolSnapshot,
  JsaValidationResult,
  MasterDataRecord,
} from '@jsams/shared-types';
import type { ApiClientError } from '../../services/api-client';
import { jsaApi } from './jsa-api';
import { workflowApi } from './workflow-api';
import './jsa-draft.css';

const fresh = () => `new-${crypto.randomUUID()}`;
const persisted = (id: string) => /^\d+$/.test(id);
const meta = (value: { id: string; rowVersion: string }) => ({
  ref: value.id,
  ...(persisted(value.id) ? { id: value.id, rowVersion: value.rowVersion } : {}),
});

type DraftUpdater = (fn: (draft: JsaDraftDetail) => JsaDraftDetail) => void;
type PickerKind = 'performers' | 'supervisors' | 'tools';

export function JsaDraftEditor() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['jsa-draft', id], queryFn: () => jsaApi.detail(id) });
  const [draft, setDraft] = useState<JsaDraftDetail>();
  const [dirty, setDirty] = useState(false);
  const [validation, setValidation] = useState<JsaValidationResult>();

  useEffect(() => {
    if (query.data && !dirty) setDraft(query.data);
  }, [query.data, dirty]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  }, [dirty]);

  const update: DraftUpdater = (fn) => {
    setDraft((current) => (current ? fn(current) : current));
    setDirty(true);
  };
  const save = useMutation({
    mutationFn: async () => {
      const current = draft!;
      const header = await jsaApi.header(id, {
        rowVersion: current.rowVersion,
        versionRowVersion: current.versionRowVersion,
        jobTypeId: current.jobTypeId,
        languageId: current.languageId,
        jobTitle: current.jobTitle,
        jobDescription: current.jobDescription,
        location: current.location,
        personnel: current.personnel,
        ptwRequired: current.ptwRequired,
        ptwReference: current.ptwReference,
      });
      return jsaApi.content(
        id,
        serialize({
          ...current,
          rowVersion: header.rowVersion,
          versionRowVersion: header.versionRowVersion,
        }),
      );
    },
    onSuccess: (saved) => {
      setDraft(saved);
      setDirty(false);
      void queryClient.invalidateQueries({ queryKey: ['jsa-draft', id] });
      message.success('JSA draft saved');
    },
    onError: (error) => message.error((error as ApiClientError).message),
  });
  const validate = useMutation({
    mutationFn: () => jsaApi.validate(id),
    onSuccess: setValidation,
    onError: (error) => message.error((error as ApiClientError).message),
  });
  const cancel = useMutation({
    mutationFn: () =>
      jsaApi.cancel(id, {
        rowVersion: draft!.rowVersion,
        versionRowVersion: draft!.versionRowVersion,
      }),
    onSuccess: () => navigate('/browse'),
    onError: (error) => message.error((error as ApiClientError).message),
  });
  const submit = useMutation({
    mutationFn: () => workflowApi.submit(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['jsa-draft', id] });
      void queryClient.invalidateQueries({ queryKey: ['workflow-queue'] });
      message.success('JSA submitted for approval');
      navigate(`/jsa/${id}/workflow`);
    },
    onError: (error) => message.error((error as ApiClientError).message),
  });
  const prepareSubmission = async () => {
    try {
      const current = draft;
      if (!current) return;
      if (dirty) await save.mutateAsync();
      const result = await jsaApi.validate(id);
      setValidation(result);
      if (!result.valid) {
        message.error(`Resolve ${result.errors.length} blocking issue(s) before submission`);
        return;
      }
      const preview = await workflowApi.preview(id);
      if (!preview.configured) {
        message.error(preview.errors.join('; ') || 'Approval workflow is not configured');
        return;
      }
      Modal.confirm({
        title: current.versionStatus === 'RETURNED' ? 'Resubmit JSA for approval?' : 'Submit JSA for approval?',
        width: 620,
        content: (
          <div>
            <Typography.Paragraph>
              This working version becomes read-only while approval is active.
            </Typography.Paragraph>
            {preview.steps.map((step) => (
              <div key={step.stepId}>
                {step.stepOrder}. {step.stepName} — {step.assigneeName}
              </div>
            ))}
          </div>
        ),
        okText: current.versionStatus === 'RETURNED' ? 'Resubmit' : 'Submit',
        onOk: () => submit.mutateAsync(),
      });
    } catch (error) {
      message.error((error as ApiClientError).message ?? 'Submission preparation failed');
    }
  };

  if (query.isLoading || !draft) return <Spin aria-label="Loading JSA Draft" />;
  if (query.error)
    return <Alert type="error" showIcon message={(query.error as ApiClientError).message} />;

  const disabled = !draft.editable;
  const validationCount = validation
    ? validation.errors.length + validation.warnings.length
    : undefined;
  return (
    <main className="jsa-editor jsa-worksheet">
      <header className="jsa-editor-heading">
        <div>
          <Typography.Text className="eyebrow">CREATE JSA · WORKING VERSION</Typography.Text>
          <Typography.Title level={1}>{draft.jsaNumber}</Typography.Title>
          <Space wrap>
            <Tag color={draft.lifecycleStatus === 'DRAFT' ? 'lime' : 'default'}>
              {draft.lifecycleStatus}
            </Tag>
            <Tag>
              {draft.matrix.matrixCode} / {draft.matrix.versionCode} · {draft.matrix.dimension}×
              {draft.matrix.dimension}
            </Tag>
            {dirty && <Tag color="orange">Unsaved changes</Tag>}
          </Space>
        </div>
        <Space wrap className="worksheet-top-actions">
          <Button
            onClick={() => validate.mutate()}
            loading={validate.isPending}
            aria-label="Validate the complete JSA"
          >
            Validate{validationCount !== undefined ? ` (${validationCount})` : ''}
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            disabled={disabled || !dirty}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            Save Draft
          </Button>
        </Space>
      </header>

      {disabled && (
        <Alert
          type="info"
          showIcon
          message="Read-only JSA"
          description="Only the draft creator with the configured edit capability can change this working version."
        />
      )}

      <GeneralSection draft={draft} disabled={disabled} update={update} />
      <PromptSection draft={draft} disabled={disabled} update={update} />
      <RiskReferenceSection draft={draft} />
      <TaskRiskSection draft={draft} disabled={disabled} update={update} />
      <BasicStepSection draft={draft} disabled={disabled} update={update} />
      <ReferenceAttachmentSection draft={draft} disabled={disabled} update={update} />
      <ValidationSection result={validation} />

      <footer className="worksheet-footer">
        <div>
          <strong>{dirty ? 'Unsaved changes' : 'Draft saved'}</strong>
          <span>
            {validation?.valid
              ? 'Validation passed'
              : validation
                ? `${validation.errors.length} blocking issue(s)`
                : 'Run validation before submission'}
          </span>
        </div>
        <Space wrap>
          <Button onClick={() => navigate('/browse')}>Exit</Button>
          <Button
            danger
            disabled={disabled}
            loading={cancel.isPending}
            onClick={() =>
              Modal.confirm({
                title: 'Cancel this JSA draft?',
                content: 'The draft and its history will be retained and become read-only.',
                okText: 'Cancel draft',
                okButtonProps: { danger: true },
                onOk: () => cancel.mutate(),
              })
            }
          >
            Cancel Draft
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            disabled={disabled || !dirty}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            Save Draft
          </Button>
          <Button
            type="primary"
            disabled={disabled}
            loading={submit.isPending || save.isPending}
            onClick={() => void prepareSubmission()}
          >
            Save & Submit for Approval
          </Button>
        </Space>
      </footer>
    </main>
  );
}

function SectionTitle({
  title,
  count,
  extra,
}: {
  title: string;
  count?: number;
  extra?: React.ReactNode;
}) {
  return (
    <div className="worksheet-section-title">
      <span>
        {title}
        {count !== undefined ? ` (${count})` : ''}
      </span>
      {extra}
    </div>
  );
}

function GeneralSection({
  draft,
  disabled,
  update,
}: {
  draft: JsaDraftDetail;
  disabled: boolean;
  update: DraftUpdater;
}) {
  const field = <K extends keyof JsaDraftDetail>(name: K, value: JsaDraftDetail[K]) =>
    update((current) => ({ ...current, [name]: value }));
  return (
    <section className="worksheet-section" aria-labelledby="general-section">
      <SectionTitle title="JSA GENERAL INFORMATION" />
      <div className="worksheet-general-grid">
        <label>
          <span>Status</span>
          <Input value={draft.lifecycleStatus} readOnly />
        </label>
        <label>
          <span>JSA Number</span>
          <Input value={draft.jsaNumber} readOnly />
        </label>
        <label>
          <span>Owner Site ID</span>
          <Input value={draft.ownerSiteId} readOnly />
        </label>
        <label>
          <span>Rig ID</span>
          <Input value={draft.rigId} readOnly />
        </label>
        <label>
          <span>Department ID</span>
          <Input value={draft.departmentId} readOnly />
        </label>
        <label>
          <span>Location</span>
          <Input
            disabled={disabled}
            value={draft.location}
            onChange={(event) => field('location', event.target.value)}
          />
        </label>
        <label className="span-2">
          <span>Job Title *</span>
          <Input
            disabled={disabled}
            value={draft.jobTitle}
            onChange={(event) => field('jobTitle', event.target.value)}
          />
        </label>
        <label>
          <span>Personnel</span>
          <Input
            disabled={disabled}
            value={draft.personnel}
            onChange={(event) => field('personnel', event.target.value)}
          />
        </label>
        <label className="span-full">
          <span>Job Description</span>
          <Input.TextArea
            disabled={disabled}
            rows={3}
            value={draft.jobDescription}
            onChange={(event) => field('jobDescription', event.target.value)}
          />
        </label>
        <div className="worksheet-ptw">
          <Checkbox
            disabled={disabled}
            checked={draft.ptwRequired}
            onChange={(event) => field('ptwRequired', event.target.checked)}
          >
            Permit to Work required
          </Checkbox>
          <Input
            disabled={disabled || !draft.ptwRequired}
            aria-label="Permit to Work reference"
            placeholder="PTW reference"
            value={draft.ptwReference}
            onChange={(event) => field('ptwReference', event.target.value)}
          />
        </div>
      </div>
    </section>
  );
}

function PromptSection({
  draft,
  disabled,
  update,
}: {
  draft: JsaDraftDetail;
  disabled: boolean;
  update: DraftUpdater;
}) {
  const suffix = `?siteId=${draft.ownerSiteId}&rigId=${draft.rigId}&departmentId=${draft.departmentId}`;
  const options = useQuery({
    queryKey: ['jsa-options', 'hazard-prompts', suffix],
    queryFn: () => jsaApi.options<MasterDataRecord>('hazard-prompts', suffix),
  });
  const hazards = draft.tasks.flatMap((task) => task.hazards);
  const toggle = (record: MasterDataRecord, selected: boolean) =>
    update((current) => {
      const existing = current.prompts.find((item) => item.promptId === record.id);
      const prompts = existing
        ? current.prompts.map((item) =>
            item.promptId === record.id ? { ...item, selected } : item,
          )
        : [
            ...current.prompts,
            {
              id: fresh(),
              logicalKey: '',
              promptId: record.id,
              code: record.code,
              label: record.name,
              selected,
              rowVersion: '1',
            },
          ];
      return { ...current, prompts };
    });
  return (
    <section className="worksheet-section">
      <SectionTitle
        title="USE THE HAZARD ASSESSMENT PROMPT"
        count={draft.prompts.filter((item) => item.selected).length}
      />
      {options.isLoading ? (
        <Spin size="small" />
      ) : options.error ? (
        <Alert type="error" showIcon message="Hazard prompts could not be loaded" />
      ) : (
        <div className="prompt-grid">
          {(options.data ?? []).map((record) => {
            const prompt = draft.prompts.find((item) => item.promptId === record.id);
            return (
              <div className="prompt-item" key={record.id}>
                <Checkbox
                  disabled={disabled}
                  checked={prompt?.selected ?? false}
                  onChange={(event) => toggle(record, event.target.checked)}
                >
                  {record.name}
                </Checkbox>
                {prompt?.selected && (
                  <Select
                    aria-label={`Hazard coverage for ${record.name}`}
                    disabled={disabled || hazards.length === 0}
                    placeholder={hazards.length ? 'Covered by hazard' : 'Add a hazard first'}
                    value={draft.promptCoverage.find(
                      (coverage) => coverage.promptId === prompt.id,
                    )?.hazardId}
                    options={hazards.map((hazard) => ({
                      value: hazard.id,
                      label: hazard.text || 'Untitled hazard',
                    }))}
                    onChange={(hazardId) =>
                      update((current) => ({
                        ...current,
                        promptCoverage: [
                          ...current.promptCoverage.filter(
                            (coverage) => coverage.promptId !== prompt.id,
                          ),
                          {
                            id: fresh(),
                            logicalKey: '',
                            promptId: prompt.id,
                            hazardId,
                            rowVersion: '1',
                          },
                        ],
                      }))
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function RiskReferenceSection({ draft }: { draft: JsaDraftDetail }) {
  const [reference, setReference] = useState<'probability' | 'severity'>();
  const rows =
    reference === 'probability'
      ? draft.matrix.likelihoods.map((item) => ({
          code: item.code,
          label: item.label,
          definition: item.definition,
        }))
      : draft.matrix.severities.map((item) => ({
          code: item.code,
          label: item.label,
          definition: item.definition,
        }));
  return (
    <section className="worksheet-section risk-reference">
      <SectionTitle
        title={`RISK MATRIX · ${draft.matrix.matrixName}`}
        extra={
          <Space wrap>
            <Button
              size="small"
              icon={<InfoCircleOutlined />}
              onClick={() => setReference('probability')}
            >
              P — Probability
            </Button>
            <Button
              size="small"
              icon={<InfoCircleOutlined />}
              onClick={() => setReference('severity')}
            >
              S — Severity
            </Button>
          </Space>
        }
      />
      <div className="matrix-layout">
        <div
          className="matrix-grid"
          role="table"
          aria-label="Risk Matrix"
          style={{
            gridTemplateColumns: `minmax(120px, .8fr) repeat(${draft.matrix.dimension}, minmax(76px, 1fr))`,
          }}
        >
          <div className="matrix-corner" />
          {draft.matrix.severities.map((severity) => (
            <div className="matrix-axis" key={severity.id}>
              {severity.code}
              <small>{severity.label}</small>
            </div>
          ))}
          {draft.matrix.likelihoods
            .slice()
            .reverse()
            .map((likelihood) => (
              <div className="matrix-row" key={likelihood.id}>
                <div className="matrix-axis">
                  {likelihood.code}
                  <small>{likelihood.label}</small>
                </div>
                {draft.matrix.severities.map((severity) => {
                  const cell = draft.matrix.cells.find(
                    (item) =>
                      item.likelihoodId === likelihood.id && item.severityId === severity.id,
                  );
                  return (
                    <div
                      className="matrix-cell"
                      key={`${likelihood.id}-${severity.id}`}
                      style={{ backgroundColor: cell?.displayColor }}
                      title={cell ? `${cell.riskResultName} (${cell.ratingCode})` : 'Not configured'}
                    >
                      <strong>{cell?.ratingCode ?? '—'}</strong>
                      <span>{cell?.riskResultCode ?? 'N/A'}</span>
                    </div>
                  );
                })}
              </div>
            ))}
        </div>
        <div className="risk-legend">
          {draft.matrix.results.map((result) => (
            <div key={result.id}>
              <span style={{ backgroundColor: result.displayColor }} />
              <strong>{result.name}</strong>
              {result.prohibited && <Tag color="red">Prohibited residual</Tag>}
            </div>
          ))}
        </div>
      </div>
      <Modal
        title={reference === 'probability' ? 'P — PROBABILITY' : 'S — SEVERITY'}
        open={Boolean(reference)}
        footer={<Button onClick={() => setReference(undefined)}>Close</Button>}
        onCancel={() => setReference(undefined)}
        width={680}
      >
        <div className="reference-table-wrap">
          <table className="reference-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Label</th>
                <th>Definition</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.code}>
                  <td>{row.code}</td>
                  <td>{row.label}</td>
                  <td>{row.definition}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
    </section>
  );
}

function TaskRiskSection({
  draft,
  disabled,
  update,
}: {
  draft: JsaDraftDetail;
  disabled: boolean;
  update: DraftUpdater;
}) {
  const addTask = () =>
    update((current) => ({
      ...current,
      tasks: [
        ...current.tasks,
        {
          id: fresh(),
          logicalKey: '',
          number: String(current.tasks.length + 1),
          title: '',
          displayOrder: current.tasks.length + 1,
          hazards: [emptyHazard()],
          rowVersion: '1',
        },
      ],
    }));
  const setTask = (task: JsaDraftTask) =>
    update((current) => ({
      ...current,
      tasks: current.tasks.map((item) => (item.id === task.id ? task : item)),
    }));
  return (
    <section className="worksheet-section">
      <SectionTitle
        title="TASK / HAZARD / CONTROL ASSESSMENT"
        count={draft.tasks.length}
        extra={
          <Button
            size="small"
            icon={<PlusCircleOutlined />}
            disabled={disabled}
            onClick={addTask}
          >
            Add Task
          </Button>
        }
      />
      <div className="worksheet-table-wrap">
        <table className="worksheet-table task-risk-table">
          <thead>
            <tr>
              <th rowSpan={2}>No.</th>
              <th rowSpan={2}>Task</th>
              <th rowSpan={2}>Hazard</th>
              <th colSpan={3}>Initial Risk</th>
              <th rowSpan={2}>Controls</th>
              <th colSpan={3}>Residual Risk</th>
              <th rowSpan={2}>Del</th>
            </tr>
            <tr>
              <th>P</th>
              <th>S</th>
              <th>R</th>
              <th>P</th>
              <th>S</th>
              <th>R</th>
            </tr>
          </thead>
          <tbody>
            {draft.tasks.length === 0 && (
              <tr>
                <td colSpan={11} className="worksheet-empty">
                  No Task yet. Select “Add Task” to begin the assessment.
                </td>
              </tr>
            )}
            {draft.tasks.flatMap((task, taskIndex) => {
              const hazards = task.hazards.length ? task.hazards : [emptyHazard()];
              return hazards.map((hazard, hazardIndex) => (
                <TaskHazardRow
                  key={`${task.id}-${hazard.id}`}
                  task={task}
                  taskIndex={taskIndex}
                  hazard={hazard}
                  hazardIndex={hazardIndex}
                  draft={draft}
                  disabled={disabled}
                  change={(next) =>
                    setTask({
                      ...task,
                      hazards: task.hazards.some((item) => item.id === hazard.id)
                        ? task.hazards.map((item) => (item.id === hazard.id ? next : item))
                        : [next],
                    })
                  }
                  changeTask={setTask}
                  removeHazard={() =>
                    setTask({
                      ...task,
                      hazards: task.hazards.filter((item) => item.id !== hazard.id),
                    })
                  }
                  removeTask={() =>
                    update((current) => ({
                      ...current,
                      tasks: current.tasks.filter((item) => item.id !== task.id),
                    }))
                  }
                />
              ));
            })}
          </tbody>
        </table>
      </div>
      <Button
        type="link"
        icon={<PlusCircleOutlined />}
        disabled={disabled}
        onClick={addTask}
      >
        Add more Task
      </Button>
    </section>
  );
}

function TaskHazardRow({
  task,
  taskIndex,
  hazard,
  hazardIndex,
  draft,
  disabled,
  change,
  changeTask,
  removeHazard,
  removeTask,
}: {
  task: JsaDraftTask;
  taskIndex: number;
  hazard: JsaDraftHazard;
  hazardIndex: number;
  draft: JsaDraftDetail;
  disabled: boolean;
  change: (hazard: JsaDraftHazard) => void;
  changeTask: (task: JsaDraftTask) => void;
  removeHazard: () => void;
  removeTask: () => void;
}) {
  const risk = (kind: 'initialRisk' | 'residualRisk') => {
    const selection = hazard[kind];
    const cell = draft.matrix.cells.find(
      (item) =>
        item.likelihoodId === selection.likelihoodId &&
        item.severityId === selection.severityId,
    );
    return (
      <>
        <td className="risk-select-cell">
          <Select
            disabled={disabled}
            aria-label={`${kind} probability`}
            value={selection.likelihoodId}
            options={draft.matrix.likelihoods
              .filter((item) => item.active)
              .map((item) => ({ value: item.id, label: item.code }))}
            onChange={(likelihoodId) =>
              change({ ...hazard, [kind]: { ...selection, likelihoodId } })
            }
          />
        </td>
        <td className="risk-select-cell">
          <Select
            disabled={disabled}
            aria-label={`${kind} severity`}
            value={selection.severityId}
            options={draft.matrix.severities
              .filter((item) => item.active)
              .map((item) => ({ value: item.id, label: item.code }))}
            onChange={(severityId) =>
              change({ ...hazard, [kind]: { ...selection, severityId } })
            }
          />
        </td>
        <td className="risk-result-cell">
          <span style={{ backgroundColor: cell?.displayColor }}>
            {cell?.ratingCode ?? '—'}
          </span>
          <small>{cell?.riskResultCode ?? 'Select P/S'}</small>
        </td>
      </>
    );
  };
  return (
    <tr>
      <td>{`${taskIndex + 1}.${hazardIndex + 1}`}</td>
      <td className="task-cell">
        {hazardIndex === 0 ? (
          <>
            <Input
              disabled={disabled}
              aria-label={`Task ${taskIndex + 1} number`}
              placeholder="No."
              value={task.number}
              onChange={(event) => changeTask({ ...task, number: event.target.value })}
            />
            <Input.TextArea
              disabled={disabled}
              aria-label={`Task ${taskIndex + 1}`}
              placeholder="Task / sequence of work"
              autoSize={{ minRows: 2, maxRows: 6 }}
              value={task.title}
              onChange={(event) => changeTask({ ...task, title: event.target.value })}
            />
            <Space wrap size={4}>
              <Button
                size="small"
                type="link"
                disabled={disabled}
                onClick={() =>
                  changeTask({
                    ...task,
                    hazards: [...task.hazards, emptyHazard()],
                  })
                }
              >
                + Hazard
              </Button>
              <Button size="small" type="link" danger disabled={disabled} onClick={removeTask}>
                Delete Task
              </Button>
            </Space>
          </>
        ) : (
          <span className="continued-label">Task {taskIndex + 1} continued</span>
        )}
      </td>
      <td>
        <Input.TextArea
          disabled={disabled}
          aria-label={`Hazard ${hazardIndex + 1} for task ${taskIndex + 1}`}
          placeholder="Potential hazard"
          autoSize={{ minRows: 3, maxRows: 8 }}
          value={hazard.text}
          onChange={(event) => change({ ...hazard, text: event.target.value })}
        />
      </td>
      {risk('initialRisk')}
      <td className="controls-cell">
        {hazard.controls.map((control) => (
          <div className="control-entry" key={control.id}>
            <Input.TextArea
              disabled={disabled}
              aria-label="Hazard control"
              placeholder="Control to reduce potential hazard"
              autoSize={{ minRows: 2, maxRows: 5 }}
              value={control.text}
              onChange={(event) =>
                change({
                  ...hazard,
                  controls: hazard.controls.map((item) =>
                    item.id === control.id ? { ...item, text: event.target.value } : item,
                  ),
                })
              }
            />
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              aria-label="Remove control"
              disabled={disabled}
              onClick={() =>
                change({
                  ...hazard,
                  controls: hazard.controls.filter((item) => item.id !== control.id),
                })
              }
            />
          </div>
        ))}
        <Button
          size="small"
          type="link"
          disabled={disabled}
          onClick={() =>
            change({
              ...hazard,
              controls: [
                ...hazard.controls,
                {
                  id: fresh(),
                  logicalKey: '',
                  text: '',
                  displayOrder: hazard.controls.length + 1,
                  rowVersion: '1',
                },
              ],
            })
          }
        >
          + Control
        </Button>
      </td>
      {risk('residualRisk')}
      <td>
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          aria-label="Remove hazard"
          disabled={disabled}
          onClick={removeHazard}
        />
      </td>
    </tr>
  );
}

function emptyHazard(): JsaDraftHazard {
  return {
    id: fresh(),
    logicalKey: '',
    text: '',
    displayOrder: 1,
    initialRisk: {},
    residualRisk: {},
    controls: [
      {
        id: fresh(),
        logicalKey: '',
        text: '',
        displayOrder: 1,
        rowVersion: '1',
      },
    ],
    rowVersion: '1',
  };
}

function BasicStepSection({
  draft,
  disabled,
  update,
}: {
  draft: JsaDraftDetail;
  disabled: boolean;
  update: DraftUpdater;
}) {
  const suffix = `?siteId=${draft.ownerSiteId}&rigId=${draft.rigId}&departmentId=${draft.departmentId}`;
  const positions = useQuery({
    queryKey: ['jsa-options', 'positions', suffix],
    queryFn: () => jsaApi.options<MasterDataRecord>('positions', suffix),
  });
  const tools = useQuery({
    queryKey: ['jsa-options', 'tools', suffix],
    queryFn: () => jsaApi.options<MasterDataRecord>('tools', suffix),
  });
  const [picker, setPicker] = useState<{ stepId: string; kind: PickerKind }>();
  const step = draft.basicSteps.find((item) => item.id === picker?.stepId);
  const records = picker?.kind === 'tools' ? tools.data : positions.data;
  const selected =
    picker?.kind === 'tools'
      ? step?.tools.map((item) => item.toolId)
      : picker?.kind === 'performers'
        ? step?.performers.map((item) => item.positionId)
        : step?.supervisors.map((item) => item.positionId);
  const change = (next: JsaDraftBasicStep) =>
    update((current) => ({
      ...current,
      basicSteps: current.basicSteps.map((item) => (item.id === next.id ? next : item)),
    }));
  const addStep = () =>
    update((current) => ({
      ...current,
      basicSteps: [
        ...current.basicSteps,
        {
          id: fresh(),
          logicalKey: '',
          number: String(current.basicSteps.length + 1),
          text: '',
          displayOrder: current.basicSteps.length + 1,
          noToolRequired: false,
          performers: [],
          supervisors: [],
          tools: [],
          rowVersion: '1',
        },
      ],
    }));
  const applyPicker = (ids: string[]) => {
    if (!step || !picker) return;
    if (picker.kind === 'tools') {
      const snapshots: JsaToolSnapshot[] = ids.map((toolId, index) => {
        const existing = step.tools.find((item) => item.toolId === toolId);
        const record = tools.data?.find((item) => item.id === toolId);
        return (
          existing ?? {
            id: fresh(),
            logicalKey: '',
            toolId,
            code: record?.code ?? toolId,
            name: record?.name ?? 'Unknown tool',
            displayOrder: index + 1,
            rowVersion: '1',
          }
        );
      });
      change({ ...step, tools: snapshots, noToolRequired: false });
    } else {
      const source = picker.kind === 'performers' ? step.performers : step.supervisors;
      const snapshots: JsaPositionSnapshot[] = ids.map((positionId, index) => {
        const existing = source.find((item) => item.positionId === positionId);
        const record = positions.data?.find((item) => item.id === positionId);
        return (
          existing ?? {
            id: fresh(),
            logicalKey: '',
            positionId,
            code: record?.code ?? positionId,
            name: record?.name ?? 'Unknown position',
            displayOrder: index + 1,
            rowVersion: '1',
          }
        );
      });
      change({ ...step, [picker.kind]: snapshots });
    }
    setPicker(undefined);
  };
  return (
    <section className="worksheet-section">
      <SectionTitle
        title="BASIC JOB STEP"
        count={draft.basicSteps.length}
        extra={
          <Button
            size="small"
            icon={<PlusCircleOutlined />}
            disabled={disabled}
            onClick={addStep}
          >
            Add Basic Job Step
          </Button>
        }
      />
      <div className="worksheet-table-wrap">
        <table className="worksheet-table basic-step-table">
          <thead>
            <tr>
              <th>No.</th>
              <th>Basic Job Step</th>
              <th>Who performs task?</th>
              <th>Who supervises task?</th>
              <th>Tools required?</th>
              <th>Del</th>
            </tr>
          </thead>
          <tbody>
            {draft.basicSteps.length === 0 && (
              <tr>
                <td colSpan={6} className="worksheet-empty">
                  No Basic Job Step yet.
                </td>
              </tr>
            )}
            {draft.basicSteps.map((item, index) => (
              <tr key={item.id}>
                <td>
                  <Input
                    disabled={disabled}
                    aria-label={`Basic Job Step ${index + 1} number`}
                    value={item.number}
                    onChange={(event) => change({ ...item, number: event.target.value })}
                  />
                </td>
                <td>
                  <Input.TextArea
                    disabled={disabled}
                    aria-label={`Basic Job Step ${index + 1}`}
                    autoSize={{ minRows: 2, maxRows: 6 }}
                    value={item.text}
                    onChange={(event) => change({ ...item, text: event.target.value })}
                  />
                </td>
                <td>
                  <AssignmentButton
                    icon={<UserOutlined />}
                    label="Select performers"
                    values={item.performers.map((value) => value.name)}
                    disabled={disabled}
                    onClick={() => setPicker({ stepId: item.id, kind: 'performers' })}
                  />
                </td>
                <td>
                  <AssignmentButton
                    icon={<UserOutlined />}
                    label="Select supervisors"
                    values={item.supervisors.map((value) => value.name)}
                    disabled={disabled}
                    onClick={() => setPicker({ stepId: item.id, kind: 'supervisors' })}
                  />
                </td>
                <td>
                  <AssignmentButton
                    icon={<ToolOutlined />}
                    label="Select tools"
                    values={item.tools.map((value) => value.name)}
                    disabled={disabled || item.noToolRequired}
                    onClick={() => setPicker({ stepId: item.id, kind: 'tools' })}
                  />
                  <Checkbox
                    disabled={disabled}
                    checked={item.noToolRequired}
                    onChange={(event) =>
                      change({
                        ...item,
                        noToolRequired: event.target.checked,
                        ...(event.target.checked ? { tools: [] } : {}),
                      })
                    }
                  >
                    No tool required
                  </Checkbox>
                </td>
                <td>
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    aria-label={`Delete Basic Job Step ${index + 1}`}
                    disabled={disabled}
                    onClick={() =>
                      update((current) => ({
                        ...current,
                        basicSteps: current.basicSteps.filter((stepItem) => stepItem.id !== item.id),
                      }))
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button
        type="link"
        icon={<PlusCircleOutlined />}
        disabled={disabled}
        onClick={addStep}
      >
        Add more Basic Job Step
      </Button>
      <ReferencePickerModal
        open={Boolean(picker)}
        title={
          picker?.kind === 'tools'
            ? 'TOOLS'
            : picker?.kind === 'performers'
              ? 'PERFORMER POSITIONS'
              : 'SUPERVISOR POSITIONS'
        }
        records={records ?? []}
        selected={selected ?? []}
        onCancel={() => setPicker(undefined)}
        onConfirm={applyPicker}
      />
    </section>
  );
}

function AssignmentButton({
  icon,
  label,
  values,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  values: string[];
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <div className="assignment-summary">
      <Button icon={icon} disabled={disabled} onClick={onClick}>
        {label} ({values.length})
      </Button>
      <div>
        {values.map((value) => (
          <Tag key={value}>{value}</Tag>
        ))}
      </div>
    </div>
  );
}

function ReferencePickerModal({
  open,
  title,
  records,
  selected,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  records: MasterDataRecord[];
  selected: string[];
  onCancel: () => void;
  onConfirm: (ids: string[]) => void;
}) {
  const [targetKeys, setTargetKeys] = useState<string[]>(selected);
  useEffect(() => setTargetKeys(selected), [selected, open]);
  const dataSource = useMemo(
    () =>
      records.map((record) => ({
        key: record.id,
        title: `${record.code} — ${record.name}`,
      })),
    [records],
  );
  return (
    <Modal
      title={title}
      open={open}
      width={920}
      okText="Apply selection"
      onOk={() => onConfirm(targetKeys)}
      onCancel={onCancel}
      destroyOnHidden
    >
      <Transfer
        className="reference-transfer"
        dataSource={dataSource}
        targetKeys={targetKeys}
        showSearch
        titles={[`Available (${dataSource.length})`, `Selected (${targetKeys.length})`]}
        locale={{
          itemUnit: 'item',
          itemsUnit: 'items',
          searchPlaceholder: 'Search',
          notFoundContent: 'No matching item',
        }}
        render={(item) => item.title}
        onChange={(keys) => setTargetKeys(keys.map(String))}
        listStyle={{ width: 360, height: 420 }}
      />
    </Modal>
  );
}

function ReferenceAttachmentSection({
  draft,
  disabled,
  update,
}: {
  draft: JsaDraftDetail;
  disabled: boolean;
  update: DraftUpdater;
}) {
  const suffix = `?siteId=${draft.ownerSiteId}&rigId=${draft.rigId}&departmentId=${draft.departmentId}`;
  const references = useQuery({
    queryKey: ['jsa-options', 'procedure-references', suffix],
    queryFn: () => jsaApi.options<MasterDataRecord>('procedure-references', suffix),
  });
  return (
    <section className="worksheet-section">
      <SectionTitle title="REFERENCES & ATTACHMENTS" />
      <div className="reference-grid">
        <Card size="small" title="Procedure References">
          <Select
            className="full-width"
            disabled={disabled}
            placeholder="Add governed procedure"
            options={references.data?.map((item) => ({
              value: item.id,
              label: `${item.code} — ${item.name}`,
            }))}
            onChange={(procedureReferenceId) => {
              const record = references.data?.find((item) => item.id === procedureReferenceId);
              if (!record) return;
              update((current) => ({
                ...current,
                procedureReferences: [
                  ...current.procedureReferences,
                  {
                    id: fresh(),
                    logicalKey: '',
                    procedureReferenceId,
                    code: record.code,
                    title: record.name,
                    displayOrder: current.procedureReferences.length + 1,
                    rowVersion: '1',
                  },
                ],
              }));
            }}
          />
          {draft.procedureReferences.map((item) => (
            <div className="list-row" key={item.id}>
              <span>
                <strong>{item.code}</strong> {item.title}
              </span>
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                disabled={disabled}
                aria-label={`Remove procedure ${item.code}`}
                onClick={() =>
                  update((current) => ({
                    ...current,
                    procedureReferences: current.procedureReferences.filter(
                      (reference) => reference.id !== item.id,
                    ),
                  }))
                }
              />
            </div>
          ))}
        </Card>
        <Card size="small" title="Attachment Metadata">
          <Alert
            type="warning"
            showIcon
            message="Binary upload is unavailable in this phase"
            description="Metadata-only attachments are retained, but validation blocks submission until storage is configured."
          />
          <Form
            layout="vertical"
            disabled={disabled}
            onFinish={(values: { fileName: string; description?: string }) =>
              update((current) => ({
                ...current,
                attachments: [
                  ...current.attachments,
                  {
                    id: fresh(),
                    logicalKey: '',
                    fileName: values.fileName,
                    status: 'METADATA_ONLY',
                    description: values.description,
                    rowVersion: '1',
                  },
                ],
              }))
            }
          >
            <div className="attachment-form">
              <Form.Item name="fileName" label="File name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="description" label="Note">
                <Input />
              </Form.Item>
              <Button htmlType="submit">Add attachment</Button>
            </div>
          </Form>
          {draft.attachments.map((item) => (
            <div className="list-row" key={item.id}>
              <span>
                {item.fileName} <Tag>{item.status}</Tag>
              </span>
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                disabled={disabled}
                aria-label={`Remove attachment ${item.fileName}`}
                onClick={() =>
                  update((current) => ({
                    ...current,
                    attachments: current.attachments.filter(
                      (attachment) => attachment.id !== item.id,
                    ),
                  }))
                }
              />
            </div>
          ))}
        </Card>
      </div>
    </section>
  );
}

function ValidationSection({ result }: { result?: JsaValidationResult }) {
  if (!result) return null;
  return (
    <section className="worksheet-section validation-section" aria-live="polite">
      <SectionTitle title="VALIDATION RESULT" count={result.errors.length + result.warnings.length} />
      <Alert
        showIcon
        type={result.valid ? 'success' : 'error'}
        message={result.valid ? 'Draft is structurally ready' : 'Draft has blocking issues'}
        description={`${result.errors.length} error(s), ${result.warnings.length} warning(s)`}
      />
      {[...result.errors, ...result.warnings].map((issue, index) => (
        <div className="validation-row" key={`${issue.code}-${index}`}>
          <Tag color={index < result.errors.length ? 'red' : 'orange'}>{issue.section}</Tag>
          <strong>{issue.code}</strong>
          <span>{issue.message}</span>
        </div>
      ))}
    </section>
  );
}

function serialize(draft: JsaDraftDetail) {
  return {
    versionRowVersion: draft.versionRowVersion,
    prompts: draft.prompts.map((item) => ({
      ...meta(item),
      promptId: item.promptId,
      selected: item.selected,
      responseNote: item.responseNote,
    })),
    tasks: draft.tasks.map((task) => ({
      ...meta(task),
      parentRef: task.parentTaskId,
      number: task.number,
      title: task.title,
      description: task.description,
      displayOrder: task.displayOrder,
      hazards: task.hazards.map((hazard) => ({
        ...meta(hazard),
        text: hazard.text,
        displayOrder: hazard.displayOrder,
        initialRisk: {
          likelihoodId: hazard.initialRisk.likelihoodId,
          severityId: hazard.initialRisk.severityId,
        },
        residualRisk: {
          likelihoodId: hazard.residualRisk.likelihoodId,
          severityId: hazard.residualRisk.severityId,
        },
        controls: hazard.controls.map((control) => ({
          ...meta(control),
          text: control.text,
          displayOrder: control.displayOrder,
        })),
      })),
    })),
    coverage: draft.promptCoverage.map((item) => ({
      ...meta(item),
      promptRef: item.promptId,
      hazardRef: item.hazardId,
      controlRef: item.controlId,
      note: item.note,
    })),
    basicSteps: draft.basicSteps.map((item) => ({
      ...meta(item),
      taskRef: item.taskId,
      number: item.number,
      text: item.text,
      displayOrder: item.displayOrder,
      noToolRequired: item.noToolRequired,
      performers: item.performers.map((position) => ({
        ...meta(position),
        positionId: position.positionId,
        displayOrder: position.displayOrder,
      })),
      supervisors: item.supervisors.map((position) => ({
        ...meta(position),
        positionId: position.positionId,
        displayOrder: position.displayOrder,
      })),
      tools: item.tools.map((tool) => ({
        ...meta(tool),
        toolId: tool.toolId,
        displayOrder: tool.displayOrder,
      })),
    })),
    procedureReferences: draft.procedureReferences.map((item) => ({
      ...meta(item),
      procedureReferenceId: item.procedureReferenceId,
      code: item.code,
      title: item.title,
      revision: item.revision,
      uri: item.uri,
      notes: item.notes,
      displayOrder: item.displayOrder,
    })),
    attachments: draft.attachments.map((item) => ({
      ...meta(item),
      fileName: item.fileName,
      contentType: item.contentType,
      fileSize: item.fileSize,
      description: item.description,
    })),
  };
}
