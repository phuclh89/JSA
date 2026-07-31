import { TranslationOutlined } from '@ant-design/icons';
import type {
  JsaDraftBasicStep,
  JsaDraftDetail,
  JsaDraftHazard,
  JsaDraftTask,
  RiskAxisLevel,
  TranslationSegment,
} from '@jsams/shared-types';
import { Button, Empty, Input, Modal, Tag, Typography } from 'antd';
import { Fragment, useMemo, useState } from 'react';
import './jsa-draft.css';

type Values = Record<string, string>;

interface TranslationWorksheetProps {
  source: JsaDraftDetail;
  segments: TranslationSegment[];
  values: Values;
  editable: boolean;
  targetLanguageName: string;
  onChange: (segmentId: string, value: string) => void;
}

const translatable = (segment: TranslationSegment) =>
  segment.sectionCode !== 'MATRIX' &&
  segment.fieldCode !== 'CODE' &&
  !['PROMPT', 'PERFORMER', 'SUPERVISOR', 'TOOL'].includes(segment.entityType);

export const visibleTranslationSegments = (segments: TranslationSegment[]) =>
  segments.filter(translatable);

function segmentKey(entityType: string, logicalKey: string, fieldCode: string) {
  return `${entityType}:${logicalKey}:${fieldCode}`;
}

function translatedText(
  segments: Map<string, TranslationSegment>,
  values: Values,
  entityType: string,
  logicalKey: string,
  fieldCode: string,
) {
  const segment = segments.get(segmentKey(entityType, logicalKey, fieldCode));
  return segment ? (values[segment.id] ?? '').trim() : '';
}

function TranslationInput({
  segment,
  values,
  editable,
  targetLanguageName,
  onChange,
  compact = false,
}: {
  segment?: TranslationSegment;
  values: Values;
  editable: boolean;
  targetLanguageName: string;
  onChange: (segmentId: string, value: string) => void;
  compact?: boolean;
}) {
  if (!segment) return <Typography.Text type="secondary">Not translatable</Typography.Text>;
  return (
    <label className="translation-context-field">
      <span>
        {targetLanguageName}
        {segment.required ? ' *' : ''}
      </span>
      <Input.TextArea
        aria-label={`${targetLanguageName} translation for ${segment.entityType} ${segment.fieldCode}`}
        autoSize={{ minRows: compact ? 2 : 3, maxRows: 8 }}
        readOnly={!editable}
        value={values[segment.id] ?? ''}
        onChange={(event) => onChange(segment.id, event.target.value)}
      />
    </label>
  );
}

function SourceAndTranslation({
  source,
  segment,
  values,
  editable,
  targetLanguageName,
  onChange,
}: {
  source: string;
  segment?: TranslationSegment;
  values: Values;
  editable: boolean;
  targetLanguageName: string;
  onChange: (segmentId: string, value: string) => void;
}) {
  return (
    <div className="translation-context-pair">
      <div>
        <span>English source</span>
        <strong>{source || '—'}</strong>
      </div>
      <TranslationInput
        segment={segment}
        values={values}
        editable={editable}
        targetLanguageName={targetLanguageName}
        onChange={onChange}
        compact
      />
    </div>
  );
}

function riskCode(
  source: JsaDraftDetail,
  hazard: JsaDraftHazard,
  stage: 'initialRisk' | 'residualRisk',
  axis: 'likelihood' | 'severity',
) {
  const selection = hazard[stage];
  const id = axis === 'likelihood' ? selection.likelihoodId : selection.severityId;
  const levels = axis === 'likelihood' ? source.matrix.likelihoods : source.matrix.severities;
  return levels.find((level) => level.id === id)?.code ?? '—';
}

