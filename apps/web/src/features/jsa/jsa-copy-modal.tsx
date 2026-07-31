import {
  Alert,
  Button,
  Checkbox,
  Descriptions,
  Form,
  Input,
  List,
  Modal,
  Select,
  Space,
  Spin,
  Steps,
  Tag,
  Typography,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JsaBrowseItem, JsaCopyPreflight } from '@jsams/shared-types';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ApiClientError } from '../../services/api-client';
import { copyApi, type CopyDestinationRequest } from './copy-api';
import { JsaDraftEditor } from './jsa-draft-editor';
import { useRigContext } from './rig-context';
import './jsa-copy-modal.css';

interface CopyFormValues extends CopyDestinationRequest {
  copyReason: string;
}

export function JsaCopyModal({
  open,
  source,
  onClose,
}: {
  open: boolean;
  source?: JsaBrowseItem;
  onClose: () => void;
}) {
  const [form] = Form.useForm<CopyFormValues>();
  const queryClient = useQueryClient();
  const { setSelectedRigId } = useRigContext();
  const [preflight, setPreflight] = useState<JsaCopyPreflight>();
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [destinationJsaId, setDestinationJsaId] = useState<string>();
  const requestKey = useRef(crypto.randomUUID());
  const destinations = useQuery({
    queryKey: ['jsa-copy-destinations', source?.jsaId],
    queryFn: () => copyApi.destinations(source!.jsaId),
    enabled: open && Boolean(source) && !destinationJsaId,
  });
  const selectedRigId = Form.useWatch('destinationRigId', form);
  useEffect(() => {
    if (destinations.data?.localSite.id)
      form.setFieldValue('destinationSiteId', destinations.data.localSite.id);
  }, [destinations.data?.localSite.id, form]);
  const rigOptions = useMemo(
    () =>
      destinations.data?.rigs.map((rig) => ({
        value: rig.id,
        label: `${rig.code} — ${rig.name}`,
      })) ?? [],
    [destinations.data?.rigs],
  );
  const departmentOptions = useMemo(
    () =>
      destinations.data?.departments
        .filter((department) => department.rigId === selectedRigId)
        .map((department) => ({
          value: department.id,
          label: `${department.code} — ${department.name}`,
        })) ?? [],
    [destinations.data?.departments, selectedRigId],
  );
  const preview = useMutation({
    mutationFn: (values: CopyFormValues) =>
      copyApi.preflight(source!.jsaId, {
        destinationSiteId: values.destinationSiteId,
        destinationRigId: values.destinationRigId,
        destinationDepartmentId: values.destinationDepartmentId,
      }),
    onSuccess: (result) => {
      setPreflight(result);
      setAcknowledged(false);
      setConfirmed(false);
    },
  });
  const execute = useMutation({
    mutationFn: async () => {
      const values = await form.validateFields();
      return copyApi.copy(
        source!.jsaId,
        { ...values, acknowledgeWarnings: acknowledged },
        requestKey.current,
      );
    },
    onSuccess: (result) => {
      setSelectedRigId(result.destination.rigId);
      setDestinationJsaId(result.destinationJsaId);
      void queryClient.invalidateQueries({ queryKey: ['jsa-browse'] });
      void queryClient.invalidateQueries({ queryKey: ['jsa-browse-counts'] });
      void queryClient.invalidateQueries({ queryKey: ['jsa-navigation-counts'] });
      void queryClient.invalidateQueries({ queryKey: ['jsa-drafts'] });
      void queryClient.invalidateQueries({ queryKey: ['jsa-copy-provenance'] });
    },
  });
  const close = () => {
    form.resetFields();
    preview.reset();
    execute.reset();
    setPreflight(undefined);
    setAcknowledged(false);
    setConfirmed(false);
    setDestinationJsaId(undefined);
    requestKey.current = crypto.randomUUID();
    onClose();
  };
  const apiError = (preview.error || execute.error || destinations.error) as ApiClientError | null;
  const currentStep = destinationJsaId ? 3 : preflight ? 1 : 0;
  return (
    <Modal
      className={`jsa-copy-modal${destinationJsaId ? ' jsa-copy-modal--worksheet' : ''}`}
      title={
        destinationJsaId
          ? 'Cross-Rig Copy · Destination Working Version'
          : 'Copy JSA to another Rig'
      }
      open={open}
      onCancel={close}
      footer={null}
      width={destinationJsaId ? 'calc(100vw - 32px)' : 1040}
      maskClosable={false}
      destroyOnHidden
    >
      {!destinationJsaId && (
        <Steps
          size="small"
          current={currentStep}
          items={[
            { title: 'Destination' },
            { title: 'Preflight' },
            { title: 'Confirm' },
            { title: 'Worksheet' },
          ]}
        />
      )}
      {apiError && (
        <Alert
          type="error"
          showIcon
          message={apiError.message}
          description={
            apiError.correlationId ? `Correlation ID: ${apiError.correlationId}` : undefined
          }
        />
      )}
      {destinationJsaId ? (
        <JsaDraftEditor draftId={destinationJsaId} onExit={close} />
      ) : destinations.isLoading ? (
        <Spin aria-label="Loading authorized copy destinations" />
      ) : (
        <Form<CopyFormValues>
          form={form}
          layout="vertical"
          initialValues={{ destinationSiteId: destinations.data?.localSite.id }}
          onFinish={(values) => preview.mutate(values)}
          onValuesChange={() => {
            setPreflight(undefined);
            setAcknowledged(false);
            setConfirmed(false);
          }}
        >
          <section aria-labelledby="copy-source-heading">
            <Typography.Title level={2} id="copy-source-heading">
              Source Current Published JSA
            </Typography.Title>
            <Descriptions bordered size="small" column={{ xs: 1, md: 2 }}>
              <Descriptions.Item label="Official JSA Number">{source?.jsaNumber}</Descriptions.Item>
              <Descriptions.Item label="Job Title">{source?.jobTitle || '—'}</Descriptions.Item>
              <Descriptions.Item label="Source Site / Rig">
                {source?.ownerSiteName} / {source?.rigName}
              </Descriptions.Item>
              <Descriptions.Item label="Source Department">
                {source?.departmentName}
              </Descriptions.Item>
            </Descriptions>
          </section>
          <div className="jsa-copy-form-grid">
            <Form.Item
              label="Destination Site"
              name="destinationSiteId"
              rules={[{ required: true }]}
            >
              <Select
                disabled
                options={
                  destinations.data
                    ? [
                        {
                          value: destinations.data.localSite.id,
                          label: `${destinations.data.localSite.code} — ${destinations.data.localSite.name}`,
                        },
                      ]
                    : []
                }
              />
            </Form.Item>
            <Form.Item
              label="Destination Rig"
              name="destinationRigId"
              rules={[{ required: true, message: 'Select a destination Rig' }]}
            >
              <Select
                placeholder="Select an authorized different Rig"
                options={rigOptions}
                notFoundContent="No different local Rig is available in your action scope"
                onChange={() => form.setFieldValue('destinationDepartmentId', undefined)}
              />
            </Form.Item>
            <Form.Item
              label="Destination Department"
              name="destinationDepartmentId"
              rules={[{ required: true, message: 'Select a destination Department' }]}
            >
              <Select
                disabled={!selectedRigId}
                placeholder="Select an authorized Department"
                options={departmentOptions}
              />
            </Form.Item>
          </div>
          <Form.Item
            label="Copy reason"
            name="copyReason"
            extra="Required immutable provenance. Do not enter credentials, tokens, or secrets."
            rules={[
              { required: true, whitespace: true, message: 'Enter the reason for this copy' },
              { max: 1000 },
            ]}
          >
            <Input.TextArea rows={3} maxLength={1000} showCount />
          </Form.Item>
          {!preflight ? (
            <Space>
              <Button type="primary" htmlType="submit" loading={preview.isPending}>
                Run authoritative preflight
              </Button>
              <Button onClick={close}>Cancel</Button>
            </Space>
          ) : (
            <CopyPreflightSummary preflight={preflight} />
          )}
          {preflight && (
            <section className="jsa-copy-confirmation" aria-labelledby="copy-confirm-heading">
              <Typography.Title level={2} id="copy-confirm-heading">
                Confirm new destination JSA
              </Typography.Title>
              <Typography.Paragraph>
                A new independent JSA Master and Draft Working Version will be created. The source
                remains unchanged; its Official Number, approval history, attachments, and workflow
                evidence are not copied. The destination receives a Temporary Number and must
                complete normal initial approval before publication.
              </Typography.Paragraph>
              {preflight.warnings.length > 0 && (
                <Checkbox
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                >
                  I acknowledge every warning and intentional exclusion shown above.
                </Checkbox>
              )}
              <Checkbox
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              >
                I confirm that this creates a new destination-owned JSA and does not modify the
                source.
              </Checkbox>
              <Space wrap>
                <Button
                  type="primary"
                  disabled={
                    !preflight.canCopy ||
                    !confirmed ||
                    (preflight.warnings.length > 0 && !acknowledged)
                  }
                  loading={execute.isPending}
                  onClick={() => execute.mutate()}
                >
                  Create destination Draft
                </Button>
                <Button onClick={() => setPreflight(undefined)}>Change destination</Button>
                <Button onClick={close}>Cancel</Button>
              </Space>
            </section>
          )}
        </Form>
      )}
    </Modal>
  );
}

