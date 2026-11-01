import type { ButtonHTMLAttributes, ReactNode } from 'react';
export function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} />;
}
export { EmptyState } from './empty-state';
export function Status({ children }: { children: ReactNode }) {
  return (
    <p className="status-label" role="status">
      {children}
    </p>
  );
}

export { Marketplace } from './marketplace';

export { BrandLogo, BrandMark } from './brand';
export {
  AuthShell,
  WorkspaceShell,
  MetricsStrip,
  StatusLabel,
  PageIntroduction,
} from './shell';

export { RecordTable } from './record-table';

export { NotFoundPage } from './not-found';
