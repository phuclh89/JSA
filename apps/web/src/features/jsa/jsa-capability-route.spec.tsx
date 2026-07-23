import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { render,screen } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { JsaCapabilityRoute } from './jsa-capability-route';
import { jsaApi } from './jsa-api';
vi.mock('./jsa-api',()=>({jsaApi:{capabilities:vi.fn()}}));
const renderRoute=()=>render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><JsaCapabilityRoute capability="create"><div>Creator workspace</div></JsaCapabilityRoute></QueryClientProvider>);
describe('JSA capability route',()=>{beforeEach(()=>vi.clearAllMocks());it('renders the workspace only for the configured capability',async()=>{vi.mocked(jsaApi.capabilities).mockResolvedValue({view:true,create:true,edit:true,cancel:true,configured:true});renderRoute();expect(await screen.findByText('Creator workspace')).toBeInTheDocument();});it('explains fail-closed configuration',async()=>{vi.mocked(jsaApi.capabilities).mockResolvedValue({view:false,create:false,edit:false,cancel:false,configured:false,unavailableReason:'JSA permission-code mapping is not configured'});renderRoute();expect(await screen.findByText('JSA permission-code mapping is not configured')).toBeInTheDocument();});});
