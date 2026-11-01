'use client';
import { StatusLabel } from './shell';
import { useState, type FormEvent } from 'react';
export type ApiCall = <T>(
  path: string,
  body?: unknown,
  access?: string,
  method?: string,
) => Promise<T>;
type Message = {
  id: string;
  senderId: string;
  text: string;
  createdAt: string;
  readAt: string | null;
};
export function BookingTools({
  bookingId,
  status,
  role,
  userId,
  token,
  call,
  onChange,
}: {
  bookingId: string;
  status: string;
  role: string;
  userId: string;
  token: string;
  call: ApiCall;
  onChange: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [messages, setMessages] = useState<Message[]>([]),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [location, setLocation] = useState<{
      latitude: number;
      longitude: number;
      observedAt: string;
      accuracyMetres: number;
    } | null>(null);
  async function act(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operation failed');
    } finally {
      setBusy(false);
    }
  }
  async function refreshMessages() {
    setMessages(await call<Message[]>('bookings/' + bookingId + '/messages'));
    await call('bookings/' + bookingId + '/messages/read', {});
  }
  async function invoice() {
    const record = await call<{ id: string }>(
      'bookings/' + bookingId + '/invoice',
      {},
    );
    const response = await fetch(
      (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000') +
        '/v1/invoices/' +
        record.id +
        '/pdf',
      { headers: { Authorization: 'Bearer ' + token } },
    );
    if (!response.ok) throw new Error('Invoice download unavailable');
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = 'convyn-invoice.pdf';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div>
      <button
        disabled={busy}
        onClick={() =>
          void act(async () => {
            setOpen(!open);
            if (!open) await refreshMessages();
          })
        }
      >
        {open ? 'Close booking tools' : 'Messages, tracking and support'}
      </button>
      {open && (
        <div>
          <h4>Booking conversation</h4>
          <button disabled={busy} onClick={() => void act(refreshMessages)}>
            Refresh messages
          </button>
          <ol>
            {messages.map((message) => (
              <li key={message.id}>
                <strong>
                  {message.senderId === userId ? 'You' : 'Other participant'}
                </strong>
                : {message.text}
                <small>
                  {' '}
                  · {new Date(message.createdAt).toLocaleString('en-ZA')}{' '}
                  {message.readAt ? '· Read' : ''}
                </small>
              </li>
            ))}
          </ol>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const text = String(new FormData(form).get('message'));
              void act(async () => {
                await call('bookings/' + bookingId + '/messages', {
                  text,
                  clientId: crypto.randomUUID(),
                });
                form.reset();
                await refreshMessages();
              });
            }}
          >
            <label>
              Message
              <textarea name="message" required maxLength={4000} />
            </label>
            <button disabled={busy || status === 'CANCELLED'}>
              Send message
            </button>
          </form>
          {['CONFIRMED', 'EN_ROUTE', 'ARRIVED'].includes(status) && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const reason = String(
                  new FormData(e.currentTarget).get('reason'),
                );
                void act(async () => {
                  await call('bookings/' + bookingId + '/cancel', { reason });
                  setNotice(
                    'Booking cancelled. No online refund has been processed.',
                  );
                  await onChange();
                });
              }}
            >
              <label>
                Cancellation reason
                <textarea name="reason" minLength={10} required />
              </label>
              <button disabled={busy}>Cancel booking</button>
            </form>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const reason = String(
                new FormData(e.currentTarget).get('reason'),
              );
              void act(async () => {
                await call('bookings/' + bookingId + '/dispute', { reason });
                setNotice('Dispute submitted for administrator review');
              });
            }}
          >
            <label>
              Describe an unresolved issue
              <textarea name="reason" minLength={20} required />
            </label>
            <button disabled={busy}>Open dispute</button>
          </form>
          {['EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'].includes(status) && (
            <>
              <h4>Authorised location sharing</h4>
              {role === 'provider' && (
                <>
                  <p>
                    Share one actual device location with your customer. Each
                    update expires after two minutes; sharing consent expires
                    after fifteen minutes.
                  </p>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        if (!navigator.geolocation)
                          throw new Error(
                            'Location is unavailable on this device',
                          );
                        const point = await new Promise<GeolocationPosition>(
                          (resolve, reject) =>
                            navigator.geolocation.getCurrentPosition(
                              resolve,
                              reject,
                              {
                                enableHighAccuracy: true,
                                timeout: 15000,
                                maximumAge: 0,
                              },
                            ),
                        );
                        await call(
                          'bookings/' + bookingId + '/tracking-consent',
                          { enabled: true, durationMinutes: 15 },
                        );
                        await call('bookings/' + bookingId + '/location', {
                          latitude: point.coords.latitude,
                          longitude: point.coords.longitude,
                          accuracyMetres: point.coords.accuracy,
                          observedAt: new Date(point.timestamp).toISOString(),
                        });
                        setNotice(
                          'Actual device location shared; repeat to update.',
                        );
                      })
                    }
                  >
                    Share current location
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        await call(
                          'bookings/' + bookingId + '/tracking-consent',
                          { enabled: false },
                        );
                        setLocation(null);
                        setNotice('Location sharing stopped');
                      })
                    }
                  >
                    Stop location sharing
                  </button>
                </>
              )}
              <button
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    const data = await call<{ location: typeof location }>(
                      'bookings/' + bookingId + '/location',
                    );
                    setLocation(data.location);
                    setNotice(
                      data.location
                        ? 'Latest authorised location loaded'
                        : 'No current authorised location is available',
                    );
                  })
                }
              >
                Refresh provider location
              </button>
              {location && (
                <p>
                  Latitude {location.latitude}, longitude {location.longitude};
                  accuracy {Math.round(location.accuracyMetres)} m. Observed{' '}
                  {new Date(location.observedAt).toLocaleTimeString('en-ZA')}.
                </p>
              )}
            </>
          )}
          {status === 'COMPLETED' && (
            <button disabled={busy} onClick={() => void act(invoice)}>
              Download unpaid service invoice
            </button>
          )}
          <p role="alert">{error}</p>
          <p role="status">{notice}</p>
        </div>
      )}
    </div>
  );
}
export function SupportDesk({ call }: { call: ApiCall }) {
  const [tickets, setTickets] = useState<
      { id: string; subject: string; status: string; response: string | null }[]
    >([]),
    [error, setError] = useState(''),
    [open, setOpen] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    try {
      await call('support', data);
      form.reset();
      setTickets(await call('support'));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    }
  }
  return (
    <article id="support">
      <h2>Help and support</h2>
      <button
        onClick={() => {
          setOpen(!open);
          if (!open)
            void call<typeof tickets>('support')
              .then(setTickets)
              .catch((e) => setError(e.message));
        }}
      >
        Support requests
      </button>
      {open && (
        <>
          <form onSubmit={(e) => void submit(e)}>
            <label>
              Subject
              <input name="subject" minLength={5} maxLength={200} required />
            </label>
            <label>
              How can we help?
              <textarea
                name="description"
                minLength={20}
                maxLength={5000}
                required
              />
            </label>
            <button>Submit support request</button>
          </form>
          <ul>
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <strong>{ticket.subject}</strong> ·{' '}
                <StatusLabel>{ticket.status}</StatusLabel>
                <p>{ticket.response}</p>
              </li>
            ))}
          </ul>
          <p role="alert">{error}</p>
        </>
      )}
    </article>
  );
}