function CopyPreflightSummary({ preflight }: { preflight: JsaCopyPreflight }) {
  const mappings = [
    ['Prompts', preflight.promptMappings],
    ['Performer Positions', preflight.performerMappings],
    ['Supervisor Positions', preflight.supervisorMappings],
    ['Tools', preflight.toolMappings],
  ] as const;
  return (
    <section className="jsa-copy-preflight" aria-labelledby="copy-preflight-heading">
      <Typography.Title level={2} id="copy-preflight-heading">
        Authoritative preflight
      </Typography.Title>
      <Alert
        type={preflight.canCopy ? 'success' : 'error'}
        showIcon
        message={preflight.canCopy ? 'Ready to copy' : 'Copy is blocked'}
      />
      <Descriptions bordered size="small" column={{ xs: 1, md: 2 }}>
        <Descriptions.Item label="Source Matrix">
          {matrixLabel(preflight.sourceMatrix)}
        </Descriptions.Item>
        <Descriptions.Item label="Destination Matrix">
          {matrixLabel(preflight.destinationMatrix)}
        </Descriptions.Item>
        <Descriptions.Item label="Risk behavior">
          <Tag color={preflight.riskCopyMode === 'PRESERVED' ? 'green' : 'orange'}>
            {preflight.riskCopyMode}
          </Tag>
          {preflight.matrixReassessmentRequired ? ' Reassessment required' : ' Risk retained'}
        </Descriptions.Item>
        <Descriptions.Item label="Copied aggregate">
          {preflight.counts.tasks} Tasks · {preflight.counts.hazards} Hazards ·{' '}
          {preflight.counts.controls} Controls · {preflight.counts.basicSteps} Basic Steps
        </Descriptions.Item>
      </Descriptions>
      {preflight.blockers.map((issue) => (
        <Alert
          key={issue.code}
          type="error"
          showIcon
          message={issue.code}
          description={issue.message}
        />
      ))}
      {preflight.warnings.map((issue) => (
        <Alert
          key={issue.code + issue.message}
          type="warning"
          showIcon
          message={issue.code}
          description={issue.message}
        />
      ))}
      {mappings.map(([title, rows]) => (
        <div key={title} className="jsa-copy-mapping-group">
          <Typography.Text strong>{title}</Typography.Text>
          {rows.length ? (
            <Space wrap>
              {rows.map((mapping) => (
                <Tag
                  key={`${title}-${mapping.sourceCode}`}
                  color={
                    mapping.status === 'MAPPED'
                      ? 'green'
                      : mapping.status === 'MISSING'
                        ? 'orange'
                        : 'red'
                  }
                >
                  {mapping.sourceCode}: {mapping.status}
                </Tag>
              ))}
            </Space>
          ) : (
            <Typography.Text type="secondary">None selected</Typography.Text>
          )}
        </div>
      ))}
      <Alert
        type="info"
        showIcon
        message={`${preflight.excludedAttachments.count} attachment association(s) — NOT COPIED`}
        description={
          preflight.excludedAttachments.names.length
            ? preflight.excludedAttachments.names.join(', ')
            : 'No source attachments'
        }
      />
      <Typography.Text strong>Intentionally not copied</Typography.Text>
      <List
        size="small"
        dataSource={preflight.intentionallyNotCopied}
        renderItem={(item) => <List.Item>{item}</List.Item>}
      />
    </section>
  );
}

function matrixLabel(matrix: JsaCopyPreflight['sourceMatrix']) {
  return matrix
    ? `${matrix.code} / ${matrix.versionCode} · ${matrix.dimension}×${matrix.dimension}`
    : 'Unavailable';
}
