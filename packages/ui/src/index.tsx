import type { ButtonHTMLAttributes, ReactNode } from 'react';
export function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} />;
}
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title}>
      <h2>{title}</h2>
      <p>{children}</p>
    </section>
  );
}
export function Status({ children }: { children: ReactNode }) {
  return <p role="status">{children}</p>;
}

export { Marketplace } from './marketplace';
