import { BrandLogo } from './brand';
export function NotFoundPage() {
  return (
    <>
      <header className="brand-header">
        <BrandLogo />
        <span className="header-workspace">YOUR WORLD. ON DEMAND.</span>
      </header>
      <main className="not-found">
        <p className="eyebrow">404 / Page not found</p>
        <h1>Let’s get you back on track.</h1>
        <p>This address does not match a page in your CONVYN workspace.</p>
        <a href="/" className="return-link">
          Return to your workspace
        </a>
      </main>
    </>
  );
}
