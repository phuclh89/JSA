import { Alert, Button, Spin } from 'antd';
import { ArrowLeftOutlined, PrinterOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type {
  JsaDraftDetail,
  JsaDraftHazard,
  JsaRiskSelection,
  MasterDataRecord,
} from '@jsams/shared-types';
import pvDrillingLogo from '../../assets/pv-drilling-logo.png';
import type { ApiClientError } from '../../services/api-client';
import { jsaApi } from './jsa-api';
import './jsa-print.css';

export function JsaPrintPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const printedAt = useMemo(() => new Date(), []);
  const query = useQuery({
    queryKey: ['jsa-print', id],
    queryFn: () => jsaApi.printDetail(id),
  });
  const draft = query.data;
  const promptQuery = useQuery({
    queryKey: ['jsa-print-prompts', draft?.ownerSiteId, draft?.rigId, draft?.departmentId],
    queryFn: () =>
      jsaApi.options<MasterDataRecord>(
        'hazard-prompts',
        `?siteId=${draft!.ownerSiteId}&rigId=${draft!.rigId}&departmentId=${draft!.departmentId}`,
      ),
    enabled: Boolean(draft),
  });

  useEffect(() => {
    if (!draft) return;
    const previousTitle = document.title;
    document.title = `${draft.jsaNumber} - JSA`;
    return () => {
      document.title = previousTitle;
    };
  }, [draft]);

  if (query.isLoading)
    return (
      <main className="jsa-print-state">
        <Spin size="large" />
        <span>Preparing Published JSA</span>
      </main>
    );
  if (query.error || !draft)
    return (
      <main className="jsa-print-state">
        <Alert
          type="error"
          showIcon
          message="JSA cannot be printed"
          description={
            (query.error as ApiClientError | undefined)?.message ??
            'Only the current Published JSA Version is available for operational printing.'
          }
        />
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
          Back
        </Button>
      </main>
    );

  const prompts = mergePrintPrompts(draft, promptQuery.data ?? []);

  return (
    <main className="jsa-print-page">
      <nav className="jsa-print-toolbar" aria-label="Print actions">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
          Back
        </Button>
        <div>
          <strong>{draft.jsaNumber}</strong>
          <span>Published Version {draft.versionNumber ?? draft.versionId}</span>
        </div>
        <Button
          type="primary"
          icon={<PrinterOutlined />}
          disabled={promptQuery.isLoading || promptQuery.isError}
          onClick={() => window.print()}
        >
          Print / Save as PDF
        </Button>
      </nav>
      {promptQuery.isError ? (
        <Alert
          className="jsa-print-catalogue-error"
          type="error"
          showIcon
          message="Printing is temporarily unavailable"
          description="The complete governed Hazard Assessment Prompt list could not be loaded. Refresh the page before printing."
        />
      ) : null}

      <article className="jsa-print-document" aria-label={`Printable JSA ${draft.jsaNumber}`}>
        <PrintHeader draft={draft} printedAt={printedAt} />
        <PrintPrompts
          prompts={prompts}
          loading={promptQuery.isLoading}
          error={promptQuery.isError}
        />
        <PrintMatrix draft={draft} />
        <PrintTaskAssessment draft={draft} />
        <PrintBasicSteps draft={draft} />
        <BlankPersonalInvolved />
        <BlankDebrief />
        <footer className="print-document-trace">
          <span>JSA Master ID: {draft.jsaId}</span>
          <span>Exact Version ID: {draft.versionId}</span>
          <span>Status: {draft.versionStatus}</span>
          <span>
            Language: {draft.languageCode ?? 'EN'} — {draft.languageName ?? 'English'}
          </span>
          <span>Printed: {formatDateTime(printedAt)}</span>
        </footer>
      </article>
    </main>
  );
}

