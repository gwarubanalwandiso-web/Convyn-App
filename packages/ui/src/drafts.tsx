'use client';
import { useState } from 'react';
import type { ApiCall } from './operations';
export type DraftRequest = {
  id: string;
  description: string;
  categoryId: string;
  latitude: number;
  longitude: number;
  urgency: string;
  instructions: string;
  scheduledAt: string | null;
};
export function DraftEditor({
  request,
  categories,
  call,
  onChange,
}: {
  request: DraftRequest;
  categories: { id: string; name: string }[];
  call: ApiCall;
  onChange: () => Promise<void>;
}) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function act(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await work();
      await onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Draft operation failed');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <h3>{request.description || 'Untitled request'}</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const data = Object.fromEntries(new FormData(e.currentTarget));
          void act(async () => {
            await call(
              'service-requests/' + request.id,
              {
                ...data,
                latitude: Number(data.latitude),
                longitude: Number(data.longitude),
                urgency: request.urgency,
                scheduledAt: data.scheduledAt || null,
              },
              undefined,
              'PATCH',
            );
          });
        }}
      >
        <label>
          Draft category
          <select
            aria-label="Draft category"
            name="categoryId"
            defaultValue={request.categoryId}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Draft description
          <textarea
            name="description"
            defaultValue={request.description}
            maxLength={5000}
          />
        </label>
        <label>
          Draft instructions
          <textarea
            name="instructions"
            defaultValue={request.instructions}
            maxLength={2000}
          />
        </label>
        <label>
          Draft latitude
          <input
            type="number"
            name="latitude"
            step="any"
            defaultValue={request.latitude}
            required
          />
        </label>
        <label>
          Draft longitude
          <input
            type="number"
            name="longitude"
            step="any"
            defaultValue={request.longitude}
            required
          />
        </label>
        <label>
          Scheduled time (UTC ISO 8601, optional)
          <input name="scheduledAt" defaultValue={request.scheduledAt ?? ''} />
        </label>
        <button disabled={busy}>Save draft changes</button>
      </form>
      <button
        disabled={busy}
        onClick={() =>
          void act(async () => {
            await call('service-requests/' + request.id + '/publish', {});
          })
        }
      >
        Publish saved draft
      </button>
      <p role="alert">{error}</p>
    </div>
  );
}
