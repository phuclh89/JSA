import { Alert, Button, Form, Modal, Select, Space, Typography } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { OrganizationOption } from '@jsams/shared-types';
import type { ApiClientError } from '../../services/api-client';
import { jsaApi } from './jsa-api';
import type { CreateJsaDraftRequest } from './jsa-api';
import { JsaDraftEditor } from './jsa-draft-editor';
import { useRigContext } from './rig-context';
import './jsa-draft.css';

export function JsaCreateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { selectedRig, setSelectedRigId: setGlobalRigId } = useRigContext();
  const [form] = Form.useForm<CreateJsaDraftRequest>();
  const [siteId, setSiteId] = useState<string>();
  const [rigId, setRigId] = useState<string>();
  const [createdDraftId, setCreatedDraftId] = useState<string>();
  const sites = useQuery({
    queryKey: ['jsa-options', 'sites'],
    queryFn: () => jsaApi.options<OrganizationOption>('sites'),
    enabled: open && !createdDraftId,
  });
  const rigs = useQuery({
    queryKey: ['jsa-options', 'rigs', siteId],
    queryFn: () => jsaApi.options<OrganizationOption>('rigs', `?siteId=${siteId}`),
    enabled: open && !createdDraftId && Boolean(siteId),
  });
  const departments = useQuery({
    queryKey: ['jsa-options', 'departments', siteId, rigId],
    queryFn: () =>
      jsaApi.options<OrganizationOption>('departments', `?siteId=${siteId}&rigId=${rigId}`),
    enabled: open && !createdDraftId && Boolean(siteId && rigId),
  });
  const matrix = useQuery({
    queryKey: ['jsa-matrix', rigId],
    queryFn: () => jsaApi.matrix(rigId!),
    enabled: open && !createdDraftId && Boolean(rigId),
  });
  const create = useMutation({
    mutationFn: (values: CreateJsaDraftRequest) => jsaApi.create(values),
    onSuccess: (draft) => {
      void queryClient.invalidateQueries({ queryKey: ['jsa-navigation-counts'] });
      void queryClient.invalidateQueries({ queryKey: ['jsa-drafts'] });
      setCreatedDraftId(draft.jsaId);
    },
  });

  useEffect(() => {
    if (!open || createdDraftId || !selectedRig?.siteId) return;
    setSiteId(selectedRig.siteId);
    setRigId(selectedRig.id);
    form.setFieldsValue({
      ownerSiteId: selectedRig.siteId,
      rigId: selectedRig.id,
      departmentId: undefined,
    });
  }, [createdDraftId, form, open, selectedRig]);

  const options = (items?: Array<{ id: string; code: string; name: string }>) =>
    items?.map((item) => ({ value: item.id, label: `${item.code} — ${item.name}` }));
  const createError = create.error as ApiClientError | null;
  const errorDetails = createError?.details.map(String).filter(Boolean) ?? [];
  const closeModal = () => {
    create.reset();
    form.resetFields();
    setSiteId(undefined);
    setRigId(undefined);
    setCreatedDraftId(undefined);
    onClose();
  };

  return (
    <Modal
      className={`jsa-create-modal${createdDraftId ? ' jsa-create-modal--worksheet' : ''}`}
      title={createdDraftId ? 'Create JSA · Working Version' : 'Create JSA'}
      open={open}
      onCancel={closeModal}
      footer={null}
      width={createdDraftId ? 'calc(100vw - 32px)' : 960}
      maskClosable={false}
      destroyOnHidden
    >
      {createdDraftId ? (
        <JsaDraftEditor draftId={createdDraftId} onExit={closeModal} />
      ) : (
        <>
          <Typography.Paragraph type="secondary">
            Choose the owning context once. Every source JSA is created in English, then the
            complete worksheet opens as one continuous screen.
          </Typography.Paragraph>
          {createError && (
            <Alert
              type="error"
              showIcon
              message={createError.message}
              description={
                <Space direction="vertical" size={0}>
                  {errorDetails.map((detail) => (
                    <Typography.Text key={detail}>{detail}</Typography.Text>
                  ))}
                  {createError.correlationId && (
                    <Typography.Text type="secondary">
                      Correlation ID: {createError.correlationId}
                    </Typography.Text>
                  )}
                </Space>
              }
            />
          )}
          <Form<CreateJsaDraftRequest>
            form={form}
            layout="vertical"
            onFinish={({ ownerSiteId, rigId: selectedRigId, departmentId }) =>
              create.mutate({ ownerSiteId, rigId: selectedRigId, departmentId })
            }
          >
            <div className="jsa-form-grid">
              <Form.Item label="Owner Site" name="ownerSiteId" rules={[{ required: true }]}>
                <Select
                  disabled={Boolean(selectedRig)}
                  loading={sites.isLoading}
                  options={options(sites.data)}
                  onChange={(value) => {
                    setSiteId(value);
                    setRigId(undefined);
                    form.resetFields(['rigId', 'departmentId']);
                  }}
                />
              </Form.Item>
              <Form.Item label="Rig" name="rigId" rules={[{ required: true }]}>
                <Select
                  disabled={!siteId || Boolean(selectedRig)}
                  loading={rigs.isLoading}
                  options={options(rigs.data)}
                  onChange={(value) => {
                    setRigId(value);
                    setGlobalRigId(value);
                    form.resetFields(['departmentId']);
                  }}
                />
              </Form.Item>
              <Form.Item label="Department" name="departmentId" rules={[{ required: true }]}>
                <Select
                  disabled={!rigId}
                  loading={departments.isLoading}
                  options={options(departments.data)}
                />
              </Form.Item>
            </div>
            <Space>
              <Button
                type="primary"
                htmlType="submit"
                loading={create.isPending}
                disabled={!matrix.data?.completeness.complete}
              >
                Open JSA worksheet
              </Button>
              <Button onClick={closeModal}>Cancel</Button>
            </Space>
          </Form>
        </>
      )}
    </Modal>
  );
}
