import {
  FileAddOutlined,
  FileTextOutlined,
  GlobalOutlined,
  MenuOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  Avatar,
  Badge,
  Button,
  Drawer,
  Dropdown,
  Layout,
  Menu,
  Select,
  Space,
  Tabs,
  Typography,
} from 'antd';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { navigationItems } from '../../app/navigation';
import pvDrillingLogo from '../../assets/pv-drilling-logo.png';
import { useAuth } from '../../features/auth/auth-context';
import './app-shell.css';
import { jsaApi } from '../../features/jsa/jsa-api';
import { workflowApi } from '../../features/jsa/workflow-api';
import { useRigContext } from '../../features/jsa/rig-context';

const { Header, Sider, Content } = Layout;
export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { rigs, selectedRigId, loading: rigsLoading, setSelectedRigId } = useRigContext();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const jsaCapabilities = useQuery({
    queryKey: ['jsa-capabilities'],
    queryFn: jsaApi.capabilities,
  });
  const workflowCapabilities = useQuery({
    queryKey: ['workflow-capabilities'],
    queryFn: workflowApi.capabilities,
  });
  const navigationCounts = useQuery({
    queryKey: ['jsa-navigation-counts', selectedRigId ?? 'all'],
    queryFn: () => workflowApi.navigationCounts(selectedRigId),
    enabled: workflowCapabilities.data?.view === true,
  });
  const items = useMemo(
    () => [
      ...navigationItems.filter((item) => user?.permissions.includes(item.permission)),
      ...(workflowCapabilities.data?.view
        ? [
            {
              key: '/jsa/published',
              label: withCount('Published JSA', navigationCounts.data?.published),
              permission: '',
              area: 'jsa' as const,
              icon: <FileAddOutlined />,
            },
            {
              key: '/jsa/approvals',
              label: withCount('Needs Approval', navigationCounts.data?.approvals),
              permission: '',
              area: 'jsa' as const,
              icon: <FileAddOutlined />,
            },
            {
              key: '/jsa/pending',
              label: withCount('Pending JSA', navigationCounts.data?.pending),
              permission: '',
              area: 'jsa' as const,
              icon: <FileAddOutlined />,
            },
            {
              key: '/jsa/rejected',
              label: withCount('Rejected JSA', navigationCounts.data?.rejected),
              permission: '',
              area: 'jsa' as const,
              icon: <FileAddOutlined />,
            },
          ]
        : []),
      ...(jsaCapabilities.data?.view
        ? [
            {
              key: '/jsa/drafts',
              label: withCount('My Drafts', navigationCounts.data?.drafts),
              permission: '',
              area: 'jsa' as const,
              icon: <FileTextOutlined />,
            },
          ]
        : []),
      ...(workflowCapabilities.data?.admin
        ? [
            {
              key: '/operations/workflow',
              label: 'Approval Workflow',
              permission: '',
              area: 'administration' as const,
              icon: <FileAddOutlined />,
            },
          ]
        : []),
    ],
    [
      user,
      jsaCapabilities.data?.view,
      workflowCapabilities.data?.view,
      workflowCapabilities.data?.admin,
      navigationCounts.data,
    ],
  );
  const area = location.pathname.startsWith('/operations') ? 'administration' : 'jsa';
  const menu = (
    <Menu
      selectedKeys={[location.pathname]}
      onClick={({ key }) => {
        navigate(key);
        setDrawerOpen(false);
      }}
      items={items
        .filter((item) => item.area === area)
        .map(({ key, label, icon }) => ({ key, label, icon }))}
    />
  );
  return (
    <Layout className="app-shell">
      <Header className="app-header">
        <Space>
          <Button
            className="mobile-menu"
            aria-label="Open navigation"
            icon={<MenuOutlined />}
            onClick={() => setDrawerOpen(true)}
          />
          <img className="app-brand-logo" src={pvDrillingLogo} alt="PV Drilling logo" />
          <Typography.Title level={4}>JSAMS</Typography.Title>
          <Badge color="orange" text={`${import.meta.env.MODE.toUpperCase()} ENVIRONMENT`} />
        </Space>
        <Dropdown
          menu={{
            items: [
              { key: 'profile', label: user?.displayName },
              { key: 'logout', label: 'Sign out', onClick: () => void logout() },
            ],
          }}
        >
          <Button type="text" icon={<Avatar size="small" icon={<UserOutlined />} />}>
            {user?.username}
          </Button>
        </Dropdown>
      </Header>
      <div className="workspace-tabs">
        <Tabs
          activeKey={area}
          onChange={(key) => {
            const destination = items.find((item) => item.area === key)?.key;
            if (destination) navigate(destination);
          }}
          items={[
            {
              key: 'jsa',
              label: 'JSA',
              disabled: !items.some((item) => item.area === 'jsa'),
            },
            {
              key: 'administration',
              label: 'Administration',
              disabled: !items.some((item) => item.area === 'administration'),
            },
          ]}
        />
      </div>
      <Layout>
        <Sider theme="light" width={240} className="side-nav">
          {area === 'administration' ? (
            <Typography.Text type="secondary">ADMINISTRATION</Typography.Text>
          ) : null}
          {menu}
        </Sider>
        <Drawer
          title="Navigation"
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          className="mobile-drawer"
        >
          {menu}
        </Drawer>
        <Layout>
          <div className="action-bar">
            {area === 'jsa' ? (
              <div className="working-rig-selector">
                <GlobalOutlined aria-hidden="true" />
                <label htmlFor="working-rig">Working Rig</label>
                <Select
                  id="working-rig"
                  aria-label="Working Rig"
                  loading={rigsLoading}
                  value={selectedRigId ?? 'all'}
                  onChange={(value) => setSelectedRigId(value === 'all' ? undefined : value)}
                  options={[
                    { value: 'all', label: 'All governed rigs' },
                    ...rigs.map((rig) => ({
                      value: rig.id,
                      label: `${rig.code} — ${rig.name}`,
                    })),
                  ]}
                />
              </div>
            ) : (
              <Typography.Text type="secondary">Administration</Typography.Text>
            )}
          </div>
          <Content className="main-content">
            <Outlet />
          </Content>
        </Layout>
      </Layout>
    </Layout>
  );
}

function withCount(label: string, count: number | undefined) {
  return count === undefined ? label : `${label} (${count})`;
}
