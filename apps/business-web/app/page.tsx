import { Marketplace } from '@convyn/ui';
export default function Home() {
  return (
    <>
      <header>
        <strong>CONVYN · Business</strong>
        <span>South Africa</span>
      </header>
      <main>
        <h1>Business workspace</h1>
        <Marketplace portal="business" />
      </main>
    </>
  );
}
