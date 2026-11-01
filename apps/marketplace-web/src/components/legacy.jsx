import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { api, dateTime, label, money } from '../lib';
import { Empty, Feedback, QueryState, Status, useAction } from './shared';
import { ConfirmDialog } from './ui/dialog';
const next = {
  CONFIRMED: 'EN_ROUTE',
  EN_ROUTE: 'ARRIVED',
  ARRIVED: 'IN_PROGRESS',
  IN_PROGRESS: 'AWAITING_CONFIRMATION',
};
const statuses = {
  CONFIRMED: 'confirmed',
  EN_ROUTE: 'en_route',
  ARRIVED: 'arrived',
  IN_PROGRESS: 'in_progress',
  AWAITING_CONFIRMATION: 'completed',
  COMPLETED: 'closed',
  CANCELLED: 'cancelled',
};
export function useLegacy() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['existing-records', user.id],
    queryFn: () => api('marketplace/legacy'),
    refetchInterval: 15000,
  });
}
export function ExistingRecords({ compact = false, bookingsOnly = false }) {
  const query = useLegacy();
  if (query.isPending) return null;
  return (
    <QueryState query={query}>
      {(data) =>
        data.requests.length || data.bookings.length ? (
          <section id="existing-records" className="panel">
            <p className="eyebrow">Your existing account records</p>
            <h2>Previous requests & bookings</h2>
            <p className="small">
              Your earlier records remain available. Existing quotes and
              bookings keep their original agreed terms.
            </p>
            {compact ? (
              <>
                <p>
                  {data.requests.length} previous requests ·{' '}
                  {data.bookings.length} previous bookings
                </p>
                <Link to="/bookings#existing-records">
                  Open existing records
                </Link>
              </>
            ) : (
              <>
                <div>
                  {data.bookings.map((job) => (
                    <ExistingBooking key={job.id} job={job} />
                  ))}
                </div>
                {!bookingsOnly &&
                  data.requests
                    .filter((r) => !r.booking)
                    .map((r) => <ExistingRequest key={r.id} request={r} />)}
              </>
            )}
          </section>
        ) : null
      }
    </QueryState>
  );
}
function ExistingRequest({ request }) {
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState(null);
  const { user } = useAuth(),
    quotes = useQuery({
      queryKey: ['existing-quotes', request.id, user.id],
      queryFn: () =>
        api('marketplace/legacy/requests/' + request.id + '/quotes'),
      enabled: open,
    });
  const accept = useAction(async (bid) => {
    await api('bids/' + bid.id + '/accept', { body: {} });
    setSelected(null);
  });
  return (
    <article>
      <p className="eyebrow">Previous request / {request.category.name}</p>
      <h3>{request.description}</h3>
      <Status
        value={
          request.cancelledAt
            ? 'cancelled'
            : request.publishedAt
              ? 'open'
              : 'draft'
        }
      />
      <p className="small">{dateTime(request.createdAt)}</p>
      {request.publishedAt && !request.cancelledAt && (
        <button className="button-secondary" onClick={() => setOpen(!open)}>
          {open ? 'Hide quotes' : 'View existing quotes'}
        </button>
      )}
      {open && (
        <QueryState query={quotes}>
          {(items) =>
            items.length ? (
              items.map((b) => (
                <article key={b.id}>
                  <strong>
                    {b.provider.user.firstName} {b.provider.user.lastName}
                  </strong>
                  <p className="quote-price">{money(b.totalMinor)}</p>
                  <p>{b.comment}</p>
                  <p>Arrival: {b.arrivalMinutes} minutes</p>
                  {request.customerId === user.id &&
                    user.role === 'CUSTOMER' && (
                      <button onClick={() => setSelected(b)}>
                        Accept existing quote
                      </button>
                    )}
                </article>
              ))
            ) : (
              <Empty title="No valid quotes here yet">
                Quotes remain subject to their original expiry and provider
                availability.
              </Empty>
            )
          }
        </QueryState>
      )}
      <Feedback error={accept.error} />
      <ConfirmDialog
        open={!!selected}
        onOpenChange={(value) => {
          if (!value) setSelected(null);
        }}
        title="Accept this existing quote?"
        description={
          selected
            ? `${money(selected.totalMinor)} is the agreed amount. A booking will be created under the quote’s original terms.`
            : ''
        }
        action={() => accept.mutate(selected)}
        busy={accept.isPending}
      />
    </article>
  );
}
function ExistingBooking({ job }) {
  const { user } = useAuth(),
    [note, setNote] = useState(''),
    [conversation, setConversation] = useState(false),
    customer = job.request.customerId === user.id,
    provider = job.bid.provider.userId === user.id;
  const progress = useAction((status) =>
    api('bookings/' + job.id + '/status', {
      body: {
        status,
        ...(status === 'AWAITING_CONFIRMATION' ? { completionNote: note } : {}),
      },
    }),
  );
  const review = useAction((data) =>
    api('bookings/' + job.id + '/reviews', {
      body: { rating: Number(data.rating), comment: data.comment },
    }),
  );
  const invoice = useAction(async () => {
    const record = await api('bookings/' + job.id + '/invoice', { body: {} }),
      response = await api('invoices/' + record.id + '/pdf', { raw: true });
    const blob = URL.createObjectURL(await response.blob()),
      a = document.createElement('a');
    a.href = blob;
    a.download = record.number + '.pdf';
    a.click();
    setTimeout(() => URL.revokeObjectURL(blob), 1000);
  });
  return (
    <article>
      <p className="eyebrow">Previous booking / {job.request.category.name}</p>
      <div className="record-line">
        <h3>{job.request.description}</h3>
        <Status value={statuses[job.status]} />
      </div>
      <p>Agreed amount: {money(job.bid.totalMinor)}</p>
      <p>
        {job.bid.provider.user.firstName} {job.bid.provider.user.lastName}
      </p>
      <Feedback error={progress.error || review.error || invoice.error} />
      {provider && next[job.status] && (
        <>
          {job.status === 'IN_PROGRESS' && (
            <label>
              Completion details
              <textarea
                minLength={10}
                maxLength={2000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
          )}
          <button
            disabled={
              progress.isPending ||
              (job.status === 'IN_PROGRESS' && note.trim().length < 10)
            }
            onClick={() => progress.mutate(next[job.status])}
          >
            Mark {label(statuses[next[job.status]])}
          </button>
        </>
      )}
      {customer && job.status === 'AWAITING_CONFIRMATION' && (
        <button
          disabled={progress.isPending}
          onClick={() => progress.mutate('COMPLETED')}
        >
          Confirm existing completion
        </button>
      )}
      {customer &&
        user.role === 'CUSTOMER' &&
        job.status === 'COMPLETED' &&
        !job.review && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              review.mutate(Object.fromEntries(new FormData(e.currentTarget)));
            }}
          >
            <label>
              Existing booking rating
              <select name="rating" defaultValue="5">
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label>
              Existing booking review
              <textarea
                name="comment"
                minLength={5}
                maxLength={2000}
                required
              />
            </label>
            <button disabled={review.isPending}>Review existing booking</button>
          </form>
        )}
      {job.review && <p>Review recorded: {job.review.rating} / 5.</p>}
      <div className="actions">
        {(customer || provider) && (
          <button
            className="button-secondary"
            onClick={() => setConversation(!conversation)}
          >
            {conversation ? 'Hide conversation' : 'Open existing conversation'}
          </button>
        )}
        {(customer || provider) && job.status === 'COMPLETED' && (
          <button
            className="button-secondary"
            disabled={invoice.isPending}
            onClick={() => invoice.mutate()}
          >
            Download existing invoice
          </button>
        )}
      </div>
      {conversation && (
        <ExistingConversation
          bookingId={job.id}
          readonly={job.status === 'CANCELLED'}
        />
      )}
    </article>
  );
}
function ExistingConversation({ bookingId, readonly }) {
  const { user } = useAuth(),
    [text, setText] = useState(''),
    query = useQuery({
      queryKey: ['existing-conversation', bookingId, user.id],
      queryFn: () => api('bookings/' + bookingId + '/messages'),
      refetchInterval: 10000,
    });
  const send = useAction(async () => {
    await api('bookings/' + bookingId + '/messages', {
      body: { text, clientId: crypto.randomUUID() },
    });
    setText('');
  });
  return (
    <section>
      <h3>Booking conversation</h3>
      <QueryState query={query}>
        {(items) =>
          items.length ? (
            <ul className="record-register">
              {items.map((message) => (
                <li key={message.id}>
                  <strong>
                    {message.senderId === user.id ? 'You' : 'Booking member'}
                  </strong>
                  <p>{message.text}</p>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="Keep the details together">
              Messages shared with your booking counterpart will appear here.
            </Empty>
          )
        }
      </QueryState>
      {!readonly && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send.mutate();
          }}
        >
          <label>
            Your message
            <textarea
              required
              maxLength={4000}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <button disabled={send.isPending}>Send message</button>
        </form>
      )}
      <Feedback error={send.error} />
    </section>
  );
}
