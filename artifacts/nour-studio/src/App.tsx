import { useMemo, useState } from 'react';
import { Link, Route, Router as WouterRouter, Switch } from 'wouter';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Bell,
  ChevronDown,
  CircleHelp,
  Download,
  LayoutDashboard,
  ListFilter,
  Mail,
  MoreHorizontal,
  RefreshCw,
  Rocket,
  Search,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import EditorWorkspace from './editor/EditorWorkspace';
import NotFound from '@/pages/not-found';

declare global {
  interface Window {
    __TAURI__?: {
      core?: {
        invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
        convertFileSrc: (filePath: string, protocol?: string) => string;
      };
    };
  }
}

function NourMark() {
  return <div className="nour-mark" aria-label="Nour mark"><span /><span /><span /></div>;
}

function useLocalToast() {
  const [message, setMessage] = useState('');
  const notify = (next: string) => {
    setMessage(next);
    window.setTimeout(() => setMessage(''), 2400);
  };
  return { message, notify };
}

type ConsolePage = 'overview' | 'users' | 'installations' | 'live' | 'releases' | 'email' | 'analytics';
const consoleMeta: Record<ConsolePage, [string, string, string, string]> = {
  overview: ['Overview', 'PRODUCT OPERATIONS', 'Good morning, Nour Studio.', 'A clear view of your product, people, and releases.'],
  users: ['Users', 'PEOPLE', 'Everyone using Nour.', 'Accounts, communication preferences, and recent activity.'],
  installations: ['Installations', 'DISTRIBUTION', 'Nour in the wild.', 'Downloads, first launches, versions, and devices.'],
  live: ['Live activity', 'RIGHT NOW', 'A live pulse of Nour.', 'Approximate activity from opted-in desktop sessions.'],
  releases: ['Releases', 'PRODUCT', 'Ship with confidence.', 'Manage versions, release notes, and update channels.'],
  email: ['Email', 'COMMUNICATIONS', 'Keep your people in the loop.', 'Send thoughtful product updates to people who opted in.'],
  analytics: ['Analytics', 'INSIGHTS', 'Understand the product.', 'Aggregate usage signals without collecting creative work.'],
};
const users = [
  { initials: 'SL', name: 'Sofia Larsson', email: 'sofia@example.com', version: '0.1.0', device: 'Apple Silicon', status: 'Active', last: '2 min ago', tone: '' },
  { initials: 'YA', name: 'Yassine Amrani', email: 'yassine@example.com', version: '0.1.0', device: 'Apple Silicon', status: 'Active', last: '18 min ago', tone: 'gold' },
  { initials: 'EM', name: 'Emma Martin', email: 'emma@example.com', version: '0.0.9', device: 'Intel', status: 'Offline', last: 'Yesterday', tone: 'blue' },
  { initials: 'KN', name: 'Karim Nouri', email: 'karim@example.com', version: '0.1.0', device: 'Apple Silicon', status: 'Active', last: 'Yesterday', tone: 'rose' },
  { initials: 'LH', name: 'Lina Haddad', email: 'lina@example.com', version: '0.0.9', device: 'Apple Silicon', status: 'Invited', last: '—', tone: 'gold' },
];

