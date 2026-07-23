import { FileAddOutlined, MenuOutlined, SafetyCertificateOutlined, UserOutlined } from '@ant-design/icons';
import {
  Avatar,
  Badge,
  Button,
  Drawer,
  Dropdown,
  Layout,
  Menu,
  Space,
  Tabs,
  Typography,
} from 'antd';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { navigationItems } from '../../app/navigation';
import { useAuth } from '../../features/auth/auth-context';
import './app-shell.css';
import { jsaApi } from '../../features/jsa/jsa-api';
import { workflowApi } from '../../features/jsa/workflow-api';

const { Header, Sider, Content } = Layout;
export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const jsaCapabilities = useQuery({ queryKey: ['jsa-capabilities'], queryFn: jsaApi.capabilities });
  const workflowCapabilities = useQuery({queryKey:['workflow-capabilities'],queryFn:workflowApi.capabilities});
  const items = useMemo(
    () => [...navigationItems.filter((item) => user?.permissions.includes(item.permission)),...(jsaCapabilities.data?.create?[{key:'/jsa/new',label:'Create JSA',permission:'',area:'browse' as const,icon:<FileAddOutlined/>}]:[]),...(workflowCapabilities.data?.view?[{key:'/jsa/approvals',label:'Needs Approval',permission:'',area:'browse' as const,icon:<FileAddOutlined/>},{key:'/jsa/pending',label:'Pending Approval',permission:'',area:'browse' as const,icon:<FileAddOutlined/>},{key:'/jsa/rejected',label:'Rejected JSA',permission:'',area:'browse' as const,icon:<FileAddOutlined/>},{key:'/jsa/published',label:'Published JSA',permission:'',area:'browse' as const,icon:<FileAddOutlined/>}]:[]),...(workflowCapabilities.data?.admin?[{key:'/operations/workflow',label:'Approval Workflow',permission:'',area:'operations' as const,icon:<FileAddOutlined/>}]:[])],
    [user, jsaCapabilities.data?.create,workflowCapabilities.data?.view,workflowCapabilities.data?.admin],
  );
  const area = location.pathname.startsWith('/operations') ? 'operations' : 'browse';
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
          <SafetyCertificateOutlined className="brand-icon" />
          <Typography.Title level={4}>JSAMS</Typography.Title>
          <Badge color="orange" text={`${import.meta.env.MODE.toUpperCase()} ENVIRONMENT`} />
        </Space>
        <Dropdown
          menu={{
            items: [
              { key: 'profile', label: user?.displayName },
              { key: 'logout', label: 'Sign out', onClick: logout },
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
          onChange={(key) => navigate(key === 'browse' ? '/browse' : '/operations/security')}
          items={[
            { key: 'browse', label: 'Browse' },
            {
              key: 'operations',
              label: 'Operations',
              disabled: !items.some((item) => item.area === 'operations'),
            },
          ]}
        />
      </div>
      <Layout>
        <Sider theme="light" width={240} className="side-nav">
          <Typography.Text type="secondary">{area.toUpperCase()}</Typography.Text>
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
            <Typography.Text type="secondary">Available actions</Typography.Text>
          </div>
          <Content className="main-content">
            <Outlet />
          </Content>
        </Layout>
      </Layout>
    </Layout>
  );
}
