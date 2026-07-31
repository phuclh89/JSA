import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Input,
  Space,
  Spin,
  Tag,
  Timeline,
  Typography,
  message,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ApiClientError } from '../../services/api-client';
import { jsaApi } from './jsa-api';
import { translationApi } from './translation-api';
import { TranslationWorksheet, visibleTranslationSegments } from './translation-worksheet';
import './translation.css';

export function TranslationEditorPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ['translation-detail', id],
    queryFn: () => translationApi.detail(id),
  });
  const source = useQuery({
    queryKey: ['translation-source-worksheet', detail.data?.jsaId, detail.data?.sourceVersionId],
    queryFn: () => jsaApi.versionDetail(detail.data!.jsaId, detail.data!.sourceVersionId),
    enabled: Boolean(detail.data?.jsaId && detail.data?.sourceVersionId),
  });
  const [values, setValues] = useState<Record<string, string>>({});
  const [comment, setComment] = useState('');
  useEffect(() => {
    if (detail.data)
      setValues(
        Object.fromEntries(
          detail.data.segments.map((segment) => [segment.id, segment.translatedText ?? '']),
        ),
      );
  }, [detail.data]);
  const changed = useMemo(
    () =>
      visibleTranslationSegments(detail.data?.segments ?? []).filter(
        (segment) => (values[segment.id] ?? '') !== (segment.translatedText ?? ''),
      ),
    [detail.data, values],
  );
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['translation-detail', id] });
    void queryClient.invalidateQueries({ queryKey: ['translation-list'] });
  };
  const save = useMutation({
    mutationFn: () =>
      translationApi.save(
        id,
        changed.map((segment) => ({
          id: segment.id,
          text: values[segment.id] ?? '',
          rowVersion: segment.rowVersion,
        })),
      ),
    onSuccess: () => {
      message.success('Translation saved');
      refresh();
    },
    onError: (error) => message.error((error as ApiClientError).message),
  });
  const submit = useMutation({
    mutationFn: () => translationApi.submit(id),
    onSuccess: () => {
      message.success('Submitted to STC');
      refresh();
    },
    onError: (error) => message.error((error as ApiClientError).message),
  });
  const review = useMutation({
    mutationFn: (action: 'RETURN' | 'COMMENT' | 'PUBLISH') =>
      translationApi.review(id, action, comment),
    onSuccess: (_, action) => {
      message.success(action === 'PUBLISH' ? 'Translation published' : 'Review action recorded');
      setComment('');
      refresh();
    },
    onError: (error) => message.error((error as ApiClientError).message),
  });
  if (detail.isLoading) return <Spin aria-label="Loading Translation" />;
  if (detail.error)
    return <Alert type="error" showIcon message={(detail.error as ApiClientError).message} />;
  const item = detail.data;
  if (!item) return null;
  return (
    <main className="translation-editor">
      <Space wrap className="translation-ribbon">
        <Button onClick={() => navigate('/jsa/translations')}>Back</Button>
        {item.editable ? (
          <Button
            type="primary"
            disabled={!changed.length}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            Save
          </Button>
        ) : null}
        {item.editable ? (
          <Button
            disabled={changed.length > 0}
            loading={submit.isPending}
            onClick={() => submit.mutate()}
          >
            Submit to STC
          </Button>
        ) : null}
        {item.reviewable ? (
          <Button onClick={() => review.mutate('COMMENT')} disabled={!comment.trim()}>
            Add comment
          </Button>
        ) : null}
        {item.reviewable ? (
          <Button danger onClick={() => review.mutate('RETURN')} disabled={!comment.trim()}>
            Return
          </Button>
        ) : null}
        {item.reviewable ? (
          <Button type="primary" onClick={() => review.mutate('PUBLISH')}>
            Approve & Publish
          </Button>
        ) : null}
        {item.printable ? (
          <Button
            onClick={() =>
              window.open(`/jsa/translations/${id}/print`, '_blank', 'noopener,noreferrer')
            }
          >
            Print
          </Button>
        ) : null}
      </Space>
      {item.reviewable ? (
        <Card title="STC review note" className="translation-review-note">
          <Input.TextArea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={3}
            placeholder="Enter the STC review note before adding a comment or returning the Translation"
          />
        </Card>
      ) : null}
      <Typography.Title level={1}>
        {item.jsaNumber} · {item.targetLanguageName}
      </Typography.Title>
      <Descriptions bordered size="small" column={{ xs: 1, md: 2 }}>
        <Descriptions.Item label="Status">
          <Tag>{item.status.replaceAll('_', ' ')}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Source">
          English Version {item.sourceVersionNumber}
        </Descriptions.Item>
        <Descriptions.Item label="Translator">{item.translatorDisplayName}</Descriptions.Item>
        <Descriptions.Item label="Cycle">{item.cycleNumber}</Descriptions.Item>
      </Descriptions>
      {item.status === 'OUTDATED' ? (
        <Alert
          showIcon
          type="warning"
          message="Outdated — current printing is blocked"
          description="A replacement English Version has been published. Refresh creates a new Translation with empty targets."
        />
      ) : null}
      <section className="translation-segments">
        {/* Previous flat segment-card layout intentionally replaced by the full JSA worksheet.
          <Card
            key={segment.id}
            size="small"
            title={`${segment.sectionCode.replaceAll('_', ' ')} · ${segment.fieldCode.replaceAll('_', ' ')}`}
          >
            <div className="translation-pair">
              <div>
                <Typography.Text type="secondary">English source</Typography.Text>
                <p>{segment.sourceText}</p>
              </div>
              <label>
                <Typography.Text type="secondary">
                  Translation{segment.required ? ' *' : ''}
                </Typography.Text>
                <Input.TextArea
                  autoSize={{ minRows: 2, maxRows: 10 }}
                  disabled={!item.editable}
                  value={values[segment.id] ?? ''}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [segment.id]: event.target.value }))
                  }
                />
              </label>
            </div>
          </Card>
        */}
        {source.isLoading ? <Spin aria-label="Loading full JSA worksheet" /> : null}
        {source.error ? (
          <Alert
            type="error"
            showIcon
            message="The exact source JSA worksheet could not be loaded"
            description={(source.error as ApiClientError).message}
          />
        ) : null}
        {source.data ? (
          <TranslationWorksheet
            source={source.data}
            segments={item.segments}
            values={values}
            editable={item.editable}
            targetLanguageName={item.targetLanguageName}
            onChange={(segmentId, value) =>
              setValues((current) => ({ ...current, [segmentId]: value }))
            }
          />
        ) : null}
      </section>
      <Card title="Translation history">
        <Timeline
          items={item.actions.map((action) => ({
            children: (
              <>
                <strong>{action.action}</strong> · {action.actorDisplayName} ·{' '}
                {new Date(action.actionAt).toLocaleString()}
                {action.comment ? <p>{action.comment}</p> : null}
              </>
            ),
          }))}
        />
      </Card>
    </main>
  );
}
