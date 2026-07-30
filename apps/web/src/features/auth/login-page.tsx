import {
  CheckCircleFilled,
  LockOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Alert, Button, Form, Input } from 'antd';
import { Navigate, useNavigate } from 'react-router-dom';
import pvDrillingLogo from '../../assets/pv-drilling-logo.png';
import { ApiClientError } from '../../services/api-client';
import { useAuth } from './auth-context';
import './login-page.css';

interface LoginValues {
  username: string;
  password: string;
}

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [form] = Form.useForm<LoginValues>();

  if (auth.status === 'authenticated') return <Navigate to="/jsa/drafts" replace />;

  const submit = async (values: LoginValues) => {
    try {
      await auth.login(values.username, values.password);
      form.setFieldValue('password', '');
      navigate('/jsa/drafts', { replace: true });
    } catch (error) {
      form.setFieldValue('password', '');
      if (error instanceof ApiClientError && error.status === 401) {
        form.setFields([{ name: 'password', errors: ['Username or password is incorrect.'] }]);
      }
    }
  };

  return (
    <main className="login-page">
      <div className="login-shell">
        <aside className="login-story" aria-label="About JSAMS">
          <div>
            <div className="login-identity">
              <div className="login-logo-frame">
                <img className="login-brand-logo" src={pvDrillingLogo} alt="PV Drilling logo" />
              </div>
              <div className="login-wordmark">
                <span>PV DRILLING</span>
                <strong>JSAMS</strong>
              </div>
            </div>
            <div className="login-story-copy">
              <span className="login-eyebrow login-eyebrow-inverse">JOB SAFETY, GOVERNED</span>
              <h2>Plan safer work with clarity and control.</h2>
              <p>
                A single workspace for creating, reviewing, approving, and publishing Job Safety
                Analyses.
              </p>
            </div>
            <ul className="login-capabilities">
              <li>
                <CheckCircleFilled aria-hidden />
                Rig-specific risk assessment
              </li>
              <li>
                <CheckCircleFilled aria-hidden />
                Controlled approval workflow
              </li>
              <li>
                <CheckCircleFilled aria-hidden />
                Traceable JSA lifecycle
              </li>
            </ul>
          </div>
          <div className="login-story-footer">
            <SafetyCertificateOutlined aria-hidden />
            <span>PV Drilling internal workspace</span>
          </div>
        </aside>

        <section className="login-panel" aria-labelledby="login-title">
          <div className="login-panel-content">
            <header className="login-heading">
              <span className="login-eyebrow">ENTERPRISE ACCESS</span>
              <h1 id="login-title">Welcome back</h1>
              <p>Sign in with your PV Drilling network account to continue to JSAMS.</p>
            </header>

            {auth.status === 'unregistered' && (
              <Alert
                type="warning"
                showIcon
                message="Application access is not registered"
                description="Your directory account is valid, but a JSAMS administrator must register and authorize it."
              />
            )}
            {auth.status === 'inactive' && (
              <Alert
                type="error"
                showIcon
                message="Application access is inactive"
                description="Contact a JSAMS administrator to restore application access."
              />
            )}
            {auth.status === 'error' && (
              <Alert
                type="error"
                showIcon
                message="Sign-in service unavailable"
                description="Please try again or contact support if the problem continues."
              />
            )}

            <Form<LoginValues>
              className="login-form"
              form={form}
              layout="vertical"
              requiredMark
              onFinish={submit}
              autoComplete="on"
            >
              <Form.Item
                label="Network username"
                name="username"
                rules={[{ required: true, message: 'Enter your network username.' }]}
              >
                <Input
                  size="large"
                  autoComplete="username"
                  autoFocus
                  placeholder="Enter your network username"
                  prefix={<UserOutlined aria-hidden />}
                  maxLength={256}
                />
              </Form.Item>
              <Form.Item
                label="Password"
                name="password"
                rules={[{ required: true, message: 'Enter your password.' }]}
              >
                <Input.Password
                  size="large"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  prefix={<LockOutlined aria-hidden />}
                  maxLength={1024}
                />
              </Form.Item>
              <Button
                className="login-submit"
                type="primary"
                htmlType="submit"
                size="large"
                loading={auth.status === 'loading'}
                block
              >
                Sign in to JSAMS
              </Button>
            </Form>

            <div className="login-security-note">
              <LockOutlined aria-hidden />
              <p>
                Your credentials are verified securely by PV Drilling Active Directory. JSAMS never
                stores your password.
              </p>
            </div>
          </div>
          <footer className="login-support">
            Need access assistance? Contact your JSAMS administrator.
          </footer>
        </section>
      </div>
    </main>
  );
}