function ConsolePageView() {
  const [page, setPage] = useState<ConsolePage>('overview');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'release' | 'email' | null>(null);
  const { message, notify } = useLocalToast();
  const [crumb, overline, heading, description] = consoleMeta[page];
  const filteredUsers = useMemo(() => users.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(search.toLowerCase())), [search]);
  const nav: Array<[ConsolePage, string, typeof LayoutDashboard]> = [['overview', 'Overview', LayoutDashboard], ['users', 'Users', Users], ['installations', 'Installations', Download], ['live', 'Live activity', Activity], ['releases', 'Releases', Rocket], ['email', 'Email', Mail], ['analytics', 'Analytics', BarChart3]];
  const primary = () => {
    if (page === 'overview' || page === 'releases') setModal('release');
    else if (page === 'email') setModal('email');
    else notify(`${consoleMeta[page][0]} action is ready for the backend phase`);
  };
  return <div className="console-app">
    <aside className="console-sidebar">
      <Link href="/console/" className="console-brand" data-testid="link-console-home"><NourMark /><div><div className="brand-name">NOUR</div><small>console</small></div></Link>
      <button className="workspace-switcher" onClick={() => notify('Workspace switcher is ready')} data-testid="button-workspace-switcher"><span className="workspace-avatar">N</span><div><strong>Nour Studio</strong><span>Personal workspace</span></div><ChevronDown className="down" size={15} /></button>
      <nav className="console-nav" aria-label="Console navigation"><p className="nav-label">Workspace</p>{nav.slice(0, 4).map(([key, label, Icon]) => <button key={key} className={`console-nav-item ${page === key ? 'active' : ''}`} onClick={() => setPage(key)} data-testid={`nav-console-${key}`}><Icon size={15} /><span>{label}</span></button>)}<p className="nav-label spaced">Product</p>{nav.slice(4).map(([key, label, Icon]) => <button key={key} className={`console-nav-item ${page === key ? 'active' : ''}`} onClick={() => setPage(key)} data-testid={`nav-console-${key}`}><Icon size={15} /><span>{label}</span></button>)}</nav>
      <div className="console-side-bottom"><div className="build-badge"><span className="pulse" /><div><strong>Demo data</strong><small>Local preview mode</small></div></div><button className="console-nav-item" onClick={() => notify('Console settings are ready')} data-testid="button-console-settings"><Settings size={15} /><span>Settings</span></button><div className="admin-row"><span className="admin-avatar">MC</span><div><strong>Admin</strong><span>Owner</span></div><button className="more" onClick={() => notify('Account menu opened')} data-testid="button-admin-menu"><MoreHorizontal size={15} /></button></div></div>
    </aside>
    <main className="console-main">
      <header className="console-topbar"><div className="breadcrumbs"><span>Nour Console</span><b>/</b><strong>{crumb}</strong></div><div className="topbar-actions"><Link href="/" className="desktop-link" data-testid="link-back-to-desktop"><ArrowLeft size={13} /><span>Back to Desktop</span></Link><button className="help-button" onClick={() => notify('Help center is ready')} data-testid="button-console-help"><CircleHelp size={14} /> <span>Help</span></button><button className="notification-button" onClick={() => notify('No new notifications')} data-testid="button-notifications"><Bell size={17} /><i /></button><span className="console-avatar">MC</span></div></header>
      <div className="console-content"><div className="page-heading"><div><p className="overline">{overline}</p><h1>{heading}</h1><p>{description}</p></div><div className="heading-actions"><span className="demo-chip"><span /> Preview data</span><button className="console-btn" onClick={() => notify('Date range selector ready')} data-testid="button-date-range">Last 30 days <ChevronDown size={12} /></button><button className="console-btn primary" onClick={primary} data-testid="button-console-primary">{page === 'email' ? 'Compose email' : page === 'live' ? 'Refresh' : page === 'installations' ? 'Download report' : page === 'users' ? 'Invite user' : page === 'analytics' ? 'Export report' : page === 'releases' ? 'New release' : 'New release'} <b>+</b></button></div></div>
        {page === 'overview' && <Overview setPage={setPage} notify={notify} />}
        {page === 'users' && <UsersPage users={filteredUsers} search={search} setSearch={setSearch} notify={notify} />}
        {page === 'installations' && <Installations notify={notify} />}
        {page === 'live' && <LivePage notify={notify} />}
        {page === 'releases' && <Releases openModal={() => setModal('release')} />}
        {page === 'email' && <EmailPage openModal={() => setModal('email')} />}
        {page === 'analytics' && <Analytics notify={notify} />}
      </div>
    </main>
    {modal && <ConsoleModal type={modal} close={() => setModal(null)} save={() => { setModal(null); notify(modal === 'release' ? 'Release saved as a local draft' : 'Email saved as a local draft'); }} />}
    {message && <div className="console-toast show" role="status" data-testid="status-console-toast">{message}</div>}
  </div>;
}

