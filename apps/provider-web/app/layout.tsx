import localFont from 'next/font/local';
import './globals.css';
const lato = localFont({
  src: [
    {
      path: '../../../packages/design-tokens/fonts/lato-latin-400-normal.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../../packages/design-tokens/fonts/lato-latin-700-normal.woff2',
      weight: '700',
      style: 'normal',
    },
    {
      path: '../../../packages/design-tokens/fonts/lato-latin-900-normal.woff2',
      weight: '900',
      style: 'normal',
    },
  ],
  variable: '--font-lato',
  display: 'swap',
});
export const metadata = {
  title: { default: 'CONVYN · Provider', template: '%s · CONVYN' },
  description:
    'CONVYN — YOUR WORLD. ON DEMAND. On-demand service requests, provider opportunities and organisation procurement in South Africa.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA" className={lato.variable}>
      <body>{children}</body>
    </html>
  );
}
