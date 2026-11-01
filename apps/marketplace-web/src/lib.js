export function money(value = 0) {
  const n = BigInt(value),
    negative = n < 0n,
    abs = negative ? -n : n,
    whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '),
    fraction = abs % 100n;
  return `${negative ? '-' : ''}R ${whole}${fraction ? '.' + fraction.toString().padStart(2, '0') : ''}`;
}
export function toCents(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw))
    throw new Error(
      'Enter a valid rand amount with at most two decimal places',
    );
  const [r, c = ''] = raw.split('.'),
    n = BigInt(r) * 100n + BigInt(c.padEnd(2, '0'));
  if (n > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error('Amount is too large');
  return Number(n);
}
export const date = (value) =>
  value
    ? new Intl.DateTimeFormat('en-ZA', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'Africa/Johannesburg',
      }).format(new Date(value))
    : 'Not scheduled';
export function age(value) {
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 1000),
  );
  if (seconds < 60) return 'Just now';
  const [count, unit] =
    seconds < 3600
      ? [Math.floor(seconds / 60), 'minute']
      : seconds < 86400
        ? [Math.floor(seconds / 3600), 'hour']
        : [Math.floor(seconds / 86400), 'day'];
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`;
}
export const label = (value) => String(value ?? '').replaceAll('_', ' ');
export const cities = [
  'Gqeberha',
  'East London',
  'Cape Town',
  'Durban',
  'Johannesburg',
  'Pretoria',
];
export const nextStatus = {
  confirmed: 'en_route',
  en_route: 'arrived',
  arrived: 'in_progress',
  in_progress: 'completed',
};
let accessToken = '';
export const setAccessToken = (value) => {
  accessToken = value || '';
};
let refreshing;
async function refresh() {
  if (!refreshing)
    refreshing = fetch('/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Convyn-Client': '1' },
      body: '{}',
    })
      .then(async (r) => {
        if (!r.ok)
          throw new Error('Your session has ended. Please sign in again.');
        const result = await r.json();
        setAccessToken(result.accessToken);
        return result;
      })
      .finally(() => {
        refreshing = null;
      });
  return refreshing;
}
export async function api(
  path,
  { body, method, raw = false, retry = true, headers = {} } = {},
) {
  const form = body instanceof FormData;
  const response = await fetch('/v1/' + path, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    credentials: 'include',
    headers: {
      'X-Convyn-Client': '1',
      ...headers,
      ...(!form ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: 'Bearer ' + accessToken } : {}),
    },
    ...(body !== undefined ? { body: form ? body : JSON.stringify(body) } : {}),
  });
  if (response.status === 401 && retry && !path.startsWith('auth/')) {
    try {
      await refresh();
      return api(path, { body, method, raw, retry: false, headers });
    } catch (error) {
      window.dispatchEvent(new Event('convyn-session-ended'));
      throw error;
    }
  }
  if (!response.ok) {
    const value = await response.json().catch(() => ({}));
    throw new Error(
      value.error ??
        (typeof value.message === 'string'
          ? value.message
          : 'The request could not be completed'),
    );
  }
  return raw ? response : response.json();
}
export const restoreSession = refresh;
export const list = (entity, filters = {}) =>
  api('marketplace/entities/' + entity + '?' + new URLSearchParams(filters));
export const record = (entity, id) =>
  api('marketplace/entities/' + entity + '/' + id);
export const save = (entity, data, id) =>
  api('marketplace/entities/' + entity + (id ? '/' + id : ''), {
    method: id ? 'PATCH' : 'POST',
    body: data,
  });
export const remove = (entity, id) =>
  api('marketplace/entities/' + entity + '/' + id, { method: 'DELETE' });
export const fn = (name, body, options = {}) =>
  api('marketplace/functions/' + name, { body, ...options });
export async function upload(bucket, files) {
  if (files.length > 4) throw new Error('Choose at most four files');
  const form = new FormData();
  for (const file of files) {
    if (file.size > 10 * 1024 * 1024)
      throw new Error('Each file must be 10 MB or smaller');
    form.append('files', file);
  }
  return api('marketplace/files/' + bucket, { body: form });
}
export async function download(uri) {
  const id = uri.replace('private://', '');
  const response = await api('marketplace/files/' + id, { raw: true });
  const blob = await response.blob(),
    url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'convyn-attachment-' + id;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function amountInput(value = 0) {
  const n = BigInt(value);
  return `${n / 100n}.${(n % 100n).toString().padStart(2, '0')}`;
}
export function localDateTime(value) {
  return new Date(new Date(value).getTime() + 2 * 3600000)
    .toISOString()
    .slice(0, 16);
}
export function southAfricanISO(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error('Choose a valid date and time');
  return new Date(value + ':00+02:00').toISOString();
}
export const dateTime = (value) =>
  new Date(value).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' });
