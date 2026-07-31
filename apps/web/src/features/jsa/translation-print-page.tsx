import { ArrowLeftOutlined, PrinterOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import type {
  JsaDraftDetail,
  MasterDataRecord,
  TranslationDetail,
  TranslationSegment,
} from '@jsams/shared-types';
import { Alert, Button, Spin } from 'antd';
import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ApiClientError } from '../../services/api-client';
import { jsaApi } from './jsa-api';
import { JsaPrintDocument, mergePrintPrompts } from './jsa-print-page';
import { translationApi } from './translation-api';

function segmentKey(entityType: string, logicalKey: string, fieldCode: string) {
  return `${entityType}:${logicalKey}:${fieldCode}`;
}

export function translatedJsa(
  source: JsaDraftDetail,
  translation: TranslationDetail,
): JsaDraftDetail {
  const segments = new Map<string, TranslationSegment>(
    translation.segments.map((segment) => [
      segmentKey(segment.entityType, segment.sourceLogicalKey, segment.fieldCode),
      segment,
    ]),
  );
  const text = (entityType: string, logicalKey: string, fieldCode: string, fallback: string) => {
    const translated = segments
      .get(segmentKey(entityType, logicalKey, fieldCode))
      ?.translatedText?.trim();
    return translated || fallback;
  };

  return {
    ...source,
    languageCode: translation.targetLanguageCode,
    languageName: translation.targetLanguageName,
    jobTitle: text('HEADER', source.versionId, 'JOB_TITLE', source.jobTitle ?? ''),
    tasks: source.tasks.map((task) => ({
      ...task,
      title: text('TASK', task.logicalKey, 'TITLE', task.title),
      hazards: task.hazards.map((hazard) => ({
        ...hazard,
        text: text('HAZARD', hazard.logicalKey, 'TEXT', hazard.text),
        controls: hazard.controls.map((control) => ({
          ...control,
          text: text('CONTROL', control.logicalKey, 'TEXT', control.text),
        })),
      })),
    })),
    basicSteps: source.basicSteps.map((step) => ({
      ...step,
      text: text('BASIC_STEP', step.logicalKey, 'TEXT', step.text),
    })),
  };
}

export function TranslationPrintPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const printedAt = useMemo(() => new Date(), []);
  const detail = useQuery({
    queryKey: ['translation-print', id],
    queryFn: () => translationApi.print(id),
  });
  const source = useQuery({
    queryKey: ['translation-print-source', detail.data?.jsaId, detail.data?.sourceVersionId],
    queryFn: () => jsaApi.versionDetail(detail.data!.jsaId, detail.data!.sourceVersionId),
    enabled: Boolean(detail.data?.jsaId && detail.data?.sourceVersionId),
  });
  const prompts = useQuery({
    queryKey: [
      'translation-print-prompts',
      source.data?.ownerSiteId,
      source.data?.rigId,
      source.data?.departmentId,
    ],
    queryFn: () =>
      jsaApi.options<MasterDataRecord>(
        'hazard-prompts',
        `?siteId=${source.data!.ownerSiteId}&rigId=${source.data!.rigId}&departmentId=${source.data!.departmentId}`,
      ),
    enabled: Boolean(source.data),
  });
  const draft = useMemo(
    () => (source.data && detail.data ? translatedJsa(source.data, detail.data) : undefined),
    [detail.data, source.data],
  );

  useEffect(() => {
    if (!detail.data) return;
    const previousTitle = document.title;
    document.title = `${detail.data.jsaNumber} - ${detail.data.targetLanguageName}`;
    return () => {
      document.title = previousTitle;
    };
  }, [detail.data]);

  if (detail.isLoading || source.isLoading)
    return (
      <main className="jsa-print-state">
        <Spin size="large" />
        <span>Preparing Published Translation</span>
      </main>
    );

  const error = detail.error ?? source.error;
  if (error || !detail.data || !draft)
    return (
      <main className="jsa-print-state">
        <Alert
          type="error"
          showIcon
          message="Translated JSA cannot be printed"
          description={(error as ApiClientError | undefined)?.message}
        />
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
          Back
        </Button>
      </main>
    );

  const printPrompts = mergePrintPrompts(draft, prompts.data ?? []);

  return (
    <main className="jsa-print-page">
      <nav className="jsa-print-toolbar" aria-label="Translation print actions">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
          Back
        </Button>
        <div>
          <strong>{detail.data.jsaNumber}</strong>
          <span>
            Published Translation · {detail.data.targetLanguageName} · English Version{' '}
            {detail.data.sourceVersionNumber}
          </span>
        </div>
        <Button
          type="primary"
          icon={<PrinterOutlined />}
          disabled={prompts.isLoading || prompts.isError}
          onClick={() => window.print()}
        >
          Print / Save as PDF
        </Button>
      </nav>
      {prompts.isError ? (
        <Alert
          className="jsa-print-catalogue-error"
          type="error"
          showIcon
          message="Printing is temporarily unavailable"
          description="The complete governed Hazard Assessment Prompt list could not be loaded."
        />
      ) : null}
      <JsaPrintDocument
        draft={draft}
        printedAt={printedAt}
        prompts={printPrompts}
        promptLoading={prompts.isLoading}
        promptError={prompts.isError}
        languageLabel={`${detail.data.targetLanguageCode} — ${detail.data.targetLanguageName}`}
      />
    </main>
  );
}
