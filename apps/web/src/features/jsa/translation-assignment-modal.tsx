import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Descriptions, Modal, Select, Space, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import type { ApiClientError } from '../../services/api-client';
import { translationApi } from './translation-api';

export function TranslationAssignmentModal({
  jsaId,
  open,
  onClose,
}: {
  jsaId?: string;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [languageId, setLanguageId] = useState<string>();
  const [translatorId, setTranslatorId] = useState<string>();
  useEffect(() => {
    if (!open) {
      setLanguageId(undefined);
      setTranslatorId(undefined);
    }
  }, [open]);
  const preflight = useQuery({
    queryKey: ['translation-assignment-preflight', jsaId],
    queryFn: () => translationApi.preflight(jsaId!),
    enabled: open && Boolean(jsaId),
  });
  const candidates = useQuery({
    queryKey: ['translation-candidates', jsaId],
    queryFn: () => translationApi.candidates(jsaId!),
    enabled: open && Boolean(jsaId),
  });
  const assign = useMutation({
    mutationFn: () =>
      translationApi.assign({
        jsaId: jsaId!,
        targetLanguageId: languageId!,
        translatorUserId: translatorId!,
      }),
    onSuccess: () => {
      message.success('Translation assigned');
      void queryClient.invalidateQueries({ queryKey: ['translation-list'] });
      onClose();
    },
    onError: (error) => message.error((error as ApiClientError).message),
  });
  return (
    <Modal
      title="Assign Translation"
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button
          key="assign"
          type="primary"
          loading={assign.isPending}
          disabled={!languageId || !translatorId || !preflight.data?.configured}
          onClick={() => assign.mutate()}
        >
          Assign exact source snapshot
        </Button>,
      ]}
    >
      {preflight.error ? (
        <Alert type="error" showIcon message={(preflight.error as ApiClientError).message} />
      ) : null}
      {preflight.data ? (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Descriptions size="small" column={1} bordered>
            <Descriptions.Item label="JSA">{preflight.data.source.jsaNumber}</Descriptions.Item>
            <Descriptions.Item label="Job title">
              {preflight.data.source.jobTitle ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Source Version">
              {preflight.data.source.versionNumber} · Published English
            </Descriptions.Item>
          </Descriptions>
          {preflight.data.blockers.map((blocker) => (
            <Alert key={blocker} type="warning" showIcon message={blocker} />
          ))}
          <label>
            <Typography.Text strong>Target language</Typography.Text>
            <Select
              aria-label="Target language"
              value={languageId}
              onChange={setLanguageId}
              style={{ width: '100%' }}
              placeholder="Select one governed non-English language"
              options={preflight.data.languages.map((item) => ({
                value: item.id,
                label: `${item.code} — ${item.name}`,
              }))}
            />
          </label>
          <label>
            <Typography.Text strong>Translator</Typography.Text>
            <Select
              aria-label="Translator"
              loading={candidates.isLoading}
              value={translatorId}
              onChange={setTranslatorId}
              style={{ width: '100%' }}
              placeholder="Select one eligible Translator"
              options={(candidates.data ?? []).map((item) => ({
                value: item.userId,
                label: `${item.displayName} (${item.username})`,
              }))}
            />
          </label>
        </Space>
      ) : null}
    </Modal>
  );
}
