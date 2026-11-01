import { brandAssets } from './brand-assets';

export function BrandLogo({
  variant = 'solid',
}: {
  variant?: 'solid' | 'outline';
}) {
  return brandAssets[variant] ? (
    // Native img preserves the approved asset's intrinsic aspect ratio.
    <img
      className="brand-logo"
      src={`/brand/convyn-wordmark-${variant}.png`}
      alt="CONVYN"
    />
  ) : (
    <span className="brand-wordmark" aria-label="CONVYN">
      CONVYN
    </span>
  );
}

export function BrandMark({ inverse = false }: { inverse?: boolean }) {
  const variant = inverse ? 'white' : 'black';
  return brandAssets[variant] ? (
    <img
      className="brand-mark"
      src={`/brand/convyn-mark-${variant}.png`}
      alt="CONVYN"
    />
  ) : (
    <span className="brand-mark-text">CONVYN</span>
  );
}
