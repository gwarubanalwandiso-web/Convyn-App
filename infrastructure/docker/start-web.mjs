import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const app = process.env.WEB_APP;
if (
  ![
    'customer-web',
    'provider-web',
    'admin-web',
    'business-web',
    'enterprise-web',
  ].includes(app)
)
  throw new Error('Invalid web application');
await import(pathToFileURL(resolve('apps', app, 'server.js')).href);
