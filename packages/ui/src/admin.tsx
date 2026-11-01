'use client';
import { useEffect, useState } from 'react';
import type { ApiCall } from './operations';
type Ticket = {
  id: string;
  subject: string;
  description: string;
  status: string;
};
type Dispute = {
  id: string;
  reason: string;
  status: string;
  resolution: string | null;
};
export function AdminOperations({ call }: { call: ApiCall }) {
  const [dashboard, setDashboard] = useState<{
      users: number;
      providers: number;
      requests: number;
      openDisputes: number;
      openSupportTickets: number;
    } | null>(null),
    [tickets, setTickets] = useState<Ticket[]>([]),
    [disputes, setDisputes] = useState<Dispute[]>([]),
    [error, setError] = useState('');
  async function refresh() {
    setDashboard(await call('admin/dashboard'));
    setTickets(await call('admin/support'));
    setDisputes(await call('admin/disputes'));
  }
  useEffect(() => {
    void Promise.all([
      call<typeof dashboard>('admin/dashboard').then(setDashboard),
      call<Ticket[]>('admin/support').then(setTickets),
      call<Dispute[]>('admin/disputes').then(setDisputes),
    ]).catch((e) => setError(e.message));
  }, [call]);
  async function act(work: () => Promise<void>) {
    try {
      setError('');
      await work();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operation failed');
    }
  }
  return (
    <div>
      <h2>Operations dashboard</h2>
      <ScoringControls call={call} />
      {dashboard && (
        <dl>
          <dt>Customers and providers</dt>
          <dd>{dashboard.users}</dd>
          <dt>Provider profiles</dt>
          <dd>{dashboard.providers}</dd>
          <dt>Service requests</dt>
          <dd>{dashboard.requests}</dd>
          <dt>Open disputes</dt>
          <dd>{dashboard.openDisputes}</dd>
          <dt>Open support tickets</dt>
          <dd>{dashboard.openSupportTickets}</dd>
        </dl>
      )}
      <button onClick={() => void act(refresh)}>Refresh operations</button>
      <h3>Support queue</h3>
      <section>
        {tickets.map((ticket) => (
          <article key={ticket.id}>
            <h4>{ticket.subject}</h4>
            <p>{ticket.description}</p>
            <p>{ticket.status}</p>
            {ticket.status !== 'CLOSED' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = Object.fromEntries(
                    new FormData(e.currentTarget),
                  );
                  void act(async () => {
                    await call('admin/support/' + ticket.id, data);
                  });
                }}
              >
                <label>
                  Support response
                  <textarea name="response" minLength={10} required />
                </label>
                <label>
                  Ticket status
                  <select name="status">
                    <option>IN_PROGRESS</option>
                    <option>RESOLVED</option>
                    <option>CLOSED</option>
                  </select>
                </label>
                <button>Update support ticket</button>
              </form>
            )}
          </article>
        ))}
      </section>
      <h3>Dispute queue</h3>
      <section>
        {disputes.map((dispute) => (
          <article key={dispute.id}>
            <h4>{dispute.status}</h4>
            <p>{dispute.reason}</p>
            <p>{dispute.resolution}</p>
            {['OPEN', 'IN_PROGRESS'].includes(dispute.status) && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const resolution = String(
                    new FormData(e.currentTarget).get('resolution'),
                  );
                  void act(async () => {
                    await call('admin/disputes/' + dispute.id, { resolution });
                  });
                }}
              >
                <label>
                  Dispute resolution
                  <textarea name="resolution" minLength={20} required />
                </label>
                <button>Resolve dispute</button>
              </form>
            )}
          </article>
        ))}
      </section>
      <p>No payment or refund is executed by a support or dispute decision.</p>
      <p role="alert">{error}</p>
    </div>
  );
}
export function ScoringControls({ call }: { call: ApiCall }) {
  const [weights, setWeights] = useState<Record<string, number> | null>(null),
    [version, setVersion] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    void call<{ weights: Record<string, number>; version: string }>(
      'admin/scoring',
    )
      .then((data) => {
        setWeights(data.weights);
        setVersion(data.version);
      })
      .catch((e) => setError(e.message));
  }, [call]);
  return (
    <article>
      <h3>Provider suitability weights</h3>
      <p>
        Active version: {version}. Weights must sum to 100. Missing evidence is
        disclosed and scores never authorise a booking.
      </p>
      {weights && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.currentTarget));
            const next = Object.fromEntries(
              Object.entries(data).map(([name, value]) => [
                name,
                Number(value),
              ]),
            );
            void call<{ version: string; weights: Record<string, number> }>(
              'admin/scoring',
              { weights: next },
            )
              .then((data) => {
                setVersion(data.version);
                setWeights(data.weights);
                setError('');
              })
              .catch((e) => setError(e.message));
          }}
        >
          {Object.entries(weights).map(([name, value]) => (
            <label key={name}>
              {name}
              <input
                name={name}
                type="number"
                step="any"
                min={0}
                max={100}
                defaultValue={value}
                required
              />
            </label>
          ))}
          <button>Save scoring version</button>
        </form>
      )}
      <p role="alert">{error}</p>
    </article>
  );
}
