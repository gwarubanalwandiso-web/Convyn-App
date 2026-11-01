import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!process.argv[2])
  throw new Error(
    'Usage: node scripts/install-brand-assets.mjs /path/to/original-pngs',
  );
const source = resolve(process.argv[2]);
const names = [
  'convyn-wordmark-solid.png',
  'convyn-wordmark-outline.png',
  'convyn-mark-black.png',
  'convyn-mark-white.png',
];
// Validate every original before copying. Never alter image pixels or proportions.
for (const name of names) {
  const bytes = await readFile(resolve(source, name));
  if (
    !bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    bytes.length < 24 ||
    !bytes.readUInt32BE(16) ||
    !bytes.readUInt32BE(20)
  )
    throw new Error(`Not a valid PNG header: ${name}`);
}
for (const role of [
  'customer',
  'provider',
  'admin',
  'business',
  'enterprise',
]) {
  const app = resolve(root, `apps/${role}-web`);
  await mkdir(resolve(app, 'public/brand'), { recursive: true });
  for (const name of names)
    await copyFile(resolve(source, name), resolve(app, 'public/brand', name));
  await copyFile(
    resolve(source, 'convyn-mark-black.png'),
    resolve(app, 'app/icon.png'),
  );
  await copyFile(
    resolve(source, 'convyn-mark-black.png'),
    resolve(app, 'app/apple-icon.png'),
  );
}
await mkdir(resolve(root, 'packages/mobile-ui/assets/brand'), {
  recursive: true,
});
for (const name of names)
  await copyFile(
    resolve(source, name),
    resolve(root, 'packages/mobile-ui/assets/brand', name),
  );
for (const role of ['customer', 'provider']) {
  const app = resolve(root, `apps/${role}-mobile`);
  await mkdir(resolve(app, 'assets'), { recursive: true });
  await copyFile(
    resolve(source, 'convyn-mark-black.png'),
    resolve(app, 'assets/convyn-mark-black.png'),
  );
  const config = JSON.parse(await readFile(resolve(app, 'app.json'), 'utf8'));
  config.expo.icon = './assets/convyn-mark-black.png';
  await writeFile(
    resolve(app, 'app.json'),
    JSON.stringify(config, null, 2) + '\n',
  );
}
await writeFile(
  resolve(root, 'packages/ui/src/brand-assets.ts'),
  'export const brandAssets = { solid: true, outline: true, black: true, white: true } as const;\n',
);
await writeFile(
  resolve(root, 'packages/mobile-ui/src/brand-assets.ts'),
  `/* eslint-disable @typescript-eslint/no-require-imports */\nimport type { ImageSourcePropType } from 'react-native';\nexport const nativeBrandAssets: Record<'solid' | 'outline' | 'black' | 'white', ImageSourcePropType | null> = {\n${['solid', 'outline', 'black', 'white'].map((key, i) => `  ${key}: require('../assets/brand/${names[i]}'),`).join('\n')}\n};\n`,
);
console.log(
  'Original PNGs installed unchanged in all five web portals and both native apps. Rebuild before deployment.',
);
