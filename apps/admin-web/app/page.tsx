import { Marketplace } from '@convyn/ui';
export default function Home() {
  return (
    <>
      <header>
        <strong>CONVYN · Admin</strong>
        <span>Gqeberha, South Africa</span>
      </header>
      <main>
        <h1>Admin workspace</h1>
        <Marketplace portal="admin" />
      </main>
      <footer>
        <small>CONVYN text placeholder · approved brand assets pending.</small>
      </footer>
    </>
  );
}
