import { SafetyCertificateOutlined, UserOutlined } from '@ant-design/icons';
import { Avatar, Badge, Button, Dropdown, Layout, Menu, Space, Tabs, Typography } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useCurrentUser } from '../../features/auth/auth-context';
import './app-shell.css';

const { Header, Sider, Content } = Layout;
export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useCurrentUser();
  return (
    <Layout className="app-shell">
      <Header className="app-header">
        <Space>
          <SafetyCertificateOutlined className="brand-icon" />
          <Typography.Title level={4}>JSAMS</Typography.Title>
          <Badge color="orange" text={`${import.meta.env.MODE.toUpperCase()} ENVIRONMENT`} />
        </Space>
        <Dropdown menu={{ items: [{ key: 'profile', label: user?.displayName ?? 'Guest' }] }}>
          <Button type="text" icon={<Avatar size="small" icon={<UserOutlined />} />}>
            {user?.username ?? 'Guest'}
          </Button>
        </Dropdown>
      </Header>
      <div className="workspace-tabs">
        <Tabs
          items={[
            { key: 'browse', label: 'Browse' },
            { key: 'operations', label: 'Operations', disabled: true },
          ]}
        />
      </div>
      <Layout>
        <Sider theme="light" width={240} className="side-nav">
          <Typography.Text type="secondary">SYSTEM</Typography.Text>
          <Menu
            selectedKeys={[location.pathname]}
            onClick={({ key }) => navigate(key)}
            items={[{ key: '/system/health', label: 'Health Check' }]}
          />
        </Sider>
        <Layout>
          <div className="action-bar">
            <Typography.Text type="secondary">Action bar</Typography.Text>
          </div>
          <Content className="main-content">
            <Outlet />
          </Content>
        </Layout>
      </Layout>
    </Layout>
  );
}
