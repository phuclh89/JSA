import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '../../components/layout/app-shell';
import { AccessDeniedPage, NotFoundPage } from '../../components/feedback/pages';
import { AuthenticatedRoute, PermissionRoute } from '../../features/auth/route-guards';
import { HealthPage } from '../../features/health/health-page';
import { BrowseHomePage, SecurityFoundationPage } from '../../components/feedback/phase-one-pages';
import { MasterDataPage } from '../../features/administration/master-data-page';
import { RiskMatricesPage } from '../../features/administration/risk-matrices-page';
import { RiskMatrixEditor } from '../../features/administration/risk-matrix-editor';
import { RigMatrixAssignmentsPage } from '../../features/administration/rig-matrix-assignments-page';
import { JsaCreatePage } from '../../features/jsa/jsa-create-page';
import { JsaDraftEditor } from '../../features/jsa/jsa-draft-editor';
import { JsaCapabilityRoute } from '../../features/jsa/jsa-capability-route';
import { WorkflowCapabilityRoute } from '../../features/jsa/workflow-capability-route';
import { WorkflowQueuePage } from '../../features/jsa/workflow-queue-page';
import { WorkflowReviewPage } from '../../features/jsa/workflow-review-page';
import { WorkflowConfigPage } from '../../features/administration/workflow-config-page';
export function AppRouter() {
  return (
    <Routes>
      <Route path="/access-denied" element={<AccessDeniedPage />} />
      <Route
        element={
          <AuthenticatedRoute>
            <AppShell />
          </AuthenticatedRoute>
        }
      >
        <Route index element={<Navigate to="/browse" replace />} />
        <Route
          path="/browse"
          element={
            <PermissionRoute permission="SYSTEM_HEALTH_VIEW">
              <BrowseHomePage />
            </PermissionRoute>
          }
        />
        <Route
          path="/system/health"
          element={
            <PermissionRoute permission="SYSTEM_HEALTH_VIEW">
              <HealthPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/jsa/new"
          element={<JsaCapabilityRoute capability="create"><JsaCreatePage /></JsaCapabilityRoute>}
        />
        <Route
          path="/jsa/:id/draft"
          element={<JsaCapabilityRoute capability="view"><JsaDraftEditor /></JsaCapabilityRoute>}
        />
        {(['approvals','pending','rejected','published'] as const).map(kind=><Route key={kind} path={`/jsa/${kind}`} element={<WorkflowCapabilityRoute capability="view"><WorkflowQueuePage kind={kind}/></WorkflowCapabilityRoute>}/>)}
        <Route path="/jsa/:id/workflow" element={<WorkflowCapabilityRoute capability="view"><WorkflowReviewPage/></WorkflowCapabilityRoute>}/>
        <Route
          path="/operations/security"
          element={
            <PermissionRoute permission="SYSTEM_ADMIN">
              <SecurityFoundationPage />
            </PermissionRoute>
          }
        />
        {(
          [
            ['job-types', 'job-types'],
            ['hazard-prompts', 'hazard-prompts'],
            ['positions', 'positions'],
            ['tool-categories', 'tool-categories'],
            ['tools', 'tools'],
            ['languages', 'languages'],
            ['procedure-references', 'procedure-references'],
            ['system-parameters', 'system-parameters'],
          ] as const
        ).map(([path, kind]) => (
          <Route
            key={path}
            path={`/operations/${path}`}
            element={
              <PermissionRoute permission="SYSTEM_ADMIN">
                <MasterDataPage kind={kind} />
              </PermissionRoute>
            }
          />
        ))}
        <Route
          path="/operations/risk-matrices"
          element={
            <PermissionRoute permission="SYSTEM_ADMIN">
              <RiskMatricesPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/operations/risk-matrices/:id/editor"
          element={
            <PermissionRoute permission="SYSTEM_ADMIN">
              <RiskMatrixEditor />
            </PermissionRoute>
          }
        />
        <Route
          path="/operations/rig-matrix-assignments"
          element={
            <PermissionRoute permission="SYSTEM_ADMIN">
              <RigMatrixAssignmentsPage />
            </PermissionRoute>
          }
        />
        <Route path="/operations/workflow" element={<WorkflowCapabilityRoute capability="admin"><WorkflowConfigPage/></WorkflowCapabilityRoute>}/>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
