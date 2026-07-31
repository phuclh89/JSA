import { Alert, Descriptions, Spin, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { copyApi } from './copy-api';
import './jsa-copy-modal.css';

export function CopyProvenancePanel({ jsaId }: { jsaId: string }) {
  const query = useQuery({
    queryKey: ['jsa-copy-provenance', 'v2', jsaId],
    queryFn: () => copyApi.provenance(jsaId),
    enabled: Boolean(jsaId),
    retry: false,
  });
  if (query.isLoading) return <Spin size="small" aria-label="Loading copy provenance" />;
  if (query.error)
    return (
      <Alert
        type="error"
        showIcon
        message="Copy provenance could not be loaded"
        description="Reload the JSA or contact support with the request correlation ID."
      />
    );
  const provenance = query.data;
  if (!provenance) return null;
  return (
    <section className="copy-provenance-panel" aria-labelledby="copy-provenance-title">
      <Typography.Title level={2} id="copy-provenance-title">
        Copied from
      </Typography.Title>
      <Descriptions bordered size="small" column={{ xs: 1, sm: 2, lg: 3 }}>
        <Descriptions.Item label="Source JSA">
          <Typography.Link href={`/jsa/${provenance.sourceJsaId}/draft?source=current`}>
            {provenance.sourceJsaNumber}
          </Typography.Link>
        </Descriptions.Item>
        <Descriptions.Item label="Source Site / Rig">
          {provenance.sourceSiteName} / {provenance.sourceRigName}
        </Descriptions.Item>
        <Descriptions.Item label="Source Version">
          {provenance.sourceVersionLabel || provenance.sourceVersionNumber}
        </Descriptions.Item>
        <Descriptions.Item label="Copied by">
          {provenance.copiedByDisplayName || provenance.copiedByUsername}
        </Descriptions.Item>
        <Descriptions.Item label="Copied at">
          {new Date(provenance.copiedAt).toLocaleString()}
        </Descriptions.Item>
        <Descriptions.Item label="Risk copy mode">{provenance.riskCopyMode}</Descriptions.Item>
        <Descriptions.Item label="Copy reason" span={3}>
          {provenance.copyReason}
        </Descriptions.Item>
      </Descriptions>
      {provenance.matrixReassessmentRequired && (
        <Alert
          type="warning"
          showIcon
          message="Matrix reassessment required"
          description="The source and destination Matrix Versions differ. All copied Hazard risk values were cleared and must be reassessed before submission."
        />
      )}
      {provenance.excludedAttachmentCount > 0 && (
        <Alert
          type="info"
          showIcon
          message="Source attachments were not copied"
          description={`${provenance.excludedAttachmentCount} source association(s) were excluded. Select approved destination-scope attachments from the Attachment Library if needed.`}
        />
      )}
    </section>
  );
}
