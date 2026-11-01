'use client';
import { useState, type ReactNode } from 'react';
import { BrandLogo, BrandMark } from './brand';

export type Portal =
  | 'customer'
  | 'provider'
  | 'admin'
  | 'business'
  | 'enterprise';
export const portalCopy: Record<
  Portal,
  { label: string; title: string; description: string; headline: string }
> = {
  customer: {
    label: 'Customer',
    title: 'Your next move, handled.',
    description:
      'Request expert help. Compare offers. Keep every detail in one place.',
    headline: 'YOUR WORLD.\nON DEMAND.',
  },
  provider: {
    label: 'Provider',
    title: 'Good work starts here.',
    description:
      'Manage your availability, find opportunities and take the next job forward.',
    headline: 'YOUR SKILLS.\nIN DEMAND.',
  },
  admin: {
    label: 'Administration',
    title: 'A clear view of operations.',
    description:
      'Review providers, resolve requests and keep the marketplace moving.',
    headline: 'EVERY DETAIL.\nIN VIEW.',
  },
  business: {
    label: 'Business',
    title: 'Keep business moving.',
    description:
      'Bring your team, procurement and service operations into one workspace.',
    headline: 'YOUR BUSINESS.\nCONNECTED.',
  },
  enterprise: {
    label: 'Enterprise',
    title: 'Control at every level.',
    description:
      'Coordinate procurement, budgets, approvals and service commitments.',
    headline: 'COMPLEXITY.\nUNDER CONTROL.',
  },
};

export function StatusLabel({ children }: { children: ReactNode }) {
  return <span className="status-label">{children}</span>;
}
export function MetricsStrip({
  items,
}: {
  items: { label: string; value: string | number; detail?: string }[];
}) {
  return (
    <dl className="metrics-strip">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
          {item.detail && <p>{item.detail}</p>}
        </div>
      ))}
    </dl>
  );
}
export function PageIntroduction({
  portal,
  children,
}: {
  portal: Portal;
  children?: ReactNode;
}) {
  const copy = portalCopy[portal];
  return (
    <div className="page-introduction" id="overview">
      <div>
        <p className="eyebrow">CONVYN / {copy.label} workspace</p>
        <h1>{copy.title}</h1>
        <p className="page-description">{copy.description}</p>
      </div>
      {children}
    </div>
  );
}
export function AuthShell({
  portal,
  children,
}: {
  portal: Portal;
  children: ReactNode;
}) {
  const copy = portalCopy[portal];
  return (
    <div className="auth-shell">
      <a className="skip-link" href="#account-access">
        Skip to account access
      </a>
      <header className="brand-header">
        <BrandLogo />
        <span className="header-workspace">{copy.label} portal</span>
        <a className="header-action" href="#sign-in">
          Sign in
        </a>
      </header>
      <main className="auth-layout" id="account-access" tabIndex={-1}>
        <aside className="auth-editorial" aria-label="About your workspace">
          <p className="eyebrow">South Africa / On-demand services</p>
          <h1>{copy.headline}</h1>
          <p>{copy.description}</p>
          <div className="auth-context">
            <BrandMark inverse />
            <p className="eyebrow">YOUR WORLD. ON DEMAND.</p>
            <p>One workspace. A clear next step.</p>
          </div>
        </aside>
        <div className="auth-forms">
          {children}
          <p className="auth-security">
            Your account is protected by your password. Use a unique password
            and sign out on shared devices.
          </p>
        </div>
      </main>
      <footer className="brand-footer">
        <span>CONVYN</span>
        <span>YOUR WORLD. ON DEMAND.</span>
        <span>South Africa</span>
      </footer>
    </div>
  );
}
export function WorkspaceShell({
  portal,
  user,
  actions,
  children,
}: {
  portal: Portal;
  user: { firstName: string; role: string };
  actions: ReactNode;
  children: ReactNode;
}) {
  const [active, setActive] = useState('overview');
  const organisation = portal === 'business' || portal === 'enterprise';
  const links = [
    { id: 'overview', label: 'Overview' },
    ...(portal === 'customer'
      ? [
          { id: 'requests', label: 'Service requests' },
          { id: 'drafts', label: 'Saved drafts' },
        ]
      : []),
    ...(portal === 'provider'
      ? [
          { id: 'verification', label: 'Profile & availability' },
          { id: 'requests', label: 'Opportunities' },
        ]
      : []),
    ...(portal === 'admin'
      ? [
          { id: 'verification', label: 'Provider approvals' },
          { id: 'operations', label: 'Operations' },
        ]
      : []),
    ...(!organisation && portal !== 'admin'
      ? [{ id: 'bookings', label: 'Bookings & invoices' }]
      : []),
    ...(organisation
      ? [
          { id: 'organisation', label: 'Organisation' },
          { id: 'team', label: 'Team & locations' },
          { id: 'procurement', label: 'Procurement' },
          { id: 'contracts', label: 'Contracts & SLAs' },
          { id: 'budgets', label: 'Cost centres' },
          { id: 'reports', label: 'Reports' },
        ]
      : []),
    { id: 'support', label: 'Help & support' },
    { id: 'notifications', label: 'Notifications' },
  ];
  return (
    <div className="workspace-shell">
      <a className="skip-link" href="#workspace-content">
        Skip to workspace
      </a>
      <header className="brand-header">
        <BrandLogo />
        <span className="header-workspace">
          {portalCopy[portal].label} workspace
        </span>
        <div className="account-context">
          <span>
            {user.firstName}
            <small>{user.role.toLowerCase()}</small>
          </span>
          {actions}
        </div>
      </header>
      <div className="workspace-layout">
        <aside className="workspace-sidebar">
          <p className="eyebrow">Workspace / {portalCopy[portal].label}</p>
          <nav aria-label="Workspace navigation">
            {links.map((link) => (
              <a
                key={link.id}
                href={`#${link.id}`}
                onClick={() => setActive(link.id)}
                aria-current={active === link.id ? 'location' : undefined}
              >
                <span className="nav-marker" aria-hidden="true" />
                {link.label}
              </a>
            ))}
          </nav>
          <div className="sidebar-context">
            <BrandMark />
            <p className="eyebrow">Account context</p>
            <p>Signed in as {user.firstName}</p>
            <StatusLabel>{user.role}</StatusLabel>
            <p className="sidebar-tagline">
              YOUR WORLD.
              <br />
              ON DEMAND.
            </p>
          </div>
        </aside>
        <main id="workspace-content" className="workspace-main" tabIndex={-1}>
          {children}
        </main>
      </div>
      <footer className="brand-footer">
        <span>CONVYN</span>
        <span>YOUR WORLD. ON DEMAND.</span>
        <span>South Africa</span>
      </footer>
    </div>
  );
}
