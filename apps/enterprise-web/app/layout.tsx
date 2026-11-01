import './globals.css';
export const metadata = {
  title: 'CONVYN',
  description: 'On-demand services in South Africa',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA">
      <body>{children}</body>
    </html>
  );
}
