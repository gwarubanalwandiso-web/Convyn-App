import { Marketplace } from '@convyn/ui';
export default function Home() {
  return (
    <>
      <header>
        <strong>CONVYN · Customer</strong>
        <span>Gqeberha, South Africa</span>
      </header>
      <main>
        <h1>Expert help, when you need it.</h1>
        <Marketplace portal="customer" />
      </main>
      <footer>
        <small>CONVYN text placeholder · approved brand assets pending.</small>
      </footer>
    </>
  );
}