function riskCell(
  source: JsaDraftDetail,
  hazard: JsaDraftHazard,
  stage: 'initialRisk' | 'residualRisk',
) {
  const selection = hazard[stage];
  return source.matrix.cells.find(
    (cell) =>
      cell.likelihoodId === selection.likelihoodId && cell.severityId === selection.severityId,
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
        {[...rows]
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

function TranslationRiskReference({ source }: { source: JsaDraftDetail }) {
  return (
    <>
      <div className="matrix-layout translation-matrix-layout">
        <div className="matrix-axis-reference-group">
          <MatrixAxisReference title="PROBABILITY" rows={source.matrix.likelihoods} />
          <MatrixAxisReference title="SEVERITY" rows={source.matrix.severities} />
        </div>
        <div className="matrix-chart">
          <div className="matrix-chart-severity">SEVERITY</div>
          <div className="matrix-chart-probability">PROBABILITY</div>
          <div
            className="matrix-grid"
            role="table"
            aria-label="Risk Matrix source reference"
            style={{
              gridTemplateColumns: `minmax(120px, .8fr) repeat(${source.matrix.dimension}, minmax(76px, 1fr))`,
            }}
          >
            <div className="matrix-corner" />
            {source.matrix.severities.map((severity) => (
              <div className="matrix-axis" key={severity.id}>
                {severity.code}
                <small>{severity.label}</small>
              </div>
            ))}
            {[...source.matrix.likelihoods].reverse().map((likelihood) => (
              <div className="matrix-row" key={likelihood.id}>
                <div className="matrix-axis">
                  {likelihood.code}
                  <small>{likelihood.label}</small>
                </div>
                {source.matrix.severities.map((severity) => {
                  const cell = source.matrix.cells.find(
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
          {source.matrix.results.map((result) => (
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
                  {result.semanticCategory ? <span>{result.semanticCategory}</span> : null}
                </div>
                {result.description ? <p>{result.description}</p> : null}
                {result.guidanceText ? (
                  <p className="risk-legend-guidance">{result.guidanceText}</p>
                ) : null}
                {result.prohibited ? (
                  <small className="translation-risk-prohibited">
                    Not allowed as Residual Risk
                  </small>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function TaskTranslationModal({
  row,
  segments,
  values,
  editable,
  targetLanguageName,
  onChange,
  onClose,
}: {
  row: { task: JsaDraftTask; hazard: JsaDraftHazard };
  segments: Map<string, TranslationSegment>;
  values: Values;
  editable: boolean;
  targetLanguageName: string;
  onChange: (segmentId: string, value: string) => void;
  onClose: () => void;
}) {
  const { task, hazard } = row;
  const control = hazard.controls[0];
  return (
    <Modal
      open
      width={1120}
      title={`Translate Task ${task.number ?? task.displayOrder}`}
      onCancel={onClose}
      footer={<Button onClick={onClose}>Done</Button>}
      destroyOnHidden
    >
      <div className="translation-row-dialog">
        <SourceAndTranslation
          source={task.title}
          segment={segments.get(segmentKey('TASK', task.logicalKey, 'TITLE'))}
          values={values}
          editable={editable}
          targetLanguageName={targetLanguageName}
          onChange={onChange}
        />
        <SourceAndTranslation
          source={hazard.text}
          segment={segments.get(segmentKey('HAZARD', hazard.logicalKey, 'TEXT'))}
          values={values}
          editable={editable}
          targetLanguageName={targetLanguageName}
          onChange={onChange}
        />
        <SourceAndTranslation
          source={control?.text ?? ''}
          segment={
            control ? segments.get(segmentKey('CONTROL', control.logicalKey, 'TEXT')) : undefined
          }
          values={values}
          editable={editable}
          targetLanguageName={targetLanguageName}
          onChange={onChange}
        />
      </div>
    </Modal>
  );
}

function BasicStepTranslationModal({
  step,
  segments,
  values,
  editable,
  targetLanguageName,
  onChange,
  onClose,
}: {
  step: JsaDraftBasicStep;
  segments: Map<string, TranslationSegment>;
  values: Values;
  editable: boolean;
  targetLanguageName: string;
  onChange: (segmentId: string, value: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open
      width={720}
      title={`Translate Basic Job Step ${step.number ?? step.displayOrder}`}
      onCancel={onClose}
      footer={<Button onClick={onClose}>Done</Button>}
      destroyOnHidden
    >
      <div className="translation-step-dialog">
        <SourceAndTranslation
          source={step.text}
          segment={segments.get(segmentKey('BASIC_STEP', step.logicalKey, 'TEXT'))}
          values={values}
          editable={editable}
          targetLanguageName={targetLanguageName}
          onChange={onChange}
        />
      </div>
    </Modal>
  );
}

export function TranslationWorksheet({
  source,
  segments,
  values,
  editable,
  targetLanguageName,
  onChange,
}: TranslationWorksheetProps) {
  const [taskRow, setTaskRow] = useState<{ task: JsaDraftTask; hazard: JsaDraftHazard }>();
  const [basicStep, setBasicStep] = useState<JsaDraftBasicStep>();
  const byIdentity = useMemo(
    () =>
      new Map(
        visibleTranslationSegments(segments).map((segment) => [
          segmentKey(segment.entityType, segment.sourceLogicalKey, segment.fieldCode),
          segment,
        ]),
      ),
    [segments],
  );
  const headerSegment = visibleTranslationSegments(segments).find(
    (segment) => segment.entityType === 'HEADER' && segment.fieldCode === 'JOB_TITLE',
  );
  const taskRows = source.tasks.flatMap((task) =>
    task.hazards.map((hazard, index) => ({ task, hazard, first: index === 0 })),
  );

  return (
    <section className="translation-worksheet" aria-label="Full JSA translation worksheet">
      <div className="worksheet-section-title">JSA GENERAL INFORMATION</div>
      <div className="worksheet-general-grid translation-general-grid">
        <div className="worksheet-readonly-field">
          <span>Status</span>
          <strong>{source.versionStatus}</strong>
        </div>
        <div className="worksheet-readonly-field">
          <span>JSA Number</span>
          <strong>{source.jsaNumber}</strong>
        </div>
        <div className="worksheet-readonly-field">
          <span>Owner Site</span>
          <strong>
            {source.ownerSiteCode} — {source.ownerSiteName}
          </strong>
        </div>
        <div className="worksheet-readonly-field">
          <span>Rig</span>
          <strong>
            {source.rigCode} — {source.rigName}
          </strong>
        </div>
        <div className="worksheet-readonly-field">
          <span>Department</span>
          <strong>
            {source.departmentCode} — {source.departmentName}
          </strong>
        </div>
        <div className="span-2">
          <SourceAndTranslation
            source={source.jobTitle ?? ''}
            segment={headerSegment}
            values={values}
            editable={editable}
            targetLanguageName={targetLanguageName}
            onChange={onChange}
          />
        </div>
      </div>

      <div className="worksheet-section-title">
        USE THE HAZARD ASSESSMENT PROMPT (
        {source.prompts.filter((prompt) => prompt.selected).length})
      </div>
      <div className="translation-prompt-grid">
        {source.prompts
          .filter((prompt) => prompt.selected)
          .map((prompt) => (
            <div className="translation-prompt-reference" key={prompt.id}>
              <span>{prompt.code}</span>
              <strong>{prompt.label}</strong>
            </div>
          ))}
      </div>

      <div className="worksheet-section-title">
        RISK MATRIX · {source.matrix.matrixName} · SOURCE REFERENCE ONLY
      </div>
      <div className="translation-risk-reference">
        <Tag color="blue">No translation required</Tag>
        <span>
          {source.matrix.dimension}×{source.matrix.dimension} · {source.matrix.versionCode}
        </span>
        <span>Probability: {source.matrix.likelihoods.map((item) => item.code).join(', ')}</span>
        <span>Severity: {source.matrix.severities.map((item) => item.code).join(', ')}</span>
      </div>
      <TranslationRiskReference source={source} />

      <div className="worksheet-section-title">
        TASK / HAZARD / CONTROL ASSESSMENT ({source.tasks.length})
      </div>
      <div className="worksheet-table-wrap">
        <table className="worksheet-table task-risk-table translation-task-table">
          <thead>
            <tr>
              <th aria-label="Translate" />
              <th>No.</th>
              <th>Task</th>
              <th>Hazard</th>
              <th colSpan={3}>Initial Risk (P / S / R)</th>
              <th>Controls</th>
              <th colSpan={3}>Residual Risk (P / S / R)</th>
            </tr>
          </thead>
          <tbody>
            {taskRows.length ? (
              taskRows.map(({ task, hazard, first }) => {
                const control = hazard.controls[0];
                const taskTranslation = translatedText(
                  byIdentity,
                  values,
                  'TASK',
                  task.logicalKey,
                  'TITLE',
                );
                const hazardTranslation = translatedText(
                  byIdentity,
                  values,
                  'HAZARD',
                  hazard.logicalKey,
                  'TEXT',
                );
                const controlTranslation = control
                  ? translatedText(byIdentity, values, 'CONTROL', control.logicalKey, 'TEXT')
                  : '';
                const hasTranslation = Boolean(
                  (first && taskTranslation) || hazardTranslation || controlTranslation,
                );
                const initialCell = riskCell(source, hazard, 'initialRisk');
                const residualCell = riskCell(source, hazard, 'residualRisk');

                return (
                  <Fragment key={`${task.id}:${hazard.id}`}>
                    <tr>
                      <td className="translation-action-cell">
                        <Button
                          type="text"
                          icon={<TranslationOutlined />}
                          aria-label={`Translate Task ${task.number ?? task.displayOrder}`}
                          onClick={() => setTaskRow({ task, hazard })}
                        />
                      </td>
                      <td>{first ? (task.number ?? task.displayOrder) : ''}</td>
                      <td>
                        {first ? (
                          task.title
                        ) : (
                          <span className="continued-label">Task continued</span>
                        )}
                      </td>
                      <td>{hazard.text}</td>
                      <td>{riskCode(source, hazard, 'initialRisk', 'likelihood')}</td>
                      <td>{riskCode(source, hazard, 'initialRisk', 'severity')}</td>
                      <td
                        className="translation-risk-rating"
                        style={{ backgroundColor: initialCell?.displayColor }}
                        title={initialCell?.riskResultName}
                      >
                        {hazard.initialRisk.ratingCode ?? '—'}
                      </td>
                      <td>{control?.text ?? '—'}</td>
                      <td>{riskCode(source, hazard, 'residualRisk', 'likelihood')}</td>
                      <td>{riskCode(source, hazard, 'residualRisk', 'severity')}</td>
                      <td
                        className="translation-risk-rating"
                        style={{ backgroundColor: residualCell?.displayColor }}
                        title={residualCell?.riskResultName}
                      >
                        {hazard.residualRisk.ratingCode ?? '—'}
                      </td>
                    </tr>
                    {hasTranslation ? (
                      <tr className="translation-inline-row">
                        <td className="translation-inline-language" title={targetLanguageName}>
                          <TranslationOutlined aria-hidden="true" />
                        </td>
                        <td>
                          <span className="translation-inline-badge">{targetLanguageName}</span>
                        </td>
                        <td>
                          {first ? (
                            taskTranslation || <span className="translation-missing">—</span>
                          ) : (
                            <span className="continued-label">Task continued</span>
                          )}
                        </td>
                        <td>
                          {hazardTranslation || <span className="translation-missing">—</span>}
                        </td>
                        <td>{riskCode(source, hazard, 'initialRisk', 'likelihood')}</td>
                        <td>{riskCode(source, hazard, 'initialRisk', 'severity')}</td>
                        <td
                          className="translation-risk-rating"
                          style={{ backgroundColor: initialCell?.displayColor }}
                        >
                          {hazard.initialRisk.ratingCode ?? '—'}
                        </td>
                        <td>
                          {controlTranslation || <span className="translation-missing">—</span>}
                        </td>
                        <td>{riskCode(source, hazard, 'residualRisk', 'likelihood')}</td>
                        <td>{riskCode(source, hazard, 'residualRisk', 'severity')}</td>
                        <td
                          className="translation-risk-rating"
                          style={{ backgroundColor: residualCell?.displayColor }}
                        >
                          {hazard.residualRisk.ratingCode ?? '—'}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            ) : (
              <tr>
                <td colSpan={11}>
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No Task configured" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="worksheet-section-title">BASIC JOB STEP ({source.basicSteps.length})</div>
      <div className="worksheet-table-wrap">
        <table className="worksheet-table basic-step-table basic-step-table--readonly">
          <thead>
            <tr>
              <th aria-label="Translate" />
              <th>No.</th>
              <th>Basic Job Step</th>
              <th>Who performs task?</th>
              <th>Who supervises task?</th>
              <th>Tools required?</th>
            </tr>
          </thead>
          <tbody>
            {source.basicSteps.map((step) => {
              const stepTranslation = translatedText(
                byIdentity,
                values,
                'BASIC_STEP',
                step.logicalKey,
                'TEXT',
              );
              const performers = step.performers.map((item) => item.name).join(', ') || '—';
              const supervisors = step.supervisors.map((item) => item.name).join(', ') || '—';
              const tools = step.noToolRequired
                ? 'No tool required'
                : step.tools.map((item) => item.name).join(', ') || '—';

              return (
                <Fragment key={step.id}>
                  <tr>
                    <td className="translation-action-cell">
                      <Button
                        type="text"
                        icon={<TranslationOutlined />}
                        aria-label={`Translate Basic Job Step ${step.number ?? step.displayOrder}`}
                        onClick={() => setBasicStep(step)}
                      />
                    </td>
                    <td>{step.number ?? step.displayOrder}</td>
                    <td>{step.text}</td>
                    <td>{performers}</td>
                    <td>{supervisors}</td>
                    <td>{tools}</td>
                  </tr>
                  {stepTranslation ? (
                    <tr className="translation-inline-row translation-basic-step-inline-row">
                      <td className="translation-inline-language" title={targetLanguageName}>
                        <TranslationOutlined aria-hidden="true" />
                      </td>
                      <td>
                        <span className="translation-inline-badge">{targetLanguageName}</span>
                      </td>
                      <td>{stepTranslation}</td>
                      <td className="translation-reference-cell">{performers}</td>
                      <td className="translation-reference-cell">{supervisors}</td>
                      <td className="translation-reference-cell">{tools}</td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="worksheet-section-title">
        PROCEDURE REFERENCES ({source.procedureReferences.length})
      </div>
      <div className="translation-static-list">
        {source.procedureReferences.length
          ? source.procedureReferences.map((item) => (
              <span key={item.id}>
                {item.code} — {item.title}
              </span>
            ))
          : 'No Procedure Reference'}
      </div>
      <div className="worksheet-section-title">ATTACHMENTS ({source.attachments.length})</div>
      <div className="translation-static-list">
        {source.attachments.length
          ? source.attachments.map((item) => <span key={item.id}>{item.fileName}</span>)
          : 'No Attachment'}
      </div>

      {taskRow ? (
        <TaskTranslationModal
          row={taskRow}
          segments={byIdentity}
          values={values}
          editable={editable}
          targetLanguageName={targetLanguageName}
          onChange={onChange}
          onClose={() => setTaskRow(undefined)}
        />
      ) : null}
      {basicStep ? (
        <BasicStepTranslationModal
          step={basicStep}
          segments={byIdentity}
          values={values}
          editable={editable}
          targetLanguageName={targetLanguageName}
          onChange={onChange}
          onClose={() => setBasicStep(undefined)}
        />
      ) : null}
    </section>
  );
}
