import { tabKeys } from '../components/shared';
import { ExistingRecords } from '../components/legacy';
import { dateTime } from '../lib';
import { useState } from 'react';
import { useAuth } from '../auth';
import { date, fn, label, money, nextStatus, upload } from '../lib';
import {
  Empty,
  Feedback,
  FileLinks,
  Intro,
  Metrics,
  QueryState,
  Status,
  useAction,
  useRecords,
} from '../components/shared';
export function Bookings() {
  const query = useRecords('Booking'),
    [filter, setFilter] = useState('all');
  return (
    <>
      <Intro
        eyebrow="CONVYN / Booking register"
        title="From confirmed to complete."
      >
        Follow the work, record the details and confirm the result.
      </Intro>
      <div
        className="tab-row"
        role="tablist"
        onKeyDown={tabKeys}
        aria-label="Booking view"
      >
        {['active', 'completed', 'all'].map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={filter === value}
            aria-controls="booking-panel"
            onClick={() => setFilter(value)}
          >
            {label(value)}
          </button>
        ))}
      </div>
      <section id="booking-panel" role="tabpanel" aria-label={filter}>
        <QueryState query={query}>
          {(items) => {
            const visible = items.filter(
              (b) =>
                filter === 'all' ||
                (filter === 'completed'
                  ? b.status === 'closed'
                  : !['closed', 'cancelled'].includes(b.status)),
            );
            return visible.length ? (
              visible.map((job) => (
                <BookingCard
                  key={job.id}
                  job={job}
                  onClosed={() => setFilter('completed')}
                />
              ))
            ) : (
              <Empty title="No bookings in this view">
                A booking is created when a customer accepts a quote. Choose
                another view or start a service request.
              </Empty>
            );
          }}
        </QueryState>
      </section>
      <ExistingRecords />
    </>
  );
}
export function BookingCard({ job, onClosed }) {
  const { user } = useAuth(),
    [evidence, setEvidence] = useState([]),
    [notice, setNotice] = useState('');
  const provider = job.provider_user_email === user.email,
    customer = job.created_by_id === user.id;
  const progress = useAction(async (action) => {
    await fn('completeBooking', {
      booking_id: job.id,
      action,
      ...(action === 'advance' ? { status: nextStatus[job.status] } : {}),
      evidence,
    });
    setEvidence([]);
    setNotice('Booking updated.');
    if (action === 'close') onClosed?.();
  });
  const files = useAction(async (selected) => {
    const saved = await upload('evidence', selected);
    setEvidence(saved.map((f) => f.uri));
  });
  const review = useAction(async (data) => {
    await fn('createReview', {
      booking_id: job.id,
      rating: Number(data.rating),
      comment: data.comment,
      tags: data.tags
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    });
    setNotice('Your review has been saved.');
  });
  const cancel = useAction(() => fn('cancelBooking', { booking_id: job.id }));
  return (
    <article id={job.id}>
      <p className="eyebrow">
        {job.reference} / {job.request_reference}
      </p>
      <div className="record-line">
        <h2>{job.category_name}</h2>
        <Status value={job.status} />
      </div>
      <p>
        {job.provider_name} / {job.customer_name}
      </p>
      <p>
        {job.address}, {job.suburb}, {job.city}
      </p>
      <div className="meta-row">
        <span>Scheduled: {date(job.scheduled_for)}</span>
        <span>Agreed amount: {money(job.amount_cents)}</span>
        <span>Contact: {job.customer_phone}</span>
      </div>
      {provider && (
        <Metrics
          items={[
            { label: 'Gross quote', value: money(job.amount_cents) },
            {
              label: `Commission (${job.commission_pct}%)`,
              value: money(job.commission_cents),
            },
            { label: 'Provider allocation', value: money(job.payout_cents) },
          ]}
        />
      )}
      <Feedback
        error={progress.error || review.error || files.error || cancel.error}
        notice={notice}
      />
      <ol className="timeline" aria-label="Booking timeline">
        {job.timeline.map((entry, i) => (
          <li key={i}>
            <strong>{label(entry.status)}</strong>
            <span>{dateTime(entry.at)}</span>
          </li>
        ))}
      </ol>
      <FileLinks uris={job.evidence} />
      {provider && nextStatus[job.status] && (
        <>
          <label>
            Completion evidence (optional)
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
              multiple
              disabled={files.isPending}
              onChange={(e) => {
                const selected = [...e.target.files];
                if (selected.length) files.mutate(selected);
                e.target.value = '';
              }}
            />
          </label>
          <FileLinks uris={evidence} />
          <div className="actions">
            <button
              disabled={progress.isPending || files.isPending}
              onClick={() => progress.mutate('advance')}
            >
              Mark {label(nextStatus[job.status])}
            </button>
          </div>
        </>
      )}
      {customer && job.status === 'completed' && (
        <div className="actions">
          <button
            disabled={progress.isPending}
            onClick={() => progress.mutate('close')}
          >
            Confirm completion
          </button>
        </div>
      )}
      {(customer || provider) &&
        ['confirmed', 'en_route', 'arrived'].includes(job.status) && (
          <button
            className="button-secondary"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            Cancel booking
          </button>
        )}
      {customer && job.status === 'closed' && !job.review_id && (
        <form
          className="admin-form"
          onSubmit={(e) => {
            e.preventDefault();
            review.mutate(Object.fromEntries(new FormData(e.currentTarget)));
          }}
        >
          <h3>Review your provider</h3>
          <label>
            Rating
            <select name="rating" defaultValue="5">
              {[5, 4, 3, 2, 1].map((r) => (
                <option key={r} value={r}>
                  {r} / 5
                </option>
              ))}
            </select>
          </label>
          <label>
            Your review
            <textarea name="comment" minLength={3} maxLength={3000} required />
          </label>
          <label>
            Tags (comma-separated)
            <input name="tags" placeholder="Clear communication, tidy work" />
          </label>
          <button disabled={review.isPending}>Submit review</button>
        </form>
      )}
      {job.review_id && (
        <p className="read-only-note">
          Customer review recorded: {job.rating} / 5.
        </p>
      )}
    </article>
  );
}