function PrintHeader({ draft, printedAt }: { draft: JsaDraftDetail; printedAt: Date }) {
  return (
    <header className="print-header">
      <div className="print-brand-row">
        <div className="print-subject">
          SUBJECT: <strong>JOB SAFETY ANALYSIS POLICY</strong> - PVD Doc Ref: P1.04.09
        </div>
        <strong className="print-company-name">PV Drilling</strong>
        <img src={pvDrillingLogo} alt="PV Drilling" />
      </div>
      <table className="print-meta-table">
        <thead>
          <tr>
            <th>Rig</th>
            <th>JSA Number</th>
            <th>Last Review</th>
            <th>V</th>
            <th>Permit To Work Required</th>
            <th>PTW (Cold)</th>
            <th>PTW (Hot)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{draft.rigName}</td>
            <td>{draft.jsaNumber}</td>
            <td />
            <td>{draft.versionNumber ?? '—'}</td>
            <td>{draft.ptwRequired ? 'Yes' : 'No'}</td>
            <td />
            <td />
          </tr>
        </tbody>
      </table>
      <table className="print-job-table">
        <tbody>
          <tr>
            <td>
              <strong>Job name:</strong> {draft.jobTitle}
            </td>
            <td>
              <strong>Number of Personnel Required For Job:</strong>
            </td>
            <td>
              <strong>Date:</strong>{' '}
              {draft.publishedAt ? formatDate(draft.publishedAt) : formatDate(printedAt)}
            </td>
            <td>
              <strong>Signed Rig Sup./PIC:</strong>
            </td>
          </tr>
        </tbody>
      </table>
      <div className="print-version-identity">
        <span>
          Owner: {draft.ownerSiteCode} / {draft.rigCode} / {draft.departmentCode}
        </span>
        <span>
          Published Version {draft.versionNumber ?? draft.versionId} · {draft.versionStatus}
        </span>
      </div>
    </header>
  );
}