function Metric({ icon, label, number, change, neutral }: { icon: string; label: string; number: string; change: string; neutral?: boolean }) {
  return <article className="metric-card" data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}><div className="metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></div><strong className="metric-number">{number}</strong><span className={`metric-change ${neutral ? 'neutral' : ''}`}>{change}</span></article>;
}
function Overview({ setPage, notify }: { setPage: (page: ConsolePage) => void; notify: (message: string) => void }) {
  return <><div className="metric-grid"><Metric icon="↓" label="Downloads" number="1,284" change="↗ 18.4% vs. last month" /><Metric icon="◎" label="Activated users" number="846" change="↗ 12.1% vs. last month" /><Metric icon="◉" label="Active this month" number="612" change="↗ 9.7% vs. last month" /><Metric icon="●" label="Live now" number="24" change="Updated just now" neutral /></div><div className="dashboard-grid"><section className="console-card chart-card"><CardHeader title="Product activity" copy="Downloads and active users over the last 30 days" action="View report" onClick={() => setPage('analytics')} /><div className="chart-wrap"><div className="chart-legend"><span className="legend-key"><i />Downloads</span><span className="legend-key"><i />Active users</span></div><div className="chart"><div className="y-labels"><span>400</span><span>300</span><span>200</span><span>100</span><span>0</span></div><div className="chart-area"><div className="grid-lines"><svg className="line-svg" viewBox="0 0 700 180" preserveAspectRatio="none"><path className="downloads" d="M0,154 C38,150 55,124 85,142 S130,100 160,116 S205,89 235,105 S278,52 315,83 S355,73 392,74 S430,48 465,66 S505,24 545,50 S590,30 620,42 S666,18 700,24" /><path className="active" d="M0,166 C38,161 55,146 85,155 S130,133 160,143 S205,123 235,131 S278,102 315,119 S355,99 392,109 S430,87 465,101 S505,78 545,92 S590,68 620,77 S666,61 700,67" /></svg></div><div className="x-labels"><span>Aug 07</span><span>Aug 14</span><span>Aug 21</span><span>Aug 28</span><span>Sep 05</span></div></div></div></div></section><section className="console-card version-card"><CardHeader title="Version adoption" copy="Installed Nour versions" action="Manage" onClick={() => setPage('releases')} /><div className="version-list">{[['0.1.0', 'Current release', '68%', 68], ['0.0.9', 'Previous release', '24%', 24], ['0.0.8', 'Older release', '6%', 6], ['Other', 'Unrecognized', '2%', 2]].map((version, index) => <div className="version-row" key={version[0]}><div className="version-ring">{index === 0 ? '✓' : version[2]}</div><div className="version-details"><strong>{version[0]}</strong><span>{version[1]}</span></div><span className="version-percent">{version[2]}</span><div className="version-bar"><i style={{ width: `${version[3]}%` }} /></div></div>)}</div></section></div><div className="lower-grid"><MiniCard title="Recent activity" copy="Across your product" action="See all" onClick={() => setPage('live')} rows={[['green', 'New installation', 'Sofia Larsson · Apple Silicon', '2m'], ['blue', 'Release downloaded', 'Nour 0.1.0 · 4 devices', '1h'], ['', 'New account', 'Yassine Amrani opted in', '3h']]} /><MiniCard title="Top project types" copy="What people are making" action="Details" onClick={() => setPage('analytics')} rows={[['', 'Documentary', '32% of projects', '→'], ['green', 'Wedding film', '24% of projects', '→'], ['blue', 'Interview', '18% of projects', '→']]} /><MiniCard title="Release health" copy="0.1.0 · current" action="Healthy" onClick={() => notify('Release health is healthy')} rows={[['green', 'Crash-free sessions', '99.2% in the last 7 days', '99.2%'], ['green', 'Update success', 'Last 100 installations', '98%'], ['blue', 'Support requests', '3 open conversations', '3']]} /></div></>;
}
function CardHeader({ title, copy, action, onClick }: { title: string; copy: string; action: string; onClick: () => void }) { return <div className="console-card-header"><div><h2>{title}</h2><p>{copy}</p></div><button className="card-link" onClick={onClick} data-testid={`button-card-${title.toLowerCase().replaceAll(' ', '-')}`}>{action} →</button></div>; }
function MiniCard({ title, copy, action, onClick, rows }: { title: string; copy: string; action: string; onClick: () => void; rows: string[][] }) { return <section className="console-card mini-card"><CardHeader title={title} copy={copy} action={action} onClick={onClick} /><div className="activity-list">{rows.map((row, index) => <div className="activity-row" key={row[1]}><i className={`activity-dot ${row[0]}`} /><div><strong>{row[1]}</strong><span>{row[2]}</span></div><small className="activity-time">{row[3]}</small></div>)}</div></section>; }

