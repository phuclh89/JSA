import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '../../components/layout/app-shell';
import { AccessDeniedPage, NotFoundPage } from '../../components/feedback/pages';
import { AuthenticatedRoute, PermissionRoute } from '../../features/auth/route-guards';
import { HealthPage } from '../../features/health/health-page';
import { SecurityFoundationPage } from '../../components/feedback/phase-one-pages';
import { MasterDataPage } from '../../features/administration/master-data-page';
import { RiskMatricesPage } from '../../features/administration/risk-matrices-page';
import { RiskMatrixEditor } from '../../features/administration/risk-matrix-editor';
import { RigMatrixAssignmentsPage } from '../../features/administration/rig-matrix-assignments-page';
import { OrganizationPage } from '../../features/administration/organization-page';
import { JsaDraftEditor } from '../../features/jsa/jsa-draft-editor';
import { JsaPrintPage } from '../../features/jsa/jsa-print-page';
import { MyDraftsPage } from '../../features/jsa/my-drafts-page';
import { JsaCapabilityRoute } from '../../features/jsa/jsa-capability-route';
import { WorkflowCapabilityRoute } from '../../features/jsa/workflow-capability-route';
import { WorkflowQueuePage } from '../../features/jsa/workflow-queue-page';
import { WorkflowReviewPage } from '../../features/jsa/workflow-review-page';
import { WorkflowConfigPage } from '../../features/administration/workflow-config-page';
import { AccessUsersPage } from '../../features/administration/access-users-page';
import { AccessUserDetailPage } from '../../features/administration/access-user-detail-page';
import { AccessRolesPage } from '../../features/administration/access-roles-page';
import { AccessDiagnosticsPage } from '../../features/administration/access-diagnostics-page';
import { AccessAuditPage } from '../../features/administration/access-audit-page';
import { AttachmentLibraryPage } from '../../features/administration/attachment-library-page';
import { LoginPage } from '../../features/auth/login-page';
export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/access-denied" element={<AccessDeniedPage />} />
      <Route
        path="/jsa/:id/print"
        element={
          <AuthenticatedRoute>
            <JsaCapabilityRoute capability="view">
              <JsaPrintPage />
            </JsaCapabilityRoute>
          </AuthenticatedRoute>
        }
      />
      <Route
        element={
          <AuthenticatedRoute>
            <AppShell />
          </AuthenticatedRoute>
        }
      >
        <Route index element={<Navigate to="/jsa/drafts" replace />} />
        <Route
          path="/operations/attachment-library"
          element={
            <PermissionRoute permission="ATTACHMENT_LIBRARY_ADMIN">
              <AttachmentLibraryPage />
            </PermissionRoute>
          }
        />
        <Route path="/browse" element={<Navigate to="/jsa/drafts" replace />} />
        <Route
          path="/system/health"
          element={<Navigate to="/operations/system-health" replace />}
        />
        <Route
          path="/operations/system-health"
          element={
            <PermissionRoute permission="SYSTEM_HEALTH_VIEW">
              <HealthPage />
            </PermissionRoute>
          }
        />
        <Route path="/jsa/new" element={<Navigate to="/jsa/published" replace />} />
        <Route
          path="/jsa/drafts"
          element={
            <JsaCapabilityRoute capability="view">
              <MyDraftsPage />
            </JsaCapabilityRoute>
          }
        />
        <Route
          path="/jsa/:id/draft"
          element={
            <JsaCapabilityRoute capability="view">
              <JsaDraftEditor />
            </JsaCapabilityRoute>
          }
        />
        {(['approvals', 'pending', 'rejected', 'published'] as const).map((kind) => (
          <Route
            key={kind}
            path={`/jsa/${kind}`}
            element={
              <WorkflowCapabilityRoute capability="view">
                <WorkflowQueuePage kind={kind} />
              </WorkflowCapabilityRoute>
            }
          />
        ))}
        <Route
          path="/jsa/:id/workflow"
          element={
            <WorkflowCapabilityRoute capability="view">
              <WorkflowReviewPage />
            </WorkflowCapabilityRoute>
          }
        />
        <Route
          path="/operations/security"
          element={
            <PermissionRoute permission="SYSTEM_ADMIN">
              <SecurityFoundationPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/operations/rigs"
          element={
            <PermissionRoute permission="SYSTEM_ADMIN">
              <OrganizationPage kind="rigs" />
            </PermissionRoute>
          }
        />
        <Route
          path="/operations/departments"
          element={
            <PermissionRoute permission="SYSTEM_ADMIN">
              <OrganizationPage kind="departments" />
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
        <Route
          path="/operations/workflow"
          element={
            <WorkflowCapabilityRoute capability="admin">
              <WorkflowConfigPage />
            </WorkflowCapabilityRoute>
          }
        />
        <Route
          path="/operations/access/users"
          element={
            <PermissionRoute permission="SYSTEM_ADMIN">
              <AccessUsersPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/operations/access/users/:userId"
          element={
            <PermissionRoute permission="SYSTEM_ADMIN">
              <AccessUserDetailPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/operations/access/roles"
          element={
            <PermissionRoute permission="SYSTEM_ADMIN">
              <AccessRolesPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/operations/access/approver-resolution"
          element={
            <PermissionRoute permission="SYSTEM_ADMIN">
              <AccessDiagnosticsPage mode="approvers" />
            </PermissionRoute>
          }
        />
        <Route
          path="/operations/access/uat-readiness"
          element={
            <PermissionRoute permission="SYSTEM_ADMIN">
              <AccessDiagnosticsPage mode="readiness" />
            </PermissionRoute>
          }
        />
        <Route
          path="/operations/access/audit"
          element={
            <PermissionRoute permission="SYSTEM_ADMIN">
              <AccessAuditPage />
            </PermissionRoute>
          }
        />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
