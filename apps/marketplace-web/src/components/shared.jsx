import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, NavLink } from 'react-router-dom';
import {
  ArrowUpRight,
  Bell,
  ChevronRight,
  CircleHelp,
  LayoutDashboard,
  BriefcaseBusiness,
  ListChecks,
  Shield,
  Plus,
  Square,
  Zap,
  Droplets,
  KeyRound,
  WashingMachine,
  Wind,
  Hammer,
  Sparkles,
  Truck,
  Laptop,
  FileText,
} from 'lucide-react';
import { useAuth } from '../auth';
import { list, save, download, label, money } from '../lib';
import { brandAssets } from '../../../../packages/ui/src/brand-assets';
export const categoryIcons = {
  electrical: Zap,
  plumbing: Droplets,
  locksmith: KeyRound,
  'appliance-repair': WashingMachine,
  hvac: Wind,
  handyman: Hammer,
  cleaning: Sparkles,
  'towing-recovery': Truck,
  'it-support': Laptop,
};
export function BrandLogo({ outline = false }) {
  return brandAssets[outline ? 'outline' : 'solid'] ? (
    <img
      src={`/brand/convyn-wordmark-${outline ? 'outline' : 'solid'}.png`}
      className="brand-logo"
      alt="CONVYN"
    />
  ) : (
    <span className="brand-wordmark">CONVYN</span>
  );
}
export function BrandMark() {
  return brandAssets.black ? (
    <img
      src="/brand/convyn-mark-black.png"
      className="brand-mark"
      alt="CONVYN"
    />
  ) : (
    <span className="brand-mark-text">CONVYN</span>
  );
}
export function useRecords(entity, filters = {}, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['entity', entity, filters, user?.id ?? 'public'],
    queryFn: () => list(entity, filters),
    enabled,
    refetchInterval: 15000,
  });
}
export function useAction(work) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: work,
    onSuccess: () => cache.invalidateQueries(),
  });
}
export function Feedback({ error, notice }) {
  return (
    <>
      {error && (
        <p className="feedback" role="alert">
          {String(error.message ?? error)}
        </p>
      )}
      {notice && (
        <p className="feedback" role="status">
          {notice}
        </p>
      )}
    </>
  );
}
export function Status({ value }) {
  return (
    <span
      className={
        'status-label ' +
        (['approved', 'closed', 'completed', 'online'].includes(value)
          ? 'status-inverse'
          : '')
      }
    >
      {label(value)}
    </span>
  );
}
export function Empty({ title, children, action }) {
  return (
    <div className="empty-state">
      <BrandMark />
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Intro({ eyebrow, title, children, action }) {
  return (
    <div className="page-introduction">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {children && <p className="page-description">{children}</p>}
      </div>
      {action}
    </div>
  );
}
export function Metrics({ items }) {
  return (
    <dl className="metrics-strip">
      {items.map(({ label, value, detail }) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
          {detail && <p>{detail}</p>}
        </div>
      ))}
    </dl>
  );
}
export function Loading() {
  return (
    <p role="status" className="loading">
      Loading your records…
    </p>
  );
}
export function QueryState({ query, children }) {
  return query.isPending ? (
    <Loading />
  ) : query.error ? (
    <Feedback error={query.error} />
  ) : (
    children(query.data)
  );
}
export function FileLinks({ uris = [] }) {
  const action = useAction(download);
  return (
    <>
      <div className="attachment-list">
        {uris.map((uri, i) => (
          <button
            type="button"
            className="button-secondary"
            key={uri}
            disabled={action.isPending}
            onClick={() => action.mutate(uri)}
          >
            <FileText size={16} /> Attachment {i + 1}
          </button>
        ))}
      </div>
      <Feedback error={action.error} />
    </>
  );
}
export function MoneyField({
  label,
  name,
  defaultValue = '0',
  required = true,
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        inputMode="decimal"
        pattern="[0-9]+(\.[0-9]{1,2})?"
        defaultValue={defaultValue}
        required={required}
      />
    </label>
  );
}
export function PublicHeader() {
  const { user, logout } = useAuth();
  return (
    <header className="brand-header">
      <Link to="/" aria-label="CONVYN home">
        <BrandLogo />
      </Link>
      <span className="header-workspace">YOUR WORLD. ON DEMAND.</span>
      <nav className="public-nav" aria-label="Main navigation">
        <Link to="/providers">Providers</Link>
        {user ? (
          <>
            <Link to="/dashboard">Workspace</Link>
            <button onClick={() => void logout()}>Sign out</button>
          </>
        ) : (
          <Link className="header-action" to="/login">
            Sign in <ArrowUpRight size={14} />
          </Link>
        )}
      </nav>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="brand-footer">
      <span>CONVYN</span>
      <span>YOUR WORLD. ON DEMAND.</span>
      <span>South Africa</span>
    </footer>
  );
}
export function AppShell({ children }) {
  const { user, logout } = useAuth(),
    [error, setError] = useState('');
  const links = [
    ['/dashboard', 'Overview', LayoutDashboard],
    ['/requests/new', 'New request', Plus],
    ['/bookings', 'Bookings', ListChecks],
    ['/provider', 'Provider hub', BriefcaseBusiness],
    ...(user.role === 'ADMIN' ? [['/admin', 'Administration', Shield]] : []),
  ].sort((a, b) => {
    const primary =
      user.role === 'ADMIN'
        ? '/admin'
        : user.role === 'PROVIDER'
          ? '/provider'
          : '/dashboard';
    return Number(b[0] === primary) - Number(a[0] === primary);
  });
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to workspace
      </a>
      <header className="brand-header">
        <Link to="/" aria-label="CONVYN home">
          <BrandLogo />
        </Link>
        <span className="header-workspace">Your workspace</span>
        <div className="account-context">
          <span>
            {user.firstName}
            <small>{user.role.toLowerCase()}</small>
          </span>
          <button onClick={() => logout().catch((e) => setError(e.message))}>
            Sign out
          </button>
        </div>
      </header>
      <div className="workspace-layout">
        <aside className="workspace-sidebar">
          <p className="eyebrow">CONVYN / Workspace</p>
          <nav aria-label="Workspace navigation">
            {links.map(([to, text, Icon]) => (
              <NavLink
                end={to === '/dashboard' || to === '/provider'}
                key={to}
                to={to}
              >
                <Icon size={13} />
                {text}
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-context">
            <BrandMark />
            <p className="eyebrow">Account context</p>
            <p>{user.email}</p>
            <Status value={user.role} />
            <p className="sidebar-tagline">
              YOUR WORLD.
              <br />
              ON DEMAND.
            </p>
          </div>
        </aside>
        <main id="main-content" tabIndex={-1} className="workspace-main">
          <Feedback error={error} />
          {children}
        </main>
      </div>
      <Footer />
    </>
  );
}
export function NotificationList() {
  const query = useRecords('Notification'),
    action = useAction((n) => save('Notification', { read: true }, n.id));
  return (
    <section className="panel" id="notifications">
      <p className="eyebrow">
        <Bell size={12} /> Account activity
      </p>
      <h2>Notifications</h2>
      <QueryState query={query}>
        {(items) =>
          items.length ? (
            <ul className="record-register">
              {items.map((n) => (
                <li key={n.id}>
                  <div className="record-line">
                    <div>
                      <strong>{n.title}</strong>
                      <p>{n.body}</p>
                      <Link to={n.link}>
                        Open record <ChevronRight size={13} />
                      </Link>
                    </div>
                    <div>
                      {!n.read ? (
                        <button
                          className="button-secondary"
                          onClick={() => action.mutate(n)}
                          disabled={action.isPending}
                        >
                          Mark read
                        </button>
                      ) : (
                        <Status value="read" />
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="You’re up to date">
              Updates to your requests, quotes and bookings will appear here.
            </Empty>
          )
        }
      </QueryState>
      <Feedback error={action.error} />
    </section>
  );
}
export function ProviderCard({ provider }) {
  return (
    <article className="provider-card">
      <div className="record-line">
        <h3>{provider.display_name}</h3>
        <Status value={provider.verification_status} />
      </div>
      <p>{provider.bio || 'Professional services in ' + provider.city}</p>
      <div className="meta-row">
        <span>
          {Number(provider.rating_avg).toFixed(1)} / 5 ·{' '}
          {provider.reviews_count} reviews
        </span>
        <span>{provider.jobs_completed} jobs</span>
        <span>{provider.city}</span>
      </div>
      <p>{provider.category_slugs.join(' · ')}</p>
      <p>
        {provider.callout_fee_cents > 0
          ? 'Callout from ' + money(provider.callout_fee_cents)
          : 'Request a quote for pricing.'}
      </p>
    </article>
  );
}
export function SupportNote() {
  const query = useQuery({
    queryKey: ['settings'],
    queryFn: () => list('PlatformSetting'),
  });
  return (
    <aside className="summary-rail">
      <p className="eyebrow">
        <CircleHelp size={12} /> Need a hand?
      </p>
      <h2>Keep the details clear.</h2>
      <p>
        Compare the full quote, arrival time and warranty before choosing a
        provider.
      </p>
      <p>
        Your accepted quote is the agreed customer amount. Provider commission
        is deducted from that amount.
      </p>
      {query.data?.[0] && (
        <a href={'mailto:' + query.data[0].support_email}>
          {query.data[0].support_email}
        </a>
      )}
      <p className="small">
        Earnings are quoted allocations. Online payment and payout processing
        are not connected.
      </p>
      <Square size={12} />
    </aside>
  );
}

export function tabKeys(event) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = [...event.currentTarget.querySelectorAll('[role="tab"]')];
  const current = tabs.indexOf(event.target.closest('[role="tab"]'));
  if (current < 0 || !tabs.length) return;
  const index =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) %
          tabs.length;
  event.preventDefault();
  tabs[index].focus();
  tabs[index].click();
}
