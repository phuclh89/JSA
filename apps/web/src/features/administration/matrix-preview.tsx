import type { RiskMatrixVersionDetail } from '@jsams/shared-types';
import { Alert, Typography } from 'antd';

export function MatrixPreview({ version }: { version: RiskMatrixVersionDetail }) {
  const likelihoods = [...version.likelihoods]
    .filter((item) => item.active)
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const severities = [...version.severities]
    .filter((item) => item.active)
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const cellFor = (likelihoodId: string, severityId: string) =>
    version.cells.find(
      (cell) => cell.active && cell.likelihoodId === likelihoodId && cell.severityId === severityId,
    );
  return (
    <section aria-label={`${version.dimension} by ${version.dimension} Risk Matrix preview`}>
      <Typography.Title level={3}>Configured preview</Typography.Title>
      {version.completeness.complete ? (
        <Alert
          type="success"
          showIcon
          message={`Complete ${version.dimension}×${version.dimension} configuration`}
        />
      ) : (
        <Alert
          type="warning"
          showIcon
          message="Matrix Version is incomplete"
          description={`${version.completeness.actualCellCount} of ${version.completeness.expectedCellCount} cells configured. Assignment is blocked.`}
        />
      )}
      <div className="admin-table-wrap">
        <table className="matrix-grid">
          <caption>
            {version.matrixName} — {version.versionCode}. Ratings are configuration lookups, never
            calculated values.
          </caption>
          <thead>
            <tr>
              <th scope="col">Likelihood / Severity</th>
              {severities.map((severity) => (
                <th key={severity.id} scope="col">
                  <strong>{severity.code}</strong>
                  <br />
                  {severity.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {likelihoods.map((likelihood) => (
              <tr key={likelihood.id}>
                <th scope="row">
                  <strong>{likelihood.code}</strong>
                  <br />
                  {likelihood.label}
                </th>
                {severities.map((severity) => {
                  const cell = cellFor(likelihood.id, severity.id);
                  return (
                    <td key={severity.id}>
                      {cell ? (
                        <>
                          <span
                            className="matrix-color-swatch"
                            style={{ backgroundColor: cell.displayColor ?? 'transparent' }}
                            aria-label={
                              cell.displayColor
                                ? `Configured color ${cell.displayColor}`
                                : 'No configured color'
                            }
                          />
                          <span className="matrix-cell-rating">
                            Rating {cell.ratingCode ?? cell.ratingValue}
                          </span>
                          <br />
                          <span>
                            {cell.riskResultName} ({cell.riskResultCode})
                          </span>
                          {cell.guidanceText ? (
                            <>
                              <br />
                              <small>{cell.guidanceText}</small>
                            </>
                          ) : null}
                        </>
                      ) : (
                        <strong>Missing configuration</strong>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Typography.Title level={3}>Risk Result legend</Typography.Title>
      <div className="matrix-legend">
        {version.results
          .filter((item) => item.active)
          .map((result) => (
            <article className="matrix-legend-item" key={result.id}>
              <span
                className="matrix-color-swatch"
                style={{ backgroundColor: result.displayColor ?? 'transparent' }}
                aria-hidden="true"
              />
              <strong>
                {result.code} — {result.name}
              </strong>
              {result.semanticCategory ? <p>Meaning: {result.semanticCategory}</p> : null}
              {result.guidanceText ? <p>{result.guidanceText}</p> : null}
              {result.prohibited ? <TagText>Prohibited for submission</TagText> : null}
            </article>
          ))}
      </div>
    </section>
  );
}
function TagText({ children }: { children: string }) {
  return (
    <p>
      <strong>{children}</strong>
    </p>
  );
}
