import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  Checkbox,
  Empty,
  Input,
  Modal,
  Space,
  Spin,
  Tag,
  Transfer,
  Tree,
  Typography,
  message,
} from 'antd';
import {
  CheckOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  FileExcelOutlined,
  FileImageOutlined,
  FileOutlined,
  FilePdfOutlined,
  FilePptOutlined,
  FileWordOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  HomeOutlined,
  PlusCircleOutlined,
  PlusOutlined,
  SaveOutlined,
  SearchOutlined,
  ToolOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type {
  JsaDraftBasicStep,
  JsaDraftDetail,
  JsaDraftHazard,
  JsaDraftTask,
  JsaPositionSnapshot,
  JsaToolSnapshot,
  JsaValidationResult,
  AttachmentLibraryAsset,
  AttachmentLibraryFolder,
  MasterDataRecord,
  RiskAxisLevel,
  JsaVersionChange,
} from '@jsams/shared-types';
import type { ApiClientError } from '../../services/api-client';
import { jsaApi } from './jsa-api';
import { workflowApi } from './workflow-api';
import { ApprovalProgress } from './approval-progress';
import { ApprovalHistory } from './approval-history';
import { VersionComparePanel } from './version-compare-panel';
import { versioningApi } from './versioning-api';
import { CopyProvenancePanel } from './copy-provenance-panel';
import './jsa-draft.css';

const fresh = () => `new-${crypto.randomUUID()}`;
const persisted = (id: string) => /^\d+$/.test(id);
const meta = (value: { id: string; rowVersion: string }) => ({
  ref: value.id,
  ...(persisted(value.id) ? { id: value.id, rowVersion: value.rowVersion } : {}),
});

type DraftUpdater = (fn: (draft: JsaDraftDetail) => JsaDraftDetail) => void;
type PickerKind = 'performers' | 'supervisors' | 'tools';
type ChangeMap = Map<string, JsaVersionChange>;
type MarkDeleted = (
  entityType: string,
  logicalKey: string,
  label: string,
  oldPosition?: string,
  values?: Record<string, string | number | boolean | null | undefined>,
) => void;

const changeKey = (entityType: string, logicalKey: string) => `${entityType}:${logicalKey}`;
const changeFor = (changes: ChangeMap, entityType: string, logicalKey: string) =>
  logicalKey ? changes.get(changeKey(entityType, logicalKey)) : undefined;
const changed = (change: JsaVersionChange | undefined, fields?: string[]) =>
  Boolean(
    change &&
      change.changeType !== 'UNCHANGED' &&
      change.changeType !== 'DELETED' &&
      change.changeType !== 'ADDED' &&
      (change.changeType !== 'MODIFIED' ||
        !fields ||
        change.fields.some((field) => fields.includes(field.field))),
  );
const changedClass = (change: JsaVersionChange | undefined, fields?: string[]) =>
  changed(change, fields) ? ' worksheet-cell--changed' : '';
const added = (change: JsaVersionChange | undefined, id: string) =>
  !persisted(id) || change?.changeType === 'ADDED';
const deletedChanges = (changes: ChangeMap, types: string[]) =>
  [...changes.values()].filter(
    (change) => change.changeType === 'DELETED' && types.includes(change.entityType),
  );
export function JsaDraftEditor({
  embedded = false,
  forceReadOnly = false,
  reviewComparison = false,
  draftId,
  onExit,
}: {
  embedded?: boolean;
  forceReadOnly?: boolean;
  reviewComparison?: boolean;
  draftId?: string;
  onExit?: () => void;
} = {}) {
  const { id: routeId = '' } = useParams();
  const id = draftId ?? routeId;
  const [searchParams] = useSearchParams();
  const currentSource = !embedded && searchParams.get('source') === 'current';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['jsa-draft', id, currentSource ? 'current' : 'working'],
    queryFn: () => (currentSource ? jsaApi.currentDetail(id) : jsaApi.detail(id)),
  });
  const [draft, setDraft] = useState<JsaDraftDetail>();
  const [dirty, setDirty] = useState(false);
  const [validation, setValidation] = useState<JsaValidationResult>();
  const [saveError, setSaveError] = useState<ApiClientError>();
  const [localDeleted, setLocalDeleted] = useState<ChangeMap>(new Map());
  const workflowPreview = useQuery({
    queryKey: ['workflow-preview', id],
    queryFn: () => workflowApi.preview(id),
    enabled: Boolean(query.data) && !embedded,
  });
  const returnedWorkflow = useQuery({
    queryKey: ['workflow-detail', id],
    queryFn: () => workflowApi.detail(id),
    enabled: query.data?.versionStatus === 'RETURNED' && !embedded,
  });
  const versioningCapabilities = useQuery({
    queryKey: ['jsa-versioning-capabilities'],
    queryFn: versioningApi.capabilities,
    enabled: Boolean(id),
  });
  const comparison = useQuery({
    queryKey: ['jsa-version-compare', id, reviewComparison],
    queryFn: () =>
      reviewComparison ? versioningApi.reviewCompare(id) : versioningApi.compare(id),
    enabled: Boolean(query.data?.baseVersionId) && (!embedded || reviewComparison),
  });
  const serverChanges = useMemo(
    () =>
      new Map(
        (comparison.data?.changes ?? []).map((change) => [
          changeKey(change.entityType, change.logicalKey),
          change,
        ]),
      ),
    [comparison.data],
  );
  const changes = useMemo(
    () => new Map([...serverChanges.entries(), ...localDeleted.entries()]),
    [localDeleted, serverChanges],
  );
  const markDeleted: MarkDeleted = (entityType, logicalKey, label, oldPosition, values = {}) => {
    if (
      !query.data?.baseVersionId ||
      !logicalKey ||
      changeFor(serverChanges, entityType, logicalKey)?.changeType === 'ADDED'
    )
      return;
    const change: JsaVersionChange = {
      entityType,
      logicalKey,
      changeType: 'DELETED',
      label,
      fields: Object.entries(values).map(([field, oldValue]) => ({
        field,
        oldValue: oldValue ?? null,
        newValue: null,
      })),
      ...(oldPosition ? { oldPosition } : {}),
    };
    setLocalDeleted((current) => new Map(current).set(changeKey(entityType, logicalKey), change));
  };
  useEffect(() => setLocalDeleted(new Map()), [id]);
  const undoCheckout = useMutation({
    mutationFn: () => versioningApi.undo(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workflow-queue'] });
      void queryClient.invalidateQueries({ queryKey: ['jsa-drafts'] });
      void queryClient.invalidateQueries({ queryKey: ['jsa-browse'] });
      void queryClient.invalidateQueries({ queryKey: ['jsa-navigation-counts'] });
      message.success('Checkout was undone. The Current Published Version was not changed.');
      navigate('/jsa/published');
    },
    onError: (error) => message.error((error as ApiClientError).message),
  });

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
    onMutate: () => setSaveError(undefined),
    mutationFn: async () => {
      const current = draft!;
      try {
        return await jsaApi.save(id, savePayload(current));
      } catch (error) {
        const apiError = error as ApiClientError;
        if (apiError.code !== 'OPTIMISTIC_LOCK_CONFLICT') throw error;
        const latest = await jsaApi.detail(id);
        if (!canRetryRootVersionConflict(current, latest, query.data)) throw error;
        return jsaApi.save(
          id,
          savePayload(current, {
            rowVersion: latest.rowVersion,
            versionRowVersion: latest.versionRowVersion,
          }),
        );
      }
    },
    onSuccess: (saved) => {
      setDraft(saved);
      setDirty(false);
      setSaveError(undefined);
      void queryClient.invalidateQueries({ queryKey: ['jsa-draft', id] });
      void queryClient.invalidateQueries({ queryKey: ['jsa-version-compare', id] });
      message.success('JSA draft saved');
    },
    onError: (error) => {
      const apiError = error as ApiClientError;
      setSaveError(apiError);
      message.error(`Draft save failed: ${apiError.message}`);
    },
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['jsa-navigation-counts'] });
      void queryClient.invalidateQueries({ queryKey: ['jsa-drafts'] });
      if (onExit) onExit();
      else navigate('/jsa/drafts');
    },
    onError: (error) => message.error((error as ApiClientError).message),
  });
  const submit = useMutation({
    mutationFn: () => workflowApi.submit(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['jsa-draft', id] });
      void queryClient.invalidateQueries({ queryKey: ['workflow-queue'] });
      void queryClient.invalidateQueries({ queryKey: ['jsa-navigation-counts'] });
      message.success('JSA submitted for approval');
      if (onExit) onExit();
      else navigate(`/jsa/${id}/workflow`);
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
        title:
          current.versionStatus === 'RETURNED'
            ? 'Resubmit JSA for approval?'
            : 'Submit JSA for approval?',
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
  const reloadLatest = () =>
    Modal.confirm({
      title: 'Reload the latest Draft?',
      content:
        'Your unsaved changes on this screen will be discarded and the latest saved version will be loaded.',
      okText: 'Reload latest',
      onOk: async () => {
        const result = await query.refetch();
        if (result.data) {
          setDraft(result.data);
          setDirty(false);
          setSaveError(undefined);
          setLocalDeleted(new Map());
          message.success('Latest Draft loaded');
        }
      },
    });

  if (query.isLoading || !draft) return <Spin aria-label="Loading JSA Draft" />;
  if (query.error)
    return <Alert type="error" showIcon message={(query.error as ApiClientError).message} />;

  const disabled = forceReadOnly || !draft.editable;
  const validationCount = validation
    ? validation.errors.length + validation.warnings.length
    : undefined;
  const worksheet = (
    <>
      <GeneralSection draft={draft} disabled={disabled} update={update} changes={changes} />
      <PromptSection draft={draft} disabled={disabled} update={update} changes={changes} />
      <RiskReferenceSection draft={draft} />
      <TaskRiskSection
        draft={draft}
        disabled={disabled}
        update={update}
        changes={changes}
        markDeleted={markDeleted}
      />
      <BasicStepSection
        draft={draft}
        disabled={disabled}
        update={update}
        changes={changes}
        markDeleted={markDeleted}
      />
      <ReferenceAttachmentSection
        draft={draft}
        disabled={disabled}
        update={update}
        changes={changes}
        markDeleted={markDeleted}
      />
      <ValidationSection result={validation} />
    </>
  );

  if (embedded)
    return (
      <section
        className="jsa-editor jsa-worksheet jsa-worksheet--embedded"
        aria-label="Complete JSA worksheet"
      >
        {worksheet}
      </section>
    );

  return (
    <main className="jsa-editor jsa-worksheet">
      <header className="jsa-editor-heading">
        <div>
          <Typography.Text className="eyebrow">
            {draft.baseVersionId
              ? 'UPDATE JSA · WORKING VERSION'
              : draft.versionStatus === 'PUBLISHED'
                ? 'CURRENT PUBLISHED JSA'
                : 'CREATE JSA · WORKING VERSION'}
          </Typography.Text>
          <Typography.Title level={1}>{draft.jsaNumber}</Typography.Title>
          <Space wrap>
            <Tag color={draft.versionStatus === 'PUBLISHED' ? 'green' : 'orange'}>
              Official: {draft.lifecycleStatus}
            </Tag>
            <Tag>
              Update:{' '}
              {draft.baseVersionId
                ? draft.versionStatus
                : draft.workingVersionStatus
                  ? `IN PROGRESS · ${draft.workingVersionStatus}`
                  : 'NONE'}
            </Tag>
            <Tag>
              {draft.matrix.matrixCode} / {draft.matrix.versionCode} · {draft.matrix.dimension}×
              {draft.matrix.dimension}
            </Tag>
            {dirty && <Tag color="orange">Unsaved changes</Tag>}
          </Space>
        </div>
        {!disabled ? (
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
              disabled={!dirty}
              loading={save.isPending}
              onClick={() => save.mutate()}
            >
              Save Draft
            </Button>
            {draft.baseVersionId &&
            draft.versionStatus === 'DRAFT' &&
            versioningCapabilities.data?.undoCheckout ? (
              <Button
                danger
                loading={undoCheckout.isPending}
                onClick={() =>
                  Modal.confirm({
                    title: 'Undo Checkout',
                    content:
                      'All changes in this unsubmitted Working Version will be discarded. The Current Published Version will remain unchanged and this JSA will become available for checkout again.',
                    okText: 'Undo Checkout',
                    okButtonProps: { danger: true },
                    onOk: () => undoCheckout.mutateAsync(),
                  })
                }
              >
                Undo Checkout
              </Button>
            ) : null}
          </Space>
        ) : null}
      </header>

      <CopyProvenancePanel jsaId={id} />

      {draft.baseVersionId && draft.checkedOutAt ? (
        <Alert
          type="info"
          showIcon
          message={`Checked out by ${draft.checkedOutByDisplayName || draft.checkedOutByUsername || 'an authorized user'}`}
          description={`Checkout time: ${new Date(draft.checkedOutAt).toLocaleString()}. Base Version ID: ${draft.baseVersionId}.`}
        />
      ) : null}

      {draft.baseVersionId &&
      draft.tasks.some((task) =>
        task.hazards.some((hazard) => !hazard.initialRisk.cellId || !hazard.residualRisk.cellId),
      ) ? (
        <Alert
          type="warning"
          showIcon
          message="Matrix reassessment required"
          description="The effective Matrix changed or risk assessment is incomplete. Reassess every Hazard before submission."
        />
      ) : null}

      <ApprovalProgress
        versionStatus={draft.versionStatus}
        steps={workflowPreview.data?.steps}
        loading={workflowPreview.isLoading}
        configured={workflowPreview.data?.configured}
      />

      {draft.versionStatus === 'RETURNED' && !embedded ? (
        <ApprovalHistory
          actions={returnedWorkflow.data?.actions}
          loading={returnedWorkflow.isLoading}
          error={Boolean(returnedWorkflow.error)}
        />
      ) : null}

      {disabled && (
        <Alert
          type="info"
          showIcon
          message="Read-only JSA"
          description="Only the draft creator with the configured edit capability can change this working version."
        />
      )}

      {saveError && (
        <Alert
          type="error"
          showIcon
          action={
            saveError.code === 'OPTIMISTIC_LOCK_CONFLICT' ? (
              <Button onClick={reloadLatest}>Reload latest</Button>
            ) : undefined
          }
          message={`Draft save failed — ${saveError.code}`}
          description={
            <Space direction="vertical" size={0}>
              <Typography.Text>{saveError.message}</Typography.Text>
              {saveError.details
                .map(String)
                .filter((detail) => detail && detail !== saveError.message)
                .map((detail) => (
                  <Typography.Text key={detail}>{detail}</Typography.Text>
                ))}
              {saveError.correlationId && (
                <Typography.Text type="secondary">
                  Correlation ID: {saveError.correlationId}
                </Typography.Text>
              )}
            </Space>
          }
        />
      )}

      {worksheet}

      {draft.baseVersionId && versioningCapabilities.data?.compare ? (
        <VersionComparePanel
          jsaId={id}
          defaultCollapsed
          legend={
            comparison.data ? (
              <div className="worksheet-change-legend" role="note">
                <span>
                  <i className="worksheet-change-swatch worksheet-change-swatch--added" />
                  Added since the Published Version
                </span>
                <span>
                  <i className="worksheet-change-swatch worksheet-change-swatch--changed" />
                  Changed since the Published Version
                </span>
                <span>
                  <i className="worksheet-change-swatch worksheet-change-swatch--deleted" />
                  Deleted from the Published Version
                </span>
              </div>
            ) : null
          }
        />
      ) : null}

      <footer className="worksheet-footer">
        <div>
          <strong>{disabled ? 'Read-only JSA' : dirty ? 'Unsaved changes' : 'Draft saved'}</strong>
          <span>
            {disabled
              ? 'Content is locked for viewing.'
              : validation?.valid
                ? 'Validation passed'
                : validation
                  ? `${validation.errors.length} blocking issue(s)`
                  : 'Run validation before submission'}
          </span>
        </div>
        <Space wrap>
          <Button onClick={() => (onExit ? onExit() : navigate('/jsa/drafts'))}>Exit</Button>
          {!disabled ? (
            <>
              <Button
                danger
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
                disabled={!dirty}
                loading={save.isPending}
                onClick={() => save.mutate()}
              >
                Save Draft
              </Button>
              <Button
                type="primary"
                loading={submit.isPending || save.isPending}
                onClick={() => void prepareSubmission()}
              >
                Save & Submit for Approval
              </Button>
            </>
          ) : null}
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

function DeletedReference({ change }: { change: JsaVersionChange }) {
  return (
    <div
      className="worksheet-deleted-reference"
      aria-label={`Deleted ${change.entityType}: ${change.label}`}
    >
      <Tag color="default">Deleted {change.entityType.replaceAll('_', ' ')}</Tag>
      <del>{change.label || 'Unnamed item'}</del>
    </div>
  );
}

function GeneralSection({
  draft,
  disabled,
  update,
  changes,
}: {
  draft: JsaDraftDetail;
  disabled: boolean;
  update: DraftUpdater;
  changes: ChangeMap;
}) {
  const header = changeFor(changes, 'HEADER', 'HEADER');
  const field = <K extends keyof JsaDraftDetail>(name: K, value: JsaDraftDetail[K]) =>
    update((current) => ({ ...current, [name]: value }));
  return (
    <section className="worksheet-section" aria-labelledby="general-section">
      <SectionTitle title="JSA GENERAL INFORMATION" />
      <div className="worksheet-general-grid">
        <div className="worksheet-readonly-field">
          <span>Status</span>
          <div className="worksheet-readonly-value">
            <Tag color={draft.versionStatus === 'DRAFT' ? 'lime' : 'orange'}>
              {draft.versionStatus}
            </Tag>
          </div>
        </div>
        <div className="worksheet-readonly-field">
          <span>Temporary JSA Number</span>
          <strong className="worksheet-readonly-value">{draft.jsaNumber}</strong>
        </div>
        <div className={`worksheet-readonly-field${changedClass(header, ['ownerSiteId'])}`}>
          <span>Owner Site</span>
          <strong className="worksheet-readonly-value">
            {draft.ownerSiteCode} — {draft.ownerSiteName}
          </strong>
        </div>
        <div className={`worksheet-readonly-field${changedClass(header, ['rigId'])}`}>
          <span>Rig</span>
          <strong className="worksheet-readonly-value">
            {draft.rigCode} — {draft.rigName}
          </strong>
        </div>
        <div className={`worksheet-readonly-field${changedClass(header, ['departmentId'])}`}>
          <span>Department</span>
          <strong className="worksheet-readonly-value">
            {draft.departmentCode} — {draft.departmentName}
          </strong>
        </div>
        <label className={`span-2${changedClass(header, ['jobTitle'])}`}>
          <span>Job Title *</span>
          <Input
            readOnly={disabled}
            value={draft.jobTitle}
            onChange={(event) => field('jobTitle', event.target.value)}
          />
        </label>
      </div>
    </section>
  );
}

function PromptSection({
  draft,
  disabled,
  update,
  changes,
}: {
  draft: JsaDraftDetail;
  disabled: boolean;
  update: DraftUpdater;
  changes: ChangeMap;
}) {
  const suffix = `?siteId=${draft.ownerSiteId}&rigId=${draft.rigId}&departmentId=${draft.departmentId}`;
  const options = useQuery({
    queryKey: ['jsa-options', 'hazard-prompts', suffix],
    queryFn: () => jsaApi.options<MasterDataRecord>('hazard-prompts', suffix),
  });
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
  const currentPromptIds = new Set((options.data ?? []).map((record) => record.id));
  const readonlyPrompts = [
    ...(options.data ?? []).map((record) => ({
      id: `prompt-option-${record.id}`,
      label: record.name,
      selected: Boolean(draft.prompts.find((item) => item.promptId === record.id && item.selected)),
      logicalKey: draft.prompts.find((item) => item.promptId === record.id)?.logicalKey ?? '',
    })),
    ...draft.prompts
      .filter((item) => item.selected && !currentPromptIds.has(item.promptId))
      .map((item) => ({
        id: `prompt-snapshot-${item.id}`,
        label: item.label,
        selected: true,
        logicalKey: item.logicalKey,
      })),
  ];
  return (
    <section className="worksheet-section">
      <SectionTitle
        title="USE THE HAZARD ASSESSMENT PROMPT"
        count={draft.prompts.filter((item) => item.selected).length}
      />
      {disabled ? (
        options.isLoading ? (
          <Spin size="small" />
        ) : options.error ? (
          <Alert type="error" showIcon message="Hazard prompts could not be loaded" />
        ) : readonlyPrompts.length ? (
          <div className="prompt-grid prompt-grid--readonly">
            {readonlyPrompts.map((prompt) => (
              <div
                className={`prompt-readonly-item${prompt.selected ? ' prompt-readonly-item--selected' : ''}${changedClass(
                  changeFor(changes, 'PROMPT', prompt.logicalKey),
                  ['selected', 'responseNote'],
                )}`}
                key={prompt.id}
              >
                <span
                  className={`prompt-readonly-indicator${prompt.selected ? ' prompt-readonly-indicator--selected' : ''}`}
                  aria-hidden="true"
                >
                  {prompt.selected ? <CheckOutlined /> : null}
                </span>
                <span>{prompt.label}</span>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            className="worksheet-static-empty"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No Hazard Assessment Prompt configured"
          />
        )
      ) : options.isLoading ? (
        <Spin size="small" />
      ) : options.error ? (
        <Alert type="error" showIcon message="Hazard prompts could not be loaded" />
      ) : (
        <div className="prompt-grid">
          {(options.data ?? []).map((record) => {
            const prompt = draft.prompts.find((item) => item.promptId === record.id);
            const promptChange = changeFor(changes, 'PROMPT', prompt?.logicalKey ?? '');
            return (
              <div
                className={`prompt-item${prompt?.selected ? ' prompt-item-selected' : ''}${changedClass(
                  promptChange,
                  ['selected', 'responseNote'],
                )}`}
                key={record.id}
              >
                <Checkbox
                  disabled={disabled}
                  checked={prompt?.selected ?? false}
                  onChange={(event) => toggle(record, event.target.checked)}
                >
                  {record.name}
                </Checkbox>
              </div>
            );
          })}
        </div>
      )}
      {deletedChanges(changes, ['PROMPT']).map((change) => (
        <DeletedReference key={changeKey(change.entityType, change.logicalKey)} change={change} />
      ))}
    </section>
  );
}

function MatrixAxisReference({
  title,
  rows,
}: {
  title: 'PROBABILITY' | 'SEVERITY';
  rows: RiskAxisLevel[];
}) {
  return (
    <table className="matrix-axis-reference" aria-label={`${title} reference`}>
      <caption>{title}</caption>
      <thead>
        <tr>
          <th>CATEGORY</th>
          <th>DEFINITION</th>
        </tr>
      </thead>
      <tbody>
        {rows
          .slice()
          .sort((left, right) => left.displayOrder - right.displayOrder)
          .map((row) => (
            <tr key={row.id}>
              <td>
                <strong>{row.code}</strong>
                <small>{row.label}</small>
              </td>
              <td>{row.definition || row.label}</td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}

function RiskReferenceSection({ draft }: { draft: JsaDraftDetail }) {
  return (
    <section className="worksheet-section risk-reference">
      <SectionTitle title={`RISK MATRIX · ${draft.matrix.matrixName}`} />
      <div className="matrix-layout">
        <div className="matrix-axis-reference-group">
          <MatrixAxisReference title="PROBABILITY" rows={draft.matrix.likelihoods} />
          <MatrixAxisReference title="SEVERITY" rows={draft.matrix.severities} />
        </div>
        <div className="matrix-chart">
          <div className="matrix-chart-severity">SEVERITY</div>
          <div className="matrix-chart-probability">PROBABILITY</div>
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
                        title={
                          cell ? `${cell.riskResultName} (${cell.ratingCode})` : 'Not configured'
                        }
                      >
                        <strong>{cell?.ratingCode ?? '—'}</strong>
                        <span>{cell?.riskResultCode ?? 'N/A'}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
          </div>
        </div>
        <div className="risk-legend" aria-label="Risk colour overview">
          <div className="risk-legend-heading">RISK COLOUR OVERVIEW</div>
          {draft.matrix.results.map((result) => (
            <div
              className={`risk-legend-item${result.prohibited ? ' risk-legend-item--prohibited' : ''}`}
              key={result.id}
            >
              <span
                className="risk-legend-swatch"
                style={{ backgroundColor: result.displayColor }}
                aria-hidden="true"
              />
              <div className="risk-legend-copy">
                <div className="risk-legend-name">
                  <strong>{result.name}</strong>
                  {result.semanticCategory && <span>{result.semanticCategory}</span>}
                </div>
                {result.description && <p>{result.description}</p>}
                {result.guidanceText ? (
                  <p className="risk-legend-guidance">{result.guidanceText}</p>
                ) : (
                  <small className="risk-legend-unconfigured">Guidance not configured</small>
                )}
                {result.prohibited && (
                  <div className="risk-prohibited-note" role="note">
                    <ExclamationCircleOutlined aria-hidden="true" />
                    <span>
                      <strong>Not allowed as Residual Risk</strong>
                      <small>Reduce the risk before submitting for approval.</small>
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TaskRiskSection({
  draft,
  disabled,
  update,
  changes,
  markDeleted,
}: {
  draft: JsaDraftDetail;
  disabled: boolean;
  update: DraftUpdater;
  changes: ChangeMap;
  markDeleted: MarkDeleted;
}) {
  const resequence = (tasks: JsaDraftTask[]) =>
    tasks.map((task, index) => ({
      ...task,
      number: String(index + 1),
      displayOrder: index + 1,
    }));
  const newTask = (): JsaDraftTask => ({
    id: fresh(),
    logicalKey: '',
    number: '',
    title: '',
    displayOrder: 0,
    hazards: [emptyHazard()],
    rowVersion: '1',
  });
  const addTask = () =>
    update((current) => ({
      ...current,
      tasks: resequence([...current.tasks, newTask()]),
    }));
  const insertTaskAfter = (taskId: string) =>
    update((current) => {
      const index = current.tasks.findIndex((task) => task.id === taskId);
      if (index < 0) return current;
      const tasks = [...current.tasks];
      tasks.splice(index + 1, 0, newTask());
      return { ...current, tasks: resequence(tasks) };
    });
  const preserveDeletedTask = (task: JsaDraftTask) => {
    markDeleted(
      'TASK',
      task.logicalKey,
      task.title || `Task ${task.number ?? ''}`,
      `ROOT:${task.displayOrder}`,
      { number: task.number, title: task.title, description: task.description },
    );
    task.hazards.forEach((hazard) => {
      markDeleted(
        'HAZARD',
        hazard.logicalKey,
        hazard.text || 'Unnamed hazard',
        `${task.logicalKey}:${hazard.displayOrder}`,
        {
          text: hazard.text,
          initialLikelihoodId: hazard.initialRisk.likelihoodId,
          initialSeverityId: hazard.initialRisk.severityId,
          initialRatingCode: hazard.initialRisk.ratingCode,
          initialResultCode: hazard.initialRisk.resultCode,
          residualLikelihoodId: hazard.residualRisk.likelihoodId,
          residualSeverityId:
            hazard.residualRisk.severityId ?? hazard.initialRisk.severityId,
          residualRatingCode: hazard.residualRisk.ratingCode,
          residualResultCode: hazard.residualRisk.resultCode,
        },
      );
      hazard.controls.forEach((control) =>
        markDeleted(
          'CONTROL',
          control.logicalKey,
          control.text || 'Unnamed control',
          `${hazard.logicalKey}:${control.displayOrder}`,
          { text: control.text },
        ),
      );
    });
  };
  const removeTask = (task: JsaDraftTask) => {
    preserveDeletedTask(task);
    update((current) => ({
      ...current,
      tasks: current.tasks.filter((item) => item.id !== task.id),
    }));
  };
  const setTask = (task: JsaDraftTask) =>
    update((current) => ({
      ...current,
      tasks: current.tasks.map((item) => (item.id === task.id ? task : item)),
    }));
  const taskTimeline: Array<
    | { kind: 'active'; task: JsaDraftTask }
    | { kind: 'deleted'; change: JsaVersionChange }
  > = draft.tasks
    .slice()
    .sort((left, right) => left.displayOrder - right.displayOrder)
    .map((task) => ({ kind: 'active' as const, task }));
  deletedChanges(changes, ['TASK'])
    .slice()
    .sort(
      (left, right) =>
        Number(left.oldPosition?.split(':').at(-1) ?? 0) -
        Number(right.oldPosition?.split(':').at(-1) ?? 0),
    )
    .forEach((change) => {
      const oldIndex = Math.max(0, Number(change.oldPosition?.split(':').at(-1) ?? 1) - 1);
      taskTimeline.splice(Math.min(oldIndex, taskTimeline.length), 0, {
        kind: 'deleted',
        change,
      });
    });
  return (
    <section className="worksheet-section">
      <SectionTitle
        title="TASK / HAZARD / CONTROL ASSESSMENT"
        count={draft.tasks.length}
        extra={
          !disabled ? (
            <Button size="small" icon={<PlusCircleOutlined />} onClick={addTask}>
              Add Task
            </Button>
          ) : undefined
        }
      />
      <div className="worksheet-table-wrap">
        <table
          className={`worksheet-table task-risk-table${disabled ? ' task-risk-table--readonly' : ''}`}
        >
          <colgroup>
            <col className="task-risk-col-number" />
            <col className="task-risk-col-task" />
            <col className="task-risk-col-hazard" />
            <col className="task-risk-col-select" />
            <col className="task-risk-col-select" />
            <col className="task-risk-col-result" />
            <col className="task-risk-col-controls" />
            <col className="task-risk-col-select" />
            <col className="task-risk-col-select" />
            <col className="task-risk-col-result" />
            {!disabled ? <col className="task-risk-col-delete" /> : null}
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2}>No.</th>
              <th rowSpan={2}>Task</th>
              <th rowSpan={2}>Hazard</th>
              <th colSpan={3}>Initial Risk</th>
              <th rowSpan={2}>Controls</th>
              <th colSpan={3}>Residual Risk</th>
              {!disabled ? <th rowSpan={2}>Del</th> : null}
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
            {taskTimeline.length === 0 && (
              <tr>
                <td colSpan={disabled ? 10 : 11} className="worksheet-empty">
                  {disabled ? 'No Task recorded.' : 'No Task yet. Select “Add Task” to begin.'}
                </td>
              </tr>
            )}
            {taskTimeline.flatMap((entry, taskIndex) => {
              if (entry.kind === 'deleted')
                return (
                  <DeletedTaskRows
                    key={`deleted-task:${entry.change.logicalKey}`}
                    changes={changes}
                    draft={draft}
                    disabled={disabled}
                    taskLogicalKey={entry.change.logicalKey}
                  />
                );
              const task = entry.task;
              const hazards = task.hazards.length ? task.hazards : [emptyHazard()];
              return [
                ...hazards.map((hazard, hazardIndex) => (
                  <TaskHazardRow
                    key={`${task.id}-${hazard.id}`}
                    task={task}
                    taskIndex={taskIndex}
                    hazard={hazard}
                    hazardIndex={hazardIndex}
                    draft={draft}
                    disabled={disabled}
                    changes={changes}
                    change={(next) =>
                      setTask({
                        ...task,
                        hazards: task.hazards.some((item) => item.id === hazard.id)
                          ? task.hazards.map((item) => (item.id === hazard.id ? next : item))
                          : [next],
                      })
                    }
                    changeTask={setTask}
                    removeHazard={() => {
                      if (task.hazards.length <= 1) {
                        removeTask(task);
                        return;
                      }
                      markDeleted(
                        'HAZARD',
                        hazard.logicalKey,
                        hazard.text || 'Unnamed hazard',
                        `${task.logicalKey}:${hazard.displayOrder}`,
                        {
                          text: hazard.text,
                          initialLikelihoodId: hazard.initialRisk.likelihoodId,
                          initialSeverityId: hazard.initialRisk.severityId,
                          initialRatingCode: hazard.initialRisk.ratingCode,
                          initialResultCode: hazard.initialRisk.resultCode,
                          residualLikelihoodId: hazard.residualRisk.likelihoodId,
                          residualSeverityId:
                            hazard.residualRisk.severityId ?? hazard.initialRisk.severityId,
                          residualRatingCode: hazard.residualRisk.ratingCode,
                          residualResultCode: hazard.residualRisk.resultCode,
                        },
                      );
                      hazard.controls.forEach((control) =>
                        markDeleted(
                          'CONTROL',
                          control.logicalKey,
                          control.text || 'Unnamed control',
                          `${hazard.logicalKey}:${control.displayOrder}`,
                          { text: control.text },
                        ),
                      );
                      setTask({
                        ...task,
                        hazards: task.hazards.filter((item) => item.id !== hazard.id),
                      });
                    }}
                    insertTaskAfter={() => insertTaskAfter(task.id)}
                    removeTask={() => removeTask(task)}
                  />
                )),
                <DeletedTaskRows
                  key={`deleted-children:${task.logicalKey}`}
                  changes={changes}
                  draft={draft}
                  disabled={disabled}
                  taskLogicalKey={task.logicalKey}
                  excludeTask
                />,
              ];
            })}
          </tbody>
        </table>
      </div>
      {!disabled ? (
        <Button type="link" icon={<PlusCircleOutlined />} onClick={addTask}>
          Add more Task
        </Button>
      ) : null}
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
  changes,
  change,
  changeTask,
  removeHazard,
  insertTaskAfter,
  removeTask,
}: {
  task: JsaDraftTask;
  taskIndex: number;
  hazard: JsaDraftHazard;
  hazardIndex: number;
  draft: JsaDraftDetail;
  disabled: boolean;
  changes: ChangeMap;
  change: (hazard: JsaDraftHazard) => void;
  changeTask: (task: JsaDraftTask) => void;
  removeHazard: () => void;
  insertTaskAfter: () => void;
  removeTask: () => void;
}) {
  const taskChange = changeFor(changes, 'TASK', task.logicalKey);
  const hazardChange = changeFor(changes, 'HAZARD', hazard.logicalKey);
  const controlChange = changeFor(
    changes,
    'CONTROL',
    hazard.controls[0]?.logicalKey ?? '',
  );
  const rowAdded = added(taskChange, task.id) || added(hazardChange, hazard.id);
  const [riskPicker, setRiskPicker] = useState<{
    kind: 'initialRisk' | 'residualRisk';
    axis: 'probability' | 'severity';
  }>();
  const activeRiskLevels =
    riskPicker?.axis === 'severity'
      ? draft.matrix.severities.filter((item) => item.active)
      : draft.matrix.likelihoods.filter((item) => item.active);
  const selectedRiskLevelId = riskPicker
    ? riskPicker.axis === 'severity'
      ? hazard.initialRisk.severityId
      : hazard[riskPicker.kind].likelihoodId
    : undefined;
  const selectRiskLevel = (level: RiskAxisLevel) => {
    if (!riskPicker) return;
    if (riskPicker.axis === 'severity') {
      change({
        ...hazard,
        initialRisk: { ...hazard.initialRisk, severityId: level.id },
        residualRisk: { ...hazard.residualRisk, severityId: level.id },
      });
    } else {
      change({
        ...hazard,
        [riskPicker.kind]: {
          ...hazard[riskPicker.kind],
          likelihoodId: level.id,
        },
      });
    }
    setRiskPicker(undefined);
  };
  const risk = (kind: 'initialRisk' | 'residualRisk') => {
    const isResidual = kind === 'residualRisk';
    const selection = isResidual
      ? { ...hazard.residualRisk, severityId: hazard.initialRisk.severityId }
      : hazard.initialRisk;
    const cell = draft.matrix.cells.find(
      (item) =>
        item.likelihoodId === selection.likelihoodId && item.severityId === selection.severityId,
    );
    const probabilityCode =
      draft.matrix.likelihoods.find((item) => item.id === selection.likelihoodId)?.code ?? '—';
    const severityCode =
      draft.matrix.severities.find((item) => item.id === selection.severityId)?.code ?? '—';
    return (
      <>
        <td
          className={`risk-select-cell${changedClass(changeFor(changes, 'HAZARD', hazard.logicalKey), [
            isResidual ? 'residualLikelihoodId' : 'initialLikelihoodId',
          ])}`}
        >
          {disabled ? (
            <strong className="risk-readonly-value" aria-label={`${kind} probability`}>
              {probabilityCode}
            </strong>
          ) : (
            <Button
              className="risk-picker-trigger"
              aria-label={`${kind} probability`}
              onClick={() =>
                setRiskPicker({
                  kind,
                  axis: 'probability',
                })
              }
            >
              {probabilityCode}
            </Button>
          )}
        </td>
        <td
          className={`risk-select-cell${changedClass(changeFor(changes, 'HAZARD', hazard.logicalKey), [
            isResidual ? 'residualSeverityId' : 'initialSeverityId',
          ])}`}
        >
          {disabled ? (
            <strong className="risk-readonly-value" aria-label={`${kind} severity`}>
              {severityCode}
            </strong>
          ) : (
            <Button
              className="risk-picker-trigger"
              disabled={isResidual}
              aria-label={`${kind} severity`}
              title={
                isResidual ? 'Residual Severity is inherited from Initial Severity' : undefined
              }
              onClick={() =>
                setRiskPicker({
                  kind,
                  axis: 'severity',
                })
              }
            >
              {severityCode}
            </Button>
          )}
        </td>
        <td
          className={`risk-result-cell${changedClass(
            changeFor(changes, 'HAZARD', hazard.logicalKey),
            isResidual
              ? ['residualRatingCode', 'residualResultCode']
              : ['initialRatingCode', 'initialResultCode'],
          )}`}
        >
          <span style={{ backgroundColor: cell?.displayColor }}>{cell?.ratingCode ?? '—'}</span>
          <small>{cell?.riskResultCode ?? 'Select P/S'}</small>
        </td>
      </>
    );
  };
  return (
    <>
      <tr
        className={rowAdded ? 'worksheet-added-grid-row' : undefined}
        aria-label={rowAdded ? `Added row: ${task.title || `Task ${taskIndex + 1}`}` : undefined}
      >
        <td>{hazardIndex === 0 ? taskIndex + 1 : null}</td>
        <td className={`task-cell${changedClass(taskChange, ['number', 'title', 'description'])}`}>
          {hazardIndex === 0 ? (
            <>
              <Input.TextArea
                readOnly={disabled}
                aria-label={`Task ${taskIndex + 1}`}
                placeholder="Task / sequence of work"
                autoSize={{ minRows: 2, maxRows: 6 }}
                value={task.title}
                onChange={(event) => changeTask({ ...task, title: event.target.value })}
              />
              {!disabled ? (
                <Space wrap size={4}>
                  <Button
                    size="small"
                    type="link"
                    onClick={() =>
                      changeTask({
                        ...task,
                        hazards: [...task.hazards, emptyHazard()],
                      })
                    }
                  >
                    + Hazard
                  </Button>
                  <Button
                    size="small"
                    type="link"
                    icon={<PlusOutlined />}
                    aria-label={`Insert task after task ${taskIndex + 1}`}
                    title={`Insert a new task after task ${taskIndex + 1}`}
                    onClick={insertTaskAfter}
                  >
                    Task
                  </Button>
                  <Button size="small" type="link" danger onClick={removeTask}>
                    Delete Task
                  </Button>
                </Space>
              ) : null}
            </>
          ) : (
            <span className="continued-label">Task {taskIndex + 1} continued</span>
          )}
        </td>
        <td className={`hazard-cell${changedClass(hazardChange, ['text'])}`}>
          <Input.TextArea
            readOnly={disabled}
            aria-label={`Hazard ${hazardIndex + 1} for task ${taskIndex + 1}`}
            placeholder="Potential hazard"
            autoSize={{ minRows: 3, maxRows: 8 }}
            value={hazard.text}
            onChange={(event) => change({ ...hazard, text: event.target.value })}
          />
        </td>
        {risk('initialRisk')}
        <td className={`controls-cell${changedClass(controlChange, ['text'])}`}>
          <Input.TextArea
            readOnly={disabled}
            aria-label="Hazard control"
            placeholder="Control to reduce potential hazard"
            autoSize={{ minRows: 3, maxRows: 8 }}
            value={hazard.controls[0]?.text ?? ''}
            onChange={(event) => {
              const control = hazard.controls[0] ?? emptyControl();
              change({
                ...hazard,
                controls: [{ ...control, text: event.target.value, displayOrder: 1 }],
              });
            }}
          />
        </td>
        {risk('residualRisk')}
        {!disabled ? (
          <td className="task-risk-delete-cell">
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              aria-label={
                task.hazards.length <= 1 ? 'Delete task and its only hazard' : 'Remove hazard'
              }
              title={task.hazards.length <= 1 ? 'Delete task and its only hazard' : 'Remove hazard'}
              onClick={removeHazard}
            />
          </td>
        ) : null}
      </tr>
      {!disabled ? (
        <Modal
          title={riskPicker?.axis === 'probability' ? 'P — PROBABILITY' : 'S — SEVERITY'}
          open={Boolean(riskPicker)}
          centered
          footer={<Button onClick={() => setRiskPicker(undefined)}>Close</Button>}
          onCancel={() => setRiskPicker(undefined)}
          width={620}
          destroyOnHidden
        >
          <div className="reference-table-wrap">
            <table className="reference-table risk-picker-table">
              <thead>
                <tr>
                  <th>CATEGORY (Detail)</th>
                  <th>DEFINITION</th>
                </tr>
              </thead>
              <tbody>
                {activeRiskLevels
                  .slice()
                  .sort((left, right) => left.displayOrder - right.displayOrder)
                  .map((level) => (
                    <tr
                      className={level.id === selectedRiskLevelId ? 'risk-picker-row-selected' : ''}
                      key={level.id}
                      onClick={() => selectRiskLevel(level)}
                    >
                      <td>
                        <button
                          type="button"
                          className="risk-picker-option"
                          aria-label={`Select ${riskPicker?.axis ?? 'risk'} ${level.code}: ${level.label}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            selectRiskLevel(level);
                          }}
                        >
                          {level.code}
                        </button>
                      </td>
                      <td>{level.definition || level.label}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

const previousValue = (change: JsaVersionChange | undefined, field: string) =>
  change?.fields.find((item) => item.field === field)?.oldValue;
const parentLogicalKey = (position?: string) =>
  position?.slice(0, position.lastIndexOf(':')) || undefined;

type AssignmentDisplayValue = {
  key: string;
  label: string;
  state?: 'added' | 'changed' | 'deleted';
};

const assignmentDisplayValues = (
  changes: ChangeMap,
  entityType: 'PERFORMER' | 'SUPERVISOR' | 'TOOL',
  current: Array<{ id: string; logicalKey: string; name: string }>,
  stepLogicalKey: string,
): AssignmentDisplayValue[] => {
  const currentLogicalKeys = new Set(current.map((item) => item.logicalKey).filter(Boolean));
  const values = current.map((item) => {
    const change = changeFor(changes, entityType, item.logicalKey);
    return {
      key: item.logicalKey || item.id,
      label: item.name,
      ...(added(change, item.id)
        ? { state: 'added' as const }
        : changed(change)
          ? { state: 'changed' as const }
          : {}),
    };
  });
  const removed = [...changes.values()]
    .filter(
      (change) =>
        change.entityType === entityType &&
        change.changeType === 'DELETED' &&
        parentLogicalKey(change.oldPosition) === stepLogicalKey &&
        !currentLogicalKeys.has(change.logicalKey),
    )
    .map((change) => ({
      key: `deleted:${change.logicalKey}`,
      label: change.label,
      state: 'deleted' as const,
    }));
  return [...values, ...removed];
};

const assignmentCellClass = (values: AssignmentDisplayValue[], rowAdded: boolean) => {
  if (rowAdded) return undefined;
  if (values.some((value) => value.state === 'changed' || value.state === 'deleted'))
    return 'worksheet-cell--changed';
  if (values.some((value) => value.state === 'added')) return 'worksheet-cell--added';
  return undefined;
};

function DeletedTaskRows({
  changes,
  draft,
  disabled,
  taskLogicalKey,
  excludeTask = false,
}: {
  changes: ChangeMap;
  draft: JsaDraftDetail;
  disabled: boolean;
  taskLogicalKey: string;
  excludeTask?: boolean;
}) {
  const tasks = deletedChanges(changes, ['TASK']).filter(
    (task) => task.logicalKey === taskLogicalKey,
  );
  const hazards = deletedChanges(changes, ['HAZARD']).filter(
    (hazard) => parentLogicalKey(hazard.oldPosition) === taskLogicalKey,
  );
  const controls = deletedChanges(changes, ['CONTROL']);
  const rows: Array<{
    key: string;
    task?: JsaVersionChange;
    currentTask?: JsaDraftTask;
    hazard?: JsaVersionChange;
    currentHazard?: JsaDraftHazard;
    controls: JsaVersionChange[];
  }> = [];

  hazards.forEach((hazard) => {
    const taskKey = parentLogicalKey(hazard.oldPosition);
    const task = tasks.find((item) => item.logicalKey === taskKey);
    const currentTask = draft.tasks.find((item) => item.logicalKey === taskKey);
    rows.push({
      key: `hazard:${hazard.logicalKey}`,
      task,
      currentTask,
      hazard,
      controls: controls.filter(
        (control) => parentLogicalKey(control.oldPosition) === hazard.logicalKey,
      ),
    });
  });
  tasks
    .filter(() => !excludeTask)
    .filter(
      (task) => !hazards.some((hazard) => parentLogicalKey(hazard.oldPosition) === task.logicalKey),
    )
    .forEach((task) =>
      rows.push({ key: `task:${task.logicalKey}`, task, controls: [] }),
    );
  controls
    .filter(
      (control) =>
        !hazards.some(
          (hazard) => hazard.logicalKey === parentLogicalKey(control.oldPosition),
        ),
    )
    .forEach((control) => {
      const hazardKey = parentLogicalKey(control.oldPosition);
      const currentTask = draft.tasks.find((task) =>
        task.logicalKey === taskLogicalKey &&
        task.hazards.some((hazard) => hazard.logicalKey === hazardKey),
      );
      if (!currentTask) return;
      rows.push({
        key: `control:${control.logicalKey}`,
        currentTask,
        currentHazard: currentTask?.hazards.find(
          (hazard) => hazard.logicalKey === hazardKey,
        ),
        controls: [control],
      });
    });

  const axisCode = (
    levels: RiskAxisLevel[],
    id: string | number | boolean | null | undefined,
  ) => levels.find((level) => level.id === String(id ?? ''))?.code ?? String(id ?? '—');
  const riskResult = (
    hazard: JsaVersionChange | undefined,
    current: JsaDraftHazard | undefined,
    kind: 'initial' | 'residual',
  ) => {
    const prefix = kind === 'initial' ? 'initial' : 'residual';
    const selection = kind === 'initial' ? current?.initialRisk : current?.residualRisk;
    const likelihood =
      previousValue(hazard, `${prefix}LikelihoodId`) ?? selection?.likelihoodId;
    const severity =
      previousValue(hazard, `${prefix}SeverityId`) ??
      selection?.severityId ??
      current?.initialRisk.severityId;
    return {
      probability: axisCode(draft.matrix.likelihoods, likelihood),
      severity: axisCode(draft.matrix.severities, severity),
      rating: String(
        previousValue(hazard, `${prefix}RatingCode`) ?? selection?.ratingCode ?? '—',
      ),
      result: String(
        previousValue(hazard, `${prefix}ResultCode`) ?? selection?.resultCode ?? '',
      ),
    };
  };

  return rows.map((row) => {
    const taskTitle = String(
      previousValue(row.task, 'title') ?? row.currentTask?.title ?? row.task?.label ?? '—',
    );
    const taskNumber = String(
      previousValue(row.task, 'number') ?? row.currentTask?.number ?? '—',
    );
    const hazardText = String(
      previousValue(row.hazard, 'text') ??
        row.currentHazard?.text ??
        row.hazard?.label ??
        '—',
    );
    const initial = riskResult(row.hazard, row.currentHazard, 'initial');
    const residual = riskResult(row.hazard, row.currentHazard, 'residual');
    const controlText =
      row.controls
        .map((control) => String(previousValue(control, 'text') ?? control.label))
        .join('\n') || '—';
    return (
      <tr
        className="worksheet-deleted-grid-row"
        aria-label={`Deleted row: ${taskTitle}`}
        key={row.key}
      >
        <td>
          <del>{taskNumber}</del>
          <Tag>Deleted</Tag>
        </td>
        <td className="task-cell">
          <del>{taskTitle}</del>
        </td>
        <td className="hazard-cell">
          <del>{hazardText}</del>
        </td>
        <td className="risk-select-cell">
          <del>{initial.probability}</del>
        </td>
        <td className="risk-select-cell">
          <del>{initial.severity}</del>
        </td>
        <td className="risk-result-cell">
          <del>{initial.rating}</del>
          <small>{initial.result}</small>
        </td>
        <td className="controls-cell">
          <del>{controlText}</del>
        </td>
        <td className="risk-select-cell">
          <del>{residual.probability}</del>
        </td>
        <td className="risk-select-cell">
          <del>{residual.severity}</del>
        </td>
        <td className="risk-result-cell">
          <del>{residual.rating}</del>
          <small>{residual.result}</small>
        </td>
        {!disabled ? <td aria-hidden="true" /> : null}
      </tr>
    );
  });
}

function emptyHazard(): JsaDraftHazard {
  return {
    id: fresh(),
    logicalKey: '',
    text: '',
    displayOrder: 1,
    initialRisk: {},
    residualRisk: {},
    controls: [emptyControl()],
    rowVersion: '1',
  };
}

function emptyControl(): JsaDraftHazard['controls'][number] {
  return {
    id: fresh(),
    logicalKey: '',
    text: '',
    displayOrder: 1,
    rowVersion: '1',
  };
}

function BasicStepSection({
  draft,
  disabled,
  update,
  changes,
  markDeleted,
}: {
  draft: JsaDraftDetail;
  disabled: boolean;
  update: DraftUpdater;
  changes: ChangeMap;
  markDeleted: MarkDeleted;
}) {
  const suffix = `?siteId=${draft.ownerSiteId}&rigId=${draft.rigId}&departmentId=${draft.departmentId}`;
  const positions = useQuery({
    queryKey: ['jsa-options', 'positions', suffix],
    queryFn: () => jsaApi.options<MasterDataRecord>('positions', suffix),
    enabled: !disabled,
  });
  const tools = useQuery({
    queryKey: ['jsa-options', 'tools', suffix],
    queryFn: () => jsaApi.options<MasterDataRecord>('tools', suffix),
    enabled: !disabled,
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
      step.tools
        .filter((item) => persisted(item.id) && !ids.includes(item.toolId))
        .forEach((item) =>
          markDeleted(
            'TOOL',
            item.logicalKey,
            item.name,
            `${step.logicalKey}:${item.displayOrder}`,
            { code: item.code, name: item.name },
          ),
        );
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
      source
        .filter((item) => persisted(item.id) && !ids.includes(item.positionId))
        .forEach((item) =>
          markDeleted(
            picker.kind === 'performers' ? 'PERFORMER' : 'SUPERVISOR',
            item.logicalKey,
            item.name,
            `${step.logicalKey}:${item.displayOrder}`,
            { code: item.code, name: item.name },
          ),
        );
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
          !disabled ? (
            <Button size="small" icon={<PlusCircleOutlined />} onClick={addStep}>
              Add Basic Job Step
            </Button>
          ) : undefined
        }
      />
      <div className="worksheet-table-wrap">
        <table
          className={`worksheet-table basic-step-table${disabled ? ' basic-step-table--readonly' : ''}`}
        >
          <thead>
            <tr>
              <th>No.</th>
              <th>Basic Job Step</th>
              <th>Who performs task?</th>
              <th>Who supervises task?</th>
              <th>Tools required?</th>
              {!disabled ? <th>Del</th> : null}
            </tr>
          </thead>
          <tbody>
            {draft.basicSteps.length === 0 && (
              <tr>
                <td colSpan={disabled ? 5 : 6} className="worksheet-empty">
                  No Basic Job Step yet.
                </td>
              </tr>
            )}
            {draft.basicSteps.map((item, index) => {
              const stepChange = changeFor(changes, 'BASIC_STEP', item.logicalKey);
              const rowAdded = added(stepChange, item.id);
              const performerValues = assignmentDisplayValues(
                changes,
                'PERFORMER',
                item.performers,
                item.logicalKey,
              );
              const supervisorValues = assignmentDisplayValues(
                changes,
                'SUPERVISOR',
                item.supervisors,
                item.logicalKey,
              );
              const toolValues = assignmentDisplayValues(
                changes,
                'TOOL',
                item.tools,
                item.logicalKey,
              );
              return (
              <tr
                key={item.id}
                className={rowAdded ? 'worksheet-added-grid-row' : undefined}
                aria-label={
                  rowAdded
                    ? `Added row: ${item.text || `Basic Job Step ${index + 1}`}`
                    : undefined
                }
              >
                <td className={changedClass(stepChange, ['number'])}>
                  <Input
                    readOnly={disabled}
                    aria-label={`Basic Job Step ${index + 1} number`}
                    value={item.number}
                    onChange={(event) => change({ ...item, number: event.target.value })}
                  />
                </td>
                <td className={changedClass(stepChange, ['text'])}>
                  <Input.TextArea
                    readOnly={disabled}
                    aria-label={`Basic Job Step ${index + 1}`}
                    autoSize={{ minRows: 2, maxRows: 6 }}
                    value={item.text}
                    onChange={(event) => change({ ...item, text: event.target.value })}
                  />
                </td>
                <td
                  className={assignmentCellClass(performerValues, rowAdded)}
                >
                  <AssignmentButton
                    icon={<UserOutlined />}
                    label="Select performers"
                    values={performerValues}
                    readOnly={disabled}
                    onClick={() => setPicker({ stepId: item.id, kind: 'performers' })}
                  />
                </td>
                <td
                  className={assignmentCellClass(supervisorValues, rowAdded)}
                >
                  <AssignmentButton
                    icon={<UserOutlined />}
                    label="Select supervisors"
                    values={supervisorValues}
                    readOnly={disabled}
                    onClick={() => setPicker({ stepId: item.id, kind: 'supervisors' })}
                  />
                </td>
                <td
                  className={
                    changed(stepChange, ['noToolRequired']) ||
                    assignmentCellClass(toolValues, rowAdded) === 'worksheet-cell--changed'
                      ? 'worksheet-cell--changed'
                      : assignmentCellClass(toolValues, rowAdded)
                  }
                >
                  {disabled ? (
                    <>
                      <AssignmentButton
                        icon={<ToolOutlined />}
                        label="Select tools"
                        values={toolValues}
                        readOnly
                        onClick={() => setPicker({ stepId: item.id, kind: 'tools' })}
                      />
                      {item.noToolRequired ? <Tag>No tool required</Tag> : null}
                    </>
                  ) : (
                    <>
                      <AssignmentButton
                        icon={<ToolOutlined />}
                        label="Select tools"
                        values={toolValues}
                        disabled={item.noToolRequired}
                        onClick={() => setPicker({ stepId: item.id, kind: 'tools' })}
                      />
                      <Checkbox
                        checked={item.noToolRequired}
                        onChange={(event) => {
                          if (event.target.checked)
                            item.tools
                              .filter((tool) => persisted(tool.id))
                              .forEach((tool) =>
                                markDeleted(
                                  'TOOL',
                                  tool.logicalKey,
                                  tool.name,
                                  `${item.logicalKey}:${tool.displayOrder}`,
                                  { code: tool.code, name: tool.name },
                                ),
                              );
                          change({
                            ...item,
                            noToolRequired: event.target.checked,
                            ...(event.target.checked ? { tools: [] } : {}),
                          });
                        }}
                      >
                        No tool required
                      </Checkbox>
                    </>
                  )}
                </td>
                {!disabled ? (
                  <td>
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      aria-label={`Delete Basic Job Step ${index + 1}`}
                      onClick={() => {
                        markDeleted(
                          'BASIC_STEP',
                          item.logicalKey,
                          item.text || `Basic Job Step ${item.number ?? index + 1}`,
                        );
                        item.performers.forEach((assignment) =>
                          markDeleted('PERFORMER', assignment.logicalKey, assignment.name),
                        );
                        item.supervisors.forEach((assignment) =>
                          markDeleted('SUPERVISOR', assignment.logicalKey, assignment.name),
                        );
                        item.tools.forEach((assignment) =>
                          markDeleted('TOOL', assignment.logicalKey, assignment.name),
                        );
                        update((current) => ({
                          ...current,
                          basicSteps: current.basicSteps.filter(
                            (stepItem) => stepItem.id !== item.id,
                          ),
                        }));
                      }}
                    />
                  </td>
                ) : null}
              </tr>
              );
            })}
            {deletedChanges(changes, ['BASIC_STEP']).map((change) => (
              <tr
                className="worksheet-deleted-row"
                key={changeKey(change.entityType, change.logicalKey)}
              >
                <td colSpan={disabled ? 5 : 6}>
                  <DeletedReference change={change} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!disabled ? (
        <>
          <Button type="link" icon={<PlusCircleOutlined />} onClick={addStep}>
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
        </>
      ) : null}
    </section>
  );
}

function AssignmentButton({
  icon,
  label,
  values,
  readOnly = false,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  values: AssignmentDisplayValue[];
  readOnly?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const selectedCount = values.filter((value) => value.state !== 'deleted').length;
  return (
    <div className={`assignment-summary${readOnly ? ' assignment-summary--readonly' : ''}`}>
      {!readOnly ? (
        <Button icon={icon} disabled={disabled} onClick={onClick}>
          {label} ({selectedCount})
        </Button>
      ) : null}
      <div className="assignment-values">
        {values.map((value) => (
          <Tag
            key={value.key}
            color={
              value.state === 'added' ? 'green' : value.state === 'changed' ? 'red' : undefined
            }
            className={
              value.state ? `assignment-value assignment-value--${value.state}` : undefined
            }
          >
            {value.state === 'deleted' ? <del>{value.label}</del> : value.label}
          </Tag>
        ))}
        {readOnly && selectedCount === 0 ? <span>None recorded</span> : null}
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
  changes,
  markDeleted,
}: {
  draft: JsaDraftDetail;
  disabled: boolean;
  update: DraftUpdater;
  changes: ChangeMap;
  markDeleted: MarkDeleted;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerFolderId, setPickerFolderId] = useState<string>();
  const [pickerSearch, setPickerSearch] = useState('');
  const scope = `siteId=${draft.ownerSiteId}&rigId=${draft.rigId}&departmentId=${draft.departmentId}`;
  const library = useQuery({
    queryKey: ['attachment-library-picker', draft.ownerSiteId, draft.rigId, draft.departmentId],
    queryFn: () =>
      jsaApi.attachmentPicker<{
        folders: AttachmentLibraryFolder[];
        assets: AttachmentLibraryAsset[];
      }>(scope),
    enabled: pickerOpen,
  });
  useEffect(() => {
    if (pickerOpen) {
      setPickerFolderId(undefined);
      setPickerSearch('');
    }
  }, [pickerOpen, draft.ownerSiteId, draft.rigId, draft.departmentId]);
  const selected = new Set(
    draft.attachments
      .map((item) => item.libraryAssetVersionId)
      .filter((value): value is string => Boolean(value)),
  );
  const toggle = (asset: AttachmentLibraryAsset, checked: boolean) => {
    if (!checked) {
      const existing = draft.attachments.find(
        (item) => item.libraryAssetVersionId === asset.currentVersionId,
      );
      if (existing) markDeleted('ATTACHMENT', existing.logicalKey, existing.fileName);
    }
    update((current) => ({
      ...current,
      attachments: checked
        ? [
            ...current.attachments,
            {
              id: fresh(),
              logicalKey: '',
              libraryAssetVersionId: asset.currentVersionId,
              fileName: asset.originalFileName,
              contentType: asset.contentType,
              fileSize: asset.fileSize,
              storageKey: undefined,
              status: 'STORED',
              description: asset.description,
              rowVersion: '1',
            },
          ]
        : current.attachments.filter(
            (item) => item.libraryAssetVersionId !== asset.currentVersionId,
          ),
    }));
  };
  const folders = (library.data?.folders ?? []).filter(
    (folder) =>
      folder.active &&
      folder.siteId === draft.ownerSiteId &&
      folder.rigId === draft.rigId &&
      folder.departmentId === draft.departmentId,
  );
  const assets = (library.data?.assets ?? []).filter((asset) => asset.active);
  const selectedFolder = pickerFolderId
    ? folders.find((folder) => folder.id === pickerFolderId)
    : undefined;
  const childFolders = folders.filter((folder) =>
    selectedFolder ? folder.parentFolderId === selectedFolder.id : !folder.parentFolderId,
  );
  const currentAssets = selectedFolder
    ? assets.filter((asset) => asset.folderId === selectedFolder.id)
    : [];
  const normalizedSearch = pickerSearch.trim().toLocaleLowerCase();
  const visibleFolders = childFolders.filter((folder) =>
    folder.name.toLocaleLowerCase().includes(normalizedSearch),
  );
  const visibleAssets = currentAssets.filter((asset) =>
    `${asset.name} ${asset.originalFileName}`.toLocaleLowerCase().includes(normalizedSearch),
  );
  const selectFolder = (folderId?: string) => {
    setPickerFolderId(folderId);
    setPickerSearch('');
  };
  const treeData = [
    {
      key: 'department-root',
      title: `${draft.departmentCode} — ${draft.departmentName}`,
      icon: <HomeOutlined />,
      children: buildAttachmentFolderTree(folders),
    },
  ];
  const breadcrumbs = [
    {
      title: (
        <span className="attachment-picker-breadcrumb-root">
          <FolderOpenOutlined /> {draft.rigCode} — {draft.rigName}
        </span>
      ),
    },
    {
      title: (
        <button
          type="button"
          className="attachment-picker-breadcrumb-button"
          onClick={() => selectFolder()}
        >
          {draft.departmentName}
        </button>
      ),
    },
    ...attachmentFolderAncestors(selectedFolder, folders).map((folder) => ({
      title: (
        <button
          type="button"
          className="attachment-picker-breadcrumb-button"
          onClick={() => selectFolder(folder.id)}
        >
          {folder.name}
        </button>
      ),
    })),
  ];
  return (
    <section className="worksheet-section">
      <SectionTitle title="ATTACHMENTS" />
      <div className="reference-grid attachment-only-grid">
        <Card
          size="small"
          title="Selected attachments"
          extra={
            !disabled ? (
              <Button onClick={() => setPickerOpen(true)}>Pick attachments</Button>
            ) : undefined
          }
        >
          {draft.attachments.filter((item) => item.libraryAssetVersionId).length === 0 ? (
            <Typography.Text type="secondary">No attachment selected.</Typography.Text>
          ) : null}
          {draft.attachments
            .filter((item) => item.libraryAssetVersionId)
            .map((item) => {
              const attachmentChange = changeFor(changes, 'ATTACHMENT', item.logicalKey);
              return (
              <div
                className={`list-row${changedClass(attachmentChange)}`}
                key={item.id}
              >
                <span>
                  {item.fileName} <Tag>Library</Tag>
                </span>
                {!disabled ? (
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    aria-label={`Remove attachment ${item.fileName}`}
                    onClick={() => {
                      markDeleted('ATTACHMENT', item.logicalKey, item.fileName);
                      update((current) => ({
                        ...current,
                        attachments: current.attachments.filter(
                          (attachment) => attachment.id !== item.id,
                        ),
                      }));
                    }}
                  />
                ) : null}
              </div>
              );
            })}
          {deletedChanges(changes, ['ATTACHMENT']).map((change) => (
            <DeletedReference
              key={changeKey(change.entityType, change.logicalKey)}
              change={change}
            />
          ))}
        </Card>
      </div>
      {!disabled ? (
        <Modal
          title="Pick attachments"
          open={pickerOpen}
          centered
          width={1120}
          className="attachment-picker-modal"
          footer={<Button onClick={() => setPickerOpen(false)}>Done</Button>}
          onCancel={() => setPickerOpen(false)}
          destroyOnHidden
        >
          <div className="attachment-picker-scope" aria-label="JSA attachment scope">
            <span>
              <strong>Site</strong>
              {draft.ownerSiteCode} — {draft.ownerSiteName}
            </span>
            <span>
              <strong>Rig</strong>
              {draft.rigCode} — {draft.rigName}
            </span>
            <span>
              <strong>Department</strong>
              {draft.departmentCode} — {draft.departmentName}
            </span>
          </div>
          {library.error ? (
            <Alert type="error" showIcon message="Attachment Library could not be loaded" />
          ) : null}
          <div className="attachment-picker-explorer" aria-label="Rig attachment file explorer">
            <aside className="attachment-picker-tree" aria-label="Attachment folders">
              <div className="attachment-picker-pane-heading">
                <Typography.Text strong>Folders</Typography.Text>
                <Typography.Text type="secondary">{folders.length} folders</Typography.Text>
              </div>
              <Spin spinning={library.isLoading}>
                <Tree
                  showIcon
                  defaultExpandAll
                  blockNode
                  treeData={treeData}
                  selectedKeys={[pickerFolderId ? `folder:${pickerFolderId}` : 'department-root']}
                  onSelect={(keys) => {
                    const key = String(keys[0] ?? '');
                    if (key === 'department-root') selectFolder();
                    if (key.startsWith('folder:')) selectFolder(key.slice('folder:'.length));
                  }}
                />
              </Spin>
            </aside>
            <main className="attachment-picker-content">
              <div className="attachment-picker-toolbar">
                <Breadcrumb items={breadcrumbs} />
                <Input
                  allowClear
                  aria-label="Filter current attachment folder"
                  prefix={<SearchOutlined />}
                  placeholder="Filter this folder"
                  value={pickerSearch}
                  onChange={(event) => setPickerSearch(event.target.value)}
                />
              </div>
              <div className="attachment-picker-summary" aria-live="polite">
                <Typography.Text strong>
                  {selectedFolder?.name ?? draft.departmentName}
                </Typography.Text>
                <Typography.Text type="secondary">
                  {visibleFolders.length} folders · {visibleAssets.length} files · {selected.size}{' '}
                  selected
                </Typography.Text>
              </div>
              <Spin spinning={library.isLoading}>
                {visibleFolders.length || visibleAssets.length ? (
                  <div className="attachment-picker-grid">
                    {visibleFolders.map((folder) => (
                      <button
                        type="button"
                        className="attachment-picker-item attachment-picker-folder"
                        key={folder.id}
                        onClick={() => selectFolder(folder.id)}
                      >
                        <FolderOutlined className="attachment-picker-icon" />
                        <span className="attachment-picker-name">{folder.name}</span>
                        <span className="attachment-picker-meta">Folder</span>
                      </button>
                    ))}
                    {visibleAssets.map((asset) => (
                      <article
                        className={`attachment-picker-item attachment-picker-file${
                          selected.has(asset.currentVersionId) ? ' is-selected' : ''
                        }`}
                        key={asset.id}
                      >
                        <Checkbox
                          aria-label={`Select attachment ${asset.name}`}
                          checked={selected.has(asset.currentVersionId)}
                          onChange={(event) => toggle(asset, event.target.checked)}
                        />
                        {attachmentFileIcon(asset)}
                        <span className="attachment-picker-name" title={asset.name}>
                          {asset.name}
                        </span>
                        <span className="attachment-picker-meta" title={asset.originalFileName}>
                          {asset.originalFileName}
                        </span>
                        <Tag>v{asset.versionNumber}</Tag>
                      </article>
                    ))}
                  </div>
                ) : !library.isLoading ? (
                  <div className="attachment-picker-empty">
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description={
                        normalizedSearch
                          ? 'No matching folders or files'
                          : selectedFolder
                            ? 'This folder is empty'
                            : 'No governed attachment is available for this JSA scope'
                      }
                    />
                  </div>
                ) : null}
              </Spin>
            </main>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}

function buildAttachmentFolderTree(folders: AttachmentLibraryFolder[]) {
  const childrenByParent = new Map<string, AttachmentLibraryFolder[]>();
  folders.forEach((folder) => {
    const parent = folder.parentFolderId ?? 'root';
    childrenByParent.set(parent, [...(childrenByParent.get(parent) ?? []), folder]);
  });
  const visit = (parentId: string, ancestors: Set<string>): Array<Record<string, unknown>> =>
    (childrenByParent.get(parentId) ?? []).map((folder) => ({
      key: `folder:${folder.id}`,
      title: folder.name,
      icon: <FolderOutlined />,
      children: ancestors.has(folder.id) ? [] : visit(folder.id, new Set(ancestors).add(folder.id)),
    }));
  return visit('root', new Set());
}

function attachmentFolderAncestors(
  folder: AttachmentLibraryFolder | undefined,
  folders: AttachmentLibraryFolder[],
) {
  const result: AttachmentLibraryFolder[] = [];
  const visited = new Set<string>();
  let current = folder;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    result.unshift(current);
    current = current.parentFolderId
      ? folders.find((candidate) => candidate.id === current?.parentFolderId)
      : undefined;
  }
  return result;
}

function attachmentFileIcon(asset: AttachmentLibraryAsset) {
  const props = { className: 'attachment-picker-icon', 'aria-hidden': true };
  if (asset.contentType === 'application/pdf') return <FilePdfOutlined {...props} />;
  if (asset.contentType.includes('word')) return <FileWordOutlined {...props} />;
  if (asset.contentType.includes('sheet') || asset.contentType.includes('excel'))
    return <FileExcelOutlined {...props} />;
  if (asset.contentType.includes('presentation') || asset.contentType.includes('powerpoint'))
    return <FilePptOutlined {...props} />;
  if (asset.contentType.startsWith('image/')) return <FileImageOutlined {...props} />;
  return <FileOutlined {...props} />;
}

function ValidationSection({ result }: { result?: JsaValidationResult }) {
  if (!result) return null;
  return (
    <section className="worksheet-section validation-section" aria-live="polite">
      <SectionTitle
        title="VALIDATION RESULT"
        count={result.errors.length + result.warnings.length}
      />
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
          severityId: hazard.initialRisk.severityId,
        },
        controls: hazard.controls.map((control) => ({
          ...meta(control),
          text: control.text,
          displayOrder: control.displayOrder,
        })),
      })),
    })),
    coverage: [],
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
    procedureReferences: [],
    attachments: draft.attachments
      .filter((item) => item.libraryAssetVersionId)
      .map((item) => ({
        ...meta(item),
        libraryAssetVersionId: item.libraryAssetVersionId!,
      })),
  };
}

function savePayload(
  draft: JsaDraftDetail,
  versions: Pick<JsaDraftDetail, 'rowVersion' | 'versionRowVersion'> = draft,
) {
  return {
    ...serialize(draft),
    rowVersion: versions.rowVersion,
    versionRowVersion: versions.versionRowVersion,
    jobTitle: draft.jobTitle,
  };
}

function canRetryRootVersionConflict(
  current: JsaDraftDetail,
  latest: JsaDraftDetail,
  baseline?: JsaDraftDetail,
) {
  const headerIsSafe =
    sameBusinessHeader(current, latest) ||
    (baseline !== undefined && sameBusinessHeader(baseline, latest));
  const expectedFingerprint = baseline
    ? persistedVersionFingerprint(baseline)
    : persistedVersionFingerprint(current);
  return headerIsSafe && expectedFingerprint === persistedVersionFingerprint(latest);
}

function sameBusinessHeader(left: JsaDraftDetail, right: JsaDraftDetail) {
  return left.jobTitle === right.jobTitle;
}

function persistedVersionFingerprint(draft: JsaDraftDetail) {
  const values: string[] = [];
  const add = (kind: string, item: { id: string; rowVersion: string }) => {
    if (persisted(item.id)) values.push(`${kind}:${item.id}:${item.rowVersion}`);
  };
  draft.prompts.forEach((item) => add('prompt', item));
  draft.tasks.forEach((task) => {
    add('task', task);
    task.hazards.forEach((hazard) => {
      add('hazard', hazard);
      hazard.controls.forEach((control) => add('control', control));
    });
  });
  draft.promptCoverage.forEach((item) => add('coverage', item));
  draft.basicSteps.forEach((step) => {
    add('step', step);
    step.performers.forEach((item) => add('performer', item));
    step.supervisors.forEach((item) => add('supervisor', item));
    step.tools.forEach((item) => add('tool', item));
  });
  draft.attachments.forEach((item) => add('attachment', item));
  return values.sort().join('|');
}