function PrintPrompts({
  prompts,
  loading,
  error,
}: {
  prompts: Array<{ id: string; label: string; selected: boolean }>;
  loading: boolean;
  error: boolean;
}) {
  return (
    <section className="print-section print-prompts">
      <h2>
        USE THE HAZARD ASSESSMENT PROMPT
        <small>
          (if prompt ticked — must be included in Hazards and Controls involved on below assessment)
        </small>
      </h2>
      {loading ? (
        <div className="print-inline-status">Loading governed prompt list…</div>
      ) : error ? (
        <div className="print-inline-status">
          Complete prompt list unavailable — printing blocked.
        </div>
      ) : (
        <div className="print-prompt-grid">
          {prompts.map((prompt) => (
            <div className="print-prompt-item" key={prompt.id}>
              <strong aria-label={prompt.selected ? 'Selected' : 'Not selected'}>
                {prompt.selected ? 'X' : ''}
              </strong>
              <span>{prompt.label}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PrintMatrix({ draft }: { draft: JsaDraftDetail }) {
  const likelihoods = [...draft.matrix.likelihoods].sort(
    (left, right) => left.displayOrder - right.displayOrder,
  );
  const severities = [...draft.matrix.severities].sort(
    (left, right) => left.displayOrder - right.displayOrder,
  );
  return (
    <section className="print-section print-matrix-band">
      <div className="print-matrix-references">
        <PrintAxisTable title="Probability" rows={likelihoods} />
        <PrintAxisTable title="Severity" rows={severities} />
      </div>
      <div className="print-matrix-chart">
        <div className="print-matrix-severity-title">SEVERITY</div>
        <div className="print-matrix-probability-title">PROBABILITY</div>
        <div
          className="print-matrix-grid"
          style={{
            gridTemplateColumns: `minmax(72px, .8fr) repeat(${draft.matrix.dimension}, minmax(44px, 1fr))`,
          }}
        >
          <div className="print-matrix-axis" />
          {severities.map((severity) => (
            <div className="print-matrix-axis" key={severity.id}>
              <small>{severity.label}</small>
              <strong>{severity.code}</strong>
            </div>
          ))}
          {[...likelihoods].reverse().map((likelihood) => (
            <div className="print-matrix-row" key={likelihood.id}>
              <div className="print-matrix-axis">
                <small>{likelihood.label}</small>
                <strong>{likelihood.code}</strong>
              </div>
              {severities.map((severity) => {
                const cell = draft.matrix.cells.find(
                  (item) => item.likelihoodId === likelihood.id && item.severityId === severity.id,
                );
                return (
                  <div
                    className="print-matrix-cell"
                    key={`${likelihood.id}-${severity.id}`}
                    style={{ backgroundColor: cell?.displayColor }}
                  >
                    <strong>{cell?.ratingCode ?? '—'}</strong>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="print-risk-overview">
        <h3>Risk Colour Overview</h3>
        {draft.matrix.results.map((result) => (
          <div className="print-risk-overview-item" key={result.id}>
            <strong style={{ color: result.displayColor }}>{result.name}:</strong>
            <span>{result.guidanceText || result.description || 'Guidance not configured'}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function PrintAxisTable({
  title,
  rows,
}: {
  title: string;
  rows: JsaDraftDetail['matrix']['likelihoods'];
}) {
  return (
    <table className="print-axis-table">
      <caption>{title}</caption>
      <thead>
        <tr>
          <th>Category</th>
          <th>Definition</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
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

function PrintTaskAssessment({ draft }: { draft: JsaDraftDetail }) {
  const rowCount = draft.tasks.reduce((sum, task) => sum + Math.max(task.hazards.length, 1), 0);
  return (
    <section className="print-section print-task-section">
      <table className="print-task-table">
        <colgroup>
          <col className="print-task-col-number" />
          <col className="print-task-col-task" />
          <col className="print-task-col-hazard" />
          <col className="print-task-col-risk" />
          <col className="print-task-col-risk" />
          <col className="print-task-col-risk" />
          <col className="print-task-col-control" />
          <col className="print-task-col-risk" />
          <col className="print-task-col-risk" />
          <col className="print-task-col-risk" />
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={2}>No.</th>
            <th rowSpan={2}>Task (Sequence Of Basic Job Steps?)</th>
            <th rowSpan={2}>
              Hazards (What Are The Potential Hazards? How Can People Be Hurt, Equipment Damaged &
              Environment Pollution)
            </th>
            <th colSpan={3}>Initial Risk Rating</th>
            <th rowSpan={2}>Controls (Controls Put In Place To Reduce Potential Hazards?)</th>
            <th colSpan={3}>Residual Risk Rating</th>
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
          {rowCount === 0 ? (
            <tr>
              <td colSpan={10}>No Task/Hazard assessment recorded.</td>
            </tr>
          ) : (
            draft.tasks.flatMap((task, taskIndex) => {
              const hazards = task.hazards.length ? task.hazards : [undefined];
              return hazards.map((hazard, hazardIndex) => (
                <tr key={`${task.id}-${hazard?.id ?? 'empty'}`}>
                  <td>{hazardIndex === 0 ? taskIndex + 1 : ''}</td>
                  <td>{hazardIndex === 0 ? task.title : ''}</td>
                  <td>{hazard?.text ?? ''}</td>
                  <PrintRiskCells draft={draft} risk={hazard?.initialRisk} />
                  <td>{hazard?.controls.map((control) => control.text).join('\n') ?? ''}</td>
                  <PrintRiskCells draft={draft} risk={hazard?.residualRisk} />
                </tr>
              ));
            })
          )}
        </tbody>
      </table>
    </section>
  );
}

function PrintRiskCells({ draft, risk }: { draft: JsaDraftDetail; risk?: JsaRiskSelection }) {
  const likelihood = draft.matrix.likelihoods.find((item) => item.id === risk?.likelihoodId);
  const severity = draft.matrix.severities.find((item) => item.id === risk?.severityId);
  const cell = findRiskCell(draft, risk);
  return (
    <>
      <td className="print-risk-code">{likelihood?.code ?? ''}</td>
      <td className="print-risk-code">{severity?.code ?? ''}</td>
      <td className="print-risk-rating" style={{ backgroundColor: cell?.displayColor }}>
        {risk?.ratingCode ?? cell?.ratingCode ?? ''}
      </td>
    </>
  );
}

function PrintBasicSteps({ draft }: { draft: JsaDraftDetail }) {
  return (
    <section className="print-section">
      <table className="print-basic-step-table">
        <thead>
          <tr>
            <th>Basic Job Step</th>
            <th>Who Perform Task?</th>
            <th>Who Supervises Task?</th>
            <th>Tools Required?</th>
          </tr>
        </thead>
        <tbody>
          {draft.basicSteps.length ? (
            draft.basicSteps.map((step) => (
              <tr key={step.id}>
                <td>{step.text}</td>
                <td>{step.performers.map((item) => item.name).join(', ')}</td>
                <td>{step.supervisors.map((item) => item.name).join(', ')}</td>
                <td>
                  {step.noToolRequired
                    ? 'No tool required'
                    : step.tools.map((item) => item.name).join(', ')}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={4}>No Basic Job Step recorded.</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

function BlankPersonalInvolved() {
  return (
    <section className="print-section print-personal-section">
      <h2>PERSONAL INVOLVED</h2>
      <div className="print-personal-tables">
        {[0, 1].map((tableIndex) => (
          <table key={tableIndex}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Position</th>
                <th>Company</th>
                <th>Signature</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }, (_, rowIndex) => (
                <tr key={rowIndex}>
                  <td>&nbsp;</td>
                  <td />
                  <td />
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
      <p>To be filled every PTW suspension/ stop work authority, daily</p>
    </section>
  );
}

function BlankDebrief() {
  return (
    <section className="print-section print-debrief">
      <h2>DEBRIEF (TO BE FILLED BY WORK LEADER)</h2>
      <table>
        <thead>
          <tr>
            <th />
            <th>Personnel</th>
            <th>Equipment</th>
            <th>Environment</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>What happened? (What did you see?)</th>
            <td>
              <BlankChecklist items={['Done as per expected plan', 'No: Why?']} lines={3} />
            </td>
            <td>
              <BlankChecklist
                items={['In good condition / certified / fit to use?', 'No: Why?']}
                lines={3}
              />
            </td>
            <td>
              <BlankChecklist items={['Safe condition?', 'No: Why?']} lines={3} />
            </td>
          </tr>
          <tr>
            <th>How can it be done better or any improvement suggestions?</th>
            <td>
              <BlankChecklist
                items={[
                  'Additional training required',
                  'Additional supervision',
                  'More manpower required',
                  'Other:',
                ]}
                lines={4}
              />
            </td>
            <td>
              <BlankChecklist
                items={[
                  'Different types of equipment can be used (specify)',
                  'Adjust / Modify procedure to use safer items',
                  'Replace / Repair the equipment',
                  'Other:',
                ]}
                lines={4}
              />
            </td>
            <td>
              <BlankChecklist
                items={[
                  'Plan schedule (Day – Night)',
                  'Hot / cold temperature',
                  'Stop job due to SIMOP – Conflicted activity',
                  'Suitable work / weather conditions',
                  'Other:',
                ]}
                lines={4}
              />
            </td>
          </tr>
          <tr>
            <th>Any feedback from your team members?</th>
            <td>
              <BlankChecklist items={['None', 'Yes:']} lines={3} />
            </td>
            <td>
              <BlankChecklist items={['None', 'Yes:']} lines={3} />
            </td>
            <td>
              <BlankChecklist items={['None', 'Yes:']} lines={3} />
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function BlankChecklist({ items, lines }: { items: string[]; lines: number }) {
  return (
    <div className="print-blank-checklist">
      {items.map((item) => (
        <span key={item}>
          <i aria-hidden="true" /> {item}
        </span>
      ))}
      {Array.from({ length: lines }, (_, index) => (
        <b key={index} />
      ))}
    </div>
  );
}

function mergePrintPrompts(draft: JsaDraftDetail, options: MasterDataRecord[]) {
  const currentIds = new Set(options.map((option) => option.id));
  return [
    ...options.map((option) => ({
      id: `option-${option.id}`,
      label: option.name,
      selected: draft.prompts.some((prompt) => prompt.promptId === option.id && prompt.selected),
    })),
    ...draft.prompts
      .filter((prompt) => prompt.selected && !currentIds.has(prompt.promptId))
      .map((prompt) => ({
        id: `snapshot-${prompt.id}`,
        label: prompt.label,
        selected: true,
      })),
  ];
}

function findRiskCell(draft: JsaDraftDetail, risk?: JsaRiskSelection) {
  return draft.matrix.cells.find(
    (cell) =>
      cell.id === risk?.cellId ||
      (cell.likelihoodId === risk?.likelihoodId && cell.severityId === risk?.severityId),
  );
}

function formatDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-GB');
}

function formatDateTime(value: Date) {
  return value.toLocaleString('en-GB');
}
