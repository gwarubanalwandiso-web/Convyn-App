import { Marketplace } from '@convyn/ui';
export default function Home() {
  return (
    <>
      <header>
        <strong>CONVYN · Enterprise</strong>
        <span>South Africa</span>
      </header>
      <main>
        <h1>Enterprise workspace</h1>
        <Marketplace portal="enterprise" />
      </main>
    </>
  );
}
