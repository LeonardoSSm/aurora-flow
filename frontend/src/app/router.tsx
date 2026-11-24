import { lazy, Suspense } from 'react';
import { Navigate, createBrowserRouter, type RouteObject } from 'react-router-dom';
import { RequireAuth } from './require-auth';
import { AppShell } from '../components/app-shell';
import { PageSkeleton } from '../components/page-skeleton';
import { LoginPage } from '../pages/login-page';
import { GoogleAuthCallbackPage } from '../pages/google-auth-callback-page';

const SetPasswordPage = lazy(() => import('../pages/set-password-page').then((m) => ({ default: m.SetPasswordPage })));
const HomePage = lazy(() => import('../pages/home-page').then((m) => ({ default: m.HomePage })));
const FlowsPage = lazy(() => import('../pages/flows-page').then((m) => ({ default: m.FlowsPage })));
const FlowEditorPage = lazy(() => import('../pages/flow-editor-page').then((m) => ({ default: m.FlowEditorPage })));
const AdminPage = lazy(() => import('../pages/admin-page').then((m) => ({ default: m.AdminPage })));
const AdminOverviewPage = lazy(() => import('../pages/admin-overview-page').then((m) => ({ default: m.AdminOverviewPage })));
const AdminUsersPage = lazy(() => import('../pages/admin-users-page').then((m) => ({ default: m.AdminUsersPage })));
const AdminAreasPage = lazy(() => import('../pages/admin-areas-page').then((m) => ({ default: m.AdminAreasPage })));
const AdminPermissionsPage = lazy(() => import('../pages/admin-permissions-page').then((m) => ({ default: m.AdminPermissionsPage })));
const AdminAuditPage = lazy(() => import('../pages/admin-audit-page').then((m) => ({ default: m.AdminAuditPage })));
const AdminSettingsPage = lazy(() => import('../pages/admin-settings-page').then((m) => ({ default: m.AdminSettingsPage })));
const AdminObservabilityPage = lazy(() => import('../pages/admin-observability-page').then((m) => ({ default: m.AdminObservabilityPage })));
const AdminServiceMapPage = lazy(() => import('../pages/admin-service-map-page').then((m) => ({ default: m.AdminServiceMapPage })));
const AdminToolsPage = lazy(() => import('../pages/admin-tools-page').then((m) => ({ default: m.AdminToolsPage })));
const AdminErpPage = lazy(() => import('../pages/admin-erp-page').then((m) => ({ default: m.AdminErpPage })));
const AdminDocsPage = lazy(() => import('../pages/admin-docs-page').then((m) => ({ default: m.AdminDocsPage })));
const AdminDocsArticlePage = lazy(() => import('../pages/admin-docs-article-page').then((m) => ({ default: m.AdminDocsArticlePage })));
const AdminIntegrationsPage = lazy(() => import('../pages/admin-integrations-page').then((m) => ({ default: m.AdminIntegrationsPage })));
const IntegrationsPage = lazy(() => import('../pages/integrations-page').then((m) => ({ default: m.IntegrationsPage })));
const HelpPage = lazy(() => import('../pages/help-page').then((m) => ({ default: m.HelpPage })));
const HelpArticlePage = lazy(() => import('../pages/help-article-page').then((m) => ({ default: m.HelpArticlePage })));
const DesignSystemPage = lazy(() =>
  import('../pages/design-system-page').then((m) => ({ default: m.DesignSystemPage })),
);
const AcceptInvitePage = lazy(() =>
  import('../pages/accept-invite-page').then((m) => ({ default: m.AcceptInvitePage })),
);

/**
 * Paginas do app logado. O AppShell as renderiza com `useRoutes` — e nao via
 * <Outlet> — para poder mostrar a pagina de tras enquanto a Administracao esta
 * aberta em modal por cima (ver modules/admin/admin-route.ts).
 */
