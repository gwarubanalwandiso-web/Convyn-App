import type { ReactNode } from 'react';
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="empty-state" aria-label={title}>
      <h3>{title}</h3>
      <p>{children}</p>
    </section>
  );
}
