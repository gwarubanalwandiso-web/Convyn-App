import { Marketplace } from '@convyn/ui';
export default function Home() {
  return (
    <>
      <header>
        <strong>CONVYN · Provider</strong>
        <span>Gqeberha, South Africa</span>
      </header>
      <main>
        <h1>Provider workspace</h1>
        <Marketplace portal="provider" />
      </main>
      <footer>
        <small>CONVYN text placeholder · approved brand assets pending.</small>
      </footer>
    </>
  );
}