function UsersPage({ users: rows, search, setSearch, notify }: { users: typeof users; search: string; setSearch: (value: string) => void; notify: (message: string) => void }) {
  return <section className="console-card table-card"><div className="console-card-header"><div><h2>Users</h2><p>Account and communication status</p></div><button className="console-btn" onClick={() => notify('User report export will be connected to the backend later')} data-testid="button-export-users">Export CSV</button></div><div className="table-toolbar"><label className="search-box"><Search size={13} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users or email..." aria-label="Search users" data-testid="input-search-users" /></label><button className="console-btn" onClick={() => notify('User filters are ready')} data-testid="button-filter-users"><ListFilter size={12} /> All users</button></div><table><thead><tr><th>User</th><th>Version</th><th>Device</th><th>Status</th><th>Last active</th><th /></tr></thead><tbody>{rows.length ? rows.map((user) => <tr key={user.email}><td><div className="user-cell"><span className={`user-mini ${user.tone}`}>{user.initials}</span><div><strong>{user.name}</strong><br /><span>{user.email}</span></div></div></td><td>{user.version}</td><td>{user.device}</td><td><span className={`status ${user.status.toLowerCase()}`}><i />{user.status}</span></td><td>{user.last}</td><td><button className="table-actions" onClick={() => notify(`${user.name} menu opened`)} data-testid={`button-user-menu-${user.initials}`}><MoreHorizontal size={14} /></button></td></tr>) : <tr><td colSpan={6}><div className="empty-row">No users match this search.</div></td></tr>}</tbody></table></section>;
}
function Installations({ notify }: { notify: (message: string) => void }) { return <><div className="page-card-grid"><InfoCard icon="↓" title="1,284 downloads" copy="Installer downloads across all Nour release channels in the selected period." /><InfoCard icon="◎" title="846 first launches" copy="Each installation registers once, with an anonymous device identifier." /><InfoCard icon="⌘" title="82% Apple Silicon" copy="Hardware distribution helps prioritize native performance work." /></div><TableCard title="Latest installations" copy="Only opted-in product telemetry is shown here." action="Download report" onClick={() => notify('Installation report prepared')} headers={['Installation', 'Version', 'Architecture', 'First launch', 'Last seen', 'Telemetry']} rows={users.slice(0, 4).map((user, index) => [user.name, user.version, user.device, `${index + 1} day${index ? 's' : ''} ago`, user.last, 'Opted in'])} /></>; }
function LivePage({ notify }: { notify: (message: string) => void }) { return <><div className="live-banner"><span className="live-pulse" /><strong className="live-number">24</strong><div><strong>people are using Nour right now</strong><span>Based on a recent heartbeat from opted-in desktop sessions. Updated just now.</span></div><button className="console-btn" onClick={() => notify('Live activity refreshed')} data-testid="button-refresh-live"><RefreshCw size={12} /> Refresh</button></div><TableCard title="Live sessions" copy="Approximate activity—never media content." action="Live" onClick={() => notify('Live sessions are current')} headers={['User', 'Version', 'Workspace', 'Current area', 'Session']} rows={users.slice(0, 4).map((user, index) => [user.name, user.version, ['Local project', 'Untitled film', 'Wedding 2026', 'Brand story'][index], ['Edit', 'Color', 'Media', 'Timeline'][index], ['18m', '42m', '7m', '1h 12m'][index]])} /></>; }
function Releases({ openModal }: { openModal: () => void }) { return <><section className="console-card table-card"><div className="console-card-header"><div><h2>Release channels</h2><p>Control what users receive and when.</p></div><button className="console-btn primary" onClick={openModal} data-testid="button-create-release">New release <b>+</b></button></div>{[['0.1.0', 'Current stable', 'Published Sep 04, 2026', '68% adoption', 'Stable'], ['0.0.9', 'Previous stable', 'Published Aug 18, 2026', '24% adoption', 'Archived'], ['0.0.8', 'Legacy', 'Published Jul 30, 2026', '6% adoption', 'Archived']].map((release) => <div className="release-item" key={release[0]}><div className="release-badge">{release[0]}</div><div><strong>{release[1]}</strong><span>{release[2]} · {release[3]}</span></div><span className="release-status">{release[4]}</span><button className="table-actions" onClick={openModal} data-testid={`button-release-menu-${release[0]}`}><MoreHorizontal size={14} /></button></div>)}</section><InfoCard icon="↥" title="Automatic update checks" copy="Nour Desktop can check this release service on launch and show an optional or required update without storing project media online." /></>; }
function EmailPage({ openModal }: { openModal: () => void }) { return <div className="email-composer"><section className="console-card composer-card"><h2>Compose a product update</h2><p>Send only to people who have opted in to product communications.</p><div className="form-field"><label>Subject</label><input defaultValue="Nour 0.1.0 is ready" data-testid="input-email-subject" /></div><div className="form-field"><label>Audience</label><select data-testid="select-email-audience"><option>Product updates · 612 opted in</option><option>Early access · 184 opted in</option><option>All active users · 612 opted in</option></select></div><div className="form-field"><label>Message</label><textarea defaultValue="A new version of Nour is ready. This release improves the local editing workflow and adds the first thumbnail and title tools." data-testid="input-email-body" /></div><button className="console-btn primary" onClick={openModal} data-testid="button-preview-email">Preview email <b>→</b></button></section><section className="console-card composer-card"><h2>Communication rules</h2><p>Build trust into the product from the start.</p><div className="audience-list"><label className="audience-option"><input type="checkbox" defaultChecked /> Product updates</label><label className="audience-option"><input type="checkbox" /> Tips and inspiration</label><label className="audience-option"><input type="checkbox" /> Early access releases</label></div><InfoCard icon="✓" title="No media data in email tools" copy="Only account and communication preference data belongs here. Projects stay on the user’s computer." /></section></div>; }
function Analytics({ notify }: { notify: (message: string) => void }) { return <><div className="page-card-grid"><InfoCard icon="◒" title="32% documentary" copy="The most selected project type in the last 30 days." /><InfoCard icon="◐" title="61% exported" copy="Activated users who completed at least one export." /><InfoCard icon="T" title="Arabic captions" copy="Caption language usage can be tracked as an aggregate product signal." /></div><TableCard title="Feature adoption" copy="Aggregate signals, never creative content." action="Export report" onClick={() => notify('Analytics report prepared')} headers={['Feature', 'Activated users', 'Change', 'Signal']} rows={[['Basic color grading', '74%', '+12%', 'Growing'], ['Thumbnail capture', '52%', '+21%', 'Growing'], ['Audio cleanup', '38%', '+9%', 'Growing'], ['AI analysis', '—', 'Not connected', 'Planned']]} /></>; }
function InfoCard({ icon, title, copy }: { icon: string; title: string; copy: string }) { return <section className="console-card info-card"><div className="info-icon">{icon}</div><h2>{title}</h2><p>{copy}</p></section>; }
function TableCard({ title, copy, action, onClick, headers, rows }: { title: string; copy: string; action: string; onClick: () => void; headers: string[]; rows: string[][] }) { return <section className="console-card table-card"><div className="console-card-header"><div><h2>{title}</h2><p>{copy}</p></div><button className="console-btn" onClick={onClick} data-testid={`button-table-${title.toLowerCase().replaceAll(' ', '-')}`}>{action}</button></div><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row[0]}-${index}`}>{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`}>{cellIndex === 0 ? <strong>{cell}</strong> : cellIndex === row.length - 1 ? <span className="status active"><i />{cell}</span> : cell}</td>)}</tr>)}</tbody></table></section>; }
function ConsoleModal({ type, close, save }: { type: 'release' | 'email'; close: () => void; save: () => void }) { return <div className="modal-backdrop" onClick={close}><div className="modal" onClick={(event) => event.stopPropagation()}><button className="icon-btn" onClick={close} style={{ float: 'right' }} data-testid="button-close-modal"><X size={15} /></button><p className="overline">{type === 'release' ? 'NEW RELEASE' : 'EMAIL PREVIEW'}</p><h2>{type === 'release' ? 'Prepare a Nour release' : 'Nour 0.1.0 is ready'}</h2><p>{type === 'release' ? 'Set the version, release notes, and update channel. This local preview will not publish anything yet.' : 'This message will be sent only to users who have opted in. The email provider will be connected later.'}</p>{type === 'release' ? <><div className="form-field"><label>Version</label><input defaultValue="0.1.1" data-testid="input-release-version" /></div><div className="form-field"><label>Release notes</label><textarea placeholder="What changed?" data-testid="input-release-notes" /></div></> : <div className="console-card" style={{ padding: 14 }}><p style={{ margin: 0, color: '#1f2428' }}>A new version of Nour is ready. This release improves the local editing workflow and adds the first thumbnail and title tools.</p></div>}<div className="modal-actions"><button className="console-btn" onClick={close} data-testid="button-cancel-modal">Cancel</button><button className="console-btn primary" onClick={save} data-testid="button-save-modal">Save as draft <b>→</b></button></div></div></div>; }

function Router() {
  return <ErrorBoundary resetKey={window.location.pathname}><Switch><Route path="/" component={EditorWorkspace} /><Route path="/console" component={ConsolePageView} /><Route path="/console/" component={ConsolePageView} /><Route component={NotFound} /></Switch></ErrorBoundary>;
}
function App() {
  return <TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider>;
}
export default App;