const shellRoutes: RouteObject[] = [
  { index: true, element: <Navigate to="/inicio" replace /> },
  { path: 'inicio', element: <HomePage /> },
  { path: 'dashboard', element: <Navigate to="/flows" replace /> },
  { path: 'paineis', element: <Navigate to="/inicio" replace /> },
  { path: 'paineis/:painelId', element: <Navigate to="/inicio" replace /> },
  { path: 'formularios', element: <Navigate to="/inicio" replace /> },
  { path: 'builder', element: <Navigate to="/flows/new" replace /> },
  { path: 'listas-de-itens', element: <Navigate to="/inicio" replace /> },
  { path: 'listas-de-itens/nova', element: <Navigate to="/inicio" replace /> },
  { path: 'listas-de-itens/:listId', element: <Navigate to="/inicio" replace /> },
  { path: 'registros/:formId', element: <Navigate to="/inicio" replace /> },
  { path: 'respostas', element: <Navigate to="/inicio" replace /> },
  { path: 'respostas/:formId', element: <Navigate to="/inicio" replace /> },
  { path: 'solicitacoes', element: <Navigate to="/inicio" replace /> },
  { path: 'kanban', element: <Navigate to="/inicio" replace /> },
  { path: 'kanban/:formId', element: <Navigate to="/inicio" replace /> },
  { path: 'aprovacoes', element: <Navigate to="/inicio" replace /> },
  { path: 'integracoes', element: <Navigate to="/administracao/webhooks" replace /> },
  { path: 'ajuda', element: <HelpPage /> },
  { path: 'ajuda/:slug', element: <HelpArticlePage /> },
  {
    path: 'flows',
    element: (
      <RequireAuth permissions={['flows.view']}>
        <FlowsPage />
      </RequireAuth>
    ),
  },
  {
    path: 'flows/new',
    element: (
      <RequireAuth permissions={['flows.manage']}>
        <FlowEditorPage />
      </RequireAuth>
    ),
  },
  {
    path: 'flows/:id',
    element: (
      <RequireAuth permissions={['flows.view']}>
        <FlowEditorPage />
      </RequireAuth>
    ),
  },
  { path: '*', element: <Navigate to="/inicio" replace /> },
];

/** Administracao: sempre em modal sobre uma pagina de `shellRoutes`. */
const adminRoutes: RouteObject[] = [
  {
    path: 'administracao',
    element: <AdminPage />,
    children: [
      { index: true, element: <Navigate to="visao-geral" replace /> },
      { path: 'visao-geral', element: <AdminOverviewPage /> },
      { path: 'usuarios', element: <AdminUsersPage /> },
      { path: 'areas', element: <AdminAreasPage /> },
      { path: 'permissoes', element: <AdminPermissionsPage /> },
      { path: 'auditoria', element: <AdminAuditPage /> },
      { path: 'configuracoes', element: <AdminSettingsPage /> },
      { path: 'documentacao', element: <AdminDocsPage /> },
      { path: 'documentacao/:slug', element: <AdminDocsArticlePage /> },
      {
        path: 'observabilidade',
        element: (
          <RequireAuth permissions={['observability.view_metrics']}>
            <AdminObservabilityPage />
          </RequireAuth>
        ),
      },
      {
        path: 'mapa-servicos',
        element: (
          <RequireAuth permissions={['observability.view_metrics']}>
            <AdminServiceMapPage />
          </RequireAuth>
        ),
      },
      {
        path: 'ferramentas',
        element: (
          <RequireAuth permissions={['system.maintenance']}>
            <AdminToolsPage />
          </RequireAuth>
        ),
      },
      {
        path: 'integracoes',
        element: (
          <RequireAuth permissions={['integrations.manage']}>
            <AdminIntegrationsPage />
          </RequireAuth>
        ),
      },
      {
        path: 'webhooks',
        element: (
          <RequireAuth permissions={['integrations.manage_channels']}>
            <IntegrationsPage />
          </RequireAuth>
        ),
      },
      {
        path: 'erp',
        element: (
          <RequireAuth permissions={['integrations.manage']}>
            <AdminErpPage />
          </RequireAuth>
        ),
      },
    ],
  },
];

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/login/google/callback',
    element: <GoogleAuthCallbackPage />,
  },
  {
    path: '/definir-senha',
    element: (
      <RequireAuth>
        <Suspense fallback={<PageSkeleton />}>
          <SetPasswordPage />
        </Suspense>
      </RequireAuth>
    ),
  },
  {
    path: '/f/:formId',
    element: <Navigate to="/login" replace />,
  },
  {
    path: '/public/formulario/:formId',
    element: <Navigate to="/login" replace />,
  },
  {
    path: '/acompanhar/:token',
    element: <Navigate to="/login" replace />,
  },
  {
    path: '/design-system',
    element: (
      <Suspense fallback={<PageSkeleton />}>
        <DesignSystemPage />
      </Suspense>
    ),
  },
  {
    path: '/convite/:token',
    element: (
      <Suspense fallback={<PageSkeleton />}>
        <AcceptInvitePage />
      </Suspense>
    ),
  },
  {
    path: '/aprovar/:token',
    element: <Navigate to="/login" replace />,
  },
  {
    path: '/',
    element: <RequireAuth />,
    children: [
      { index: true, element: <Navigate to="/inicio" replace /> },
      {
        path: '*',
        element: <AppShell pageRoutes={shellRoutes} adminRoutes={adminRoutes} />,
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/inicio" replace />,
  },
]);
