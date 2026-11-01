import { Button } from '../components/ui/button';
import { ExistingRecords } from '../components/legacy';
import { southAfricanISO, dateTime } from '../lib';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { ArrowUpRight, MapPin, Search, Upload } from 'lucide-react';
import { useAuth } from '../auth';
import {
  age,
  cities,
  date,
  fn,
  label,
  money,
  record,
  save,
  toCents,
  upload,
} from '../lib';
import {
  categoryIcons,
  Empty,
  Feedback,
  FileLinks,
  Intro,
  Metrics,
  NotificationList,
  QueryState,
  Status,
  SupportNote,
  useAction,
  useRecords,
} from '../components/shared';
import { ConfirmDialog } from '../components/ui/dialog';

export function Dashboard() {
  const requests = useRecords('ServiceRequest', { mine: 'true' }),
    bookings = useRecords('Booking'),
    notifications = useRecords('Notification');
  return (
    <>
      <Intro
        eyebrow="CONVYN / Customer dashboard"
        title="Your next move, handled."
        action={
          <Link className="button" to="/requests/new">
            New request <ArrowUpRight size={14} />
          </Link>
        }
      >
        Requests, bookings and updates. Every detail in one place.
      </Intro>
      <Metrics
        items={[
          {
            label: 'Open requests',
            value:
              requests.data?.filter((r) => r.status === 'open').length ?? 0,
          },
          {
            label: 'Active bookings',
            value:
              bookings.data?.filter(
                (b) => !['closed', 'cancelled'].includes(b.status),
              ).length ?? 0,
          },
          {
            label: 'Unread updates',
            value: notifications.data?.filter((n) => !n.read).length ?? 0,
          },
        ]}
      />
      <div className="page-columns">
        <div>
          <section className="panel">
            <p className="eyebrow">Your service register</p>
            <h2>Requests</h2>
            <QueryState query={requests}>
              {(items) =>
                items.length ? (
                  <ul className="record-register">
                    {items.map((r) => (
                      <li key={r.id}>
                        <div className="record-line">
                          <div>
                            <p className="eyebrow">
                              {r.reference} / {r.category_name}
                            </p>
                            <Link to={'/requests/' + r.id}>
                              <strong>{r.description}</strong>
                            </Link>
                            <p>
                              {r.city} · {age(r.created_date)} · {r.bid_count}{' '}
                              quotes
                            </p>
                          </div>
                          <Status value={r.status} />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty
                    title="Start with what you need"
                    action={
                      <Link className="button" to="/requests/new">
                        Request a service
                      </Link>
                    }
                  >
                    Publish a request to receive quotes from approved
                    professionals.
                  </Empty>
                )
              }
            </QueryState>
          </section>
          <section className="panel">
            <p className="eyebrow">Next on your schedule</p>
            <h2>Upcoming bookings</h2>
            <QueryState query={bookings}>
              {(items) => {
                const active = items.filter(
                  (b) => !['closed', 'cancelled'].includes(b.status),
                );
                return active.length ? (
                  <ul className="record-register">
                    {active.map((b) => (
                      <li key={b.id}>
                        <Link to={'/bookings#' + b.id}>
                          <strong>
                            {b.reference} · {b.category_name}
                          </strong>
                        </Link>
                        <p>
                          {b.provider_name} · {date(b.scheduled_for)} ·{' '}
                          {money(b.amount_cents)}
                        </p>
                        <Status value={b.status} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty title="Nothing booked yet">
                    Accept a quote to create a booking and follow its progress
                    here.
                  </Empty>
                );
              }}
            </QueryState>
          </section>
          <ExistingRecords compact />
          <NotificationList />
        </div>
        <SupportNote />
      </div>
    </>
  );
}
const centres = {
  Gqeberha: [-33.96, 25.6],
  'East London': [-33.0153, 27.9116],
  'Cape Town': [-33.9249, 18.4241],
  Durban: [-29.8587, 31.0218],
  Johannesburg: [-26.2041, 28.0473],
  Pretoria: [-25.7479, 28.2293],
};
const urgencyHints = {
  emergency: 'Now',
  urgent: 'Today',
  standard: 'Next 48 hours',
  scheduled: 'Pick a date',
};
export function RequestWizard() {
  const [search] = useSearchParams(),
    navigate = useNavigate(),
    categories = useRecords('ServiceCategory');
  const [step, setStep] = useState(0),
    [error, setError] = useState(''),
    [questions, setQuestions] = useState([]);
  const [data, setData] = useState({
    category_slug: search.get('category') ?? '',
    urgency: 'standard',
    description: '',
    attachments: [],
    ai_summary: '',
    address: '',
    suburb: '',
    city: 'Gqeberha',
    latitude: -33.96,
    longitude: 25.6,
    customer_phone: '',
    budget: '',
    scheduled_for: '',
  });
  const category = categories.data?.find((c) => c.slug === data.category_slug);
  const change = (key, value) => setData((old) => ({ ...old, [key]: value }));
  const publish = useAction(async () => {
    if (!category) throw new Error('Choose an active service');
    const saved = await save('ServiceRequest', {
      category_slug: data.category_slug,
      urgency: data.urgency,
      description: data.description,
      attachments: data.attachments,
      ai_summary: data.ai_summary,
      address: data.address,
      suburb: data.suburb,
      city: data.city,
      latitude: Number(data.latitude),
      longitude: Number(data.longitude),
      customer_phone: data.customer_phone,
      budget_hint_cents: data.budget ? toCents(data.budget) : null,
      scheduled_for:
        data.urgency === 'scheduled'
          ? southAfricanISO(data.scheduled_for)
          : null,
      status: 'open',
    });
    navigate('/requests/' + saved.id);
  });
  const assist = useAction(async () => {
    const suggestion = await fn('suggestService', {
      description: data.description,
    });
    setData((old) => ({
      ...old,
      category_slug: suggestion.category_slug,
      urgency: suggestion.urgency,
      ai_summary: suggestion.summary,
    }));
    setQuestions(suggestion.questions);
  });
  const attachments = useAction(async (files) => {
    if (files.length + data.attachments.length > 4)
      throw new Error('Attach at most four files');
    const saved = await upload('requests', files);
    change('attachments', [...data.attachments, ...saved.map((f) => f.uri)]);
  });
  const location = useAction(
    () =>
      new Promise((resolve, reject) => {
        if (!navigator.geolocation)
          return reject(
            new Error('Location is not supported. Enter coordinates manually.'),
          );
        navigator.geolocation.getCurrentPosition(
          (p) => {
            setData((old) => ({
              ...old,
              latitude: p.coords.latitude,
              longitude: p.coords.longitude,
            }));
            resolve();
          },
          () =>
            reject(
              new Error(
                'Location was not shared. Confirm your service coordinates manually.',
              ),
            ),
          { enableHighAccuracy: true, timeout: 15000 },
        );
      }),
  );
  function next(e) {
    e.preventDefault();
    setError('');
    if (step === 0 && !category) {
      setError('Choose an active service');
      return;
    }
    if (
      data.urgency === 'emergency' &&
      category &&
      !category.emergency_supported
    ) {
      setError('This service does not support emergency requests');
      return;
    }
    if (
      step === 2 &&
      data.urgency === 'scheduled' &&
      (!data.scheduled_for ||
        new Date(southAfricanISO(data.scheduled_for)) <= new Date())
    ) {
      setError('Choose a future date for the scheduled job');
      return;
    }
    if (step < 3) setStep(step + 1);
    else publish.mutate();
  }
  return (
    <div className="wizard">
      <Intro
        eyebrow="CONVYN / New service request"
        title="Tell us what needs doing."
      >
        Four clear steps. Quotes from approved professionals.
      </Intro>
      <ol className="steps" aria-label="Request progress">
        {['Service', 'Details', 'Location', 'Review'].map((name, i) => (
          <li key={name} aria-current={step === i ? 'step' : undefined}>
            {String(i + 1).padStart(2, '0')} / {name}
          </li>
        ))}
      </ol>
      <Feedback
        error={
          error ||
          publish.error ||
          assist.error ||
          attachments.error ||
          location.error
        }
      />
      <form onSubmit={next}>
        {step === 0 && (
          <fieldset>
            <legend>Choose your service</legend>
            <QueryState query={categories}>
              {(items) => (
                <div className="category-grid">
                  {items
                    .filter((c) => c.active)
                    .map((c) => {
                      const Icon = categoryIcons[c.slug] ?? Search;
                      return (
                        <Button
                          type="button"
                          key={c.id}
                          className="category-tile"
                          aria-pressed={data.category_slug === c.slug}
                          onClick={() => change('category_slug', c.slug)}
                        >
                          <Icon size={24} />
                          <h3>{c.name}</h3>
                          <small>{money(c.callout_fee_cents)} callout</small>
                        </Button>
                      );
                    })}
                </div>
              )}
            </QueryState>
            <h3>When do you need help?</h3>
            <div className="urgency-grid">
              {Object.entries(urgencyHints).map(([value, hint]) => (
                <label className="choice" key={value}>
                  <input
                    type="radio"
                    name="urgency"
                    value={value}
                    checked={data.urgency === value}
                    onChange={() => change('urgency', value)}
                  />
                  <span>
                    {label(value)}
                    <small>{hint}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {step === 1 && (
          <fieldset>
            <legend>Describe the work</legend>
            <label>
              Description
              <textarea
                minLength={20}
                maxLength={5000}
                required
                value={data.description}
                onChange={(e) => change('description', e.target.value)}
                placeholder="What needs attention? Add the details a professional would need to quote."
              />
            </label>
            <div className="actions">
              <Button
                type="button"
                className="button-secondary"
                disabled={assist.isPending || data.description.length < 20}
                onClick={() => assist.mutate()}
              >
                {assist.isPending
                  ? 'Reading your request…'
                  : 'Suggest category'}
              </Button>
            </div>
            {data.ai_summary && (
              <div className="panel">
                <p className="eyebrow">Assisted summary</p>
                <p>{data.ai_summary}</p>
                {questions.map((q) => (
                  <p key={q}>{q}</p>
                ))}
              </div>
            )}
            <label>
              <span>
                <Upload size={15} /> Photos or videos (up to four, 10 MB each)
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
                multiple
                disabled={attachments.isPending}
                onChange={(e) => {
                  const files = [...e.target.files];
                  if (files.length) attachments.mutate(files);
                  e.target.value = '';
                }}
              />
            </label>
            <p className="small">
              Job photos are shared with eligible approved providers. Keep
              passwords and sensitive documents out of job photos.
            </p>
            <FileLinks uris={data.attachments} />
            {data.attachments.map((uri, i) => (
              <Button
                type="button"
                className="button-secondary"
                key={uri}
                onClick={() =>
                  change(
                    'attachments',
                    data.attachments.filter((v) => v !== uri),
                  )
                }
              >
                Remove attachment {i + 1}
              </Button>
            ))}
          </fieldset>
        )}
        {step === 2 && (
          <fieldset>
            <legend>Where should we meet you?</legend>
            <div className="field-grid">
              <label>
                Address
                <input
                  required
                  minLength={3}
                  maxLength={300}
                  value={data.address}
                  onChange={(e) => change('address', e.target.value)}
                  autoComplete="street-address"
                />
              </label>
              <label>
                Suburb
                <input
                  required
                  maxLength={100}
                  value={data.suburb}
                  onChange={(e) => change('suburb', e.target.value)}
                />
              </label>
              <label>
                City
                <select
                  value={data.city}
                  onChange={(e) =>
                    setData((old) => ({
                      ...old,
                      city: e.target.value,
                      latitude: centres[e.target.value][0],
                      longitude: centres[e.target.value][1],
                    }))
                  }
                >
                  {cities.map((city) => (
                    <option key={city}>{city}</option>
                  ))}
                </select>
              </label>
              <label>
                Contact number
                <input
                  type="tel"
                  required
                  pattern="\+[1-9][0-9]{7,14}"
                  value={data.customer_phone}
                  onChange={(e) => change('customer_phone', e.target.value)}
                  placeholder="+27…"
                />
              </label>
              <label>
                Budget guidance (R, optional)
                <input
                  inputMode="decimal"
                  pattern="[0-9]+(\.[0-9]{1,2})?"
                  value={data.budget}
                  onChange={(e) => change('budget', e.target.value)}
                />
              </label>
              {data.urgency === 'scheduled' && (
                <label>
                  Preferred date and time
                  <input
                    required
                    type="datetime-local"
                    value={data.scheduled_for}
                    onChange={(e) => change('scheduled_for', e.target.value)}
                  />
                </label>
              )}
            </div>
            <div className="actions">
              <Button
                type="button"
                className="button-secondary"
                onClick={() => location.mutate()}
                disabled={location.isPending}
              >
                <MapPin size={16} />
                Use my location
              </Button>
            </div>
            <p className="small">
              Confirm the service location. Coordinates initially point to your
              selected city centre.
            </p>
            <div className="field-grid">
              <label>
                Latitude
                <input
                  type="number"
                  step="any"
                  min={-90}
                  max={90}
                  required
                  value={data.latitude}
                  onChange={(e) => change('latitude', e.target.value)}
                />
              </label>
              <label>
                Longitude
                <input
                  type="number"
                  step="any"
                  min={-180}
                  max={180}
                  required
                  value={data.longitude}
                  onChange={(e) => change('longitude', e.target.value)}
                />
              </label>
            </div>
          </fieldset>
        )}
        {step === 3 && (
          <fieldset>
            <legend>Review your request</legend>
            <dl className="review-grid">
              {[
                ['Service', category?.name],
                ['Urgency', label(data.urgency)],
                ['Description', data.description],
                ['Assisted summary', data.ai_summary || 'Not used'],
                ['Address', data.address],
                ['Suburb', data.suburb],
                ['City', data.city],
                ['Coordinates', data.latitude + ', ' + data.longitude],
                ['Contact number', data.customer_phone],
                [
                  'Budget guidance',
                  data.budget ? money(toCents(data.budget)) : 'Not specified',
                ],
                [
                  'Preferred date',
                  data.scheduled_for
                    ? dateTime(southAfricanISO(data.scheduled_for))
                    : 'Not scheduled',
                ],
                ['Attachments', data.attachments.length],
              ].map(([key, value]) => (
                <div className="contents" key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <FileLinks uris={data.attachments} />
            <p className="small">
              Your contact details and exact address remain private. They are
              shared with the assigned provider after you accept a quote.
            </p>
          </fieldset>
        )}
        <div className="actions">
          {step > 0 && (
            <Button
              type="button"
              className="button-secondary"
              onClick={() => setStep(step - 1)}
            >
              Back
            </Button>
          )}
          <Button disabled={publish.isPending || attachments.isPending}>
            {publish.isPending
              ? 'Publishing…'
              : step === 3
                ? 'Publish request'
                : 'Continue'}
          </Button>
        </div>
      </form>
    </div>
  );
}
function Countdown({ until }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const left = new Date(until).getTime() - now;
  return (
    <span className="countdown">
      {left <= 0
        ? 'Expired'
        : `Valid for ${Math.floor(left / 3600000)}h ${Math.floor(left / 60000) % 60}m`}
    </span>
  );
}
export function RequestDetail() {
  const { id } = useParams(),
    { user } = useAuth(),
    [selected, setSelected] = useState(null);
  const request = useQuery({
      queryKey: ['request', id, user.id],
      queryFn: () => record('ServiceRequest', id),
      refetchInterval: 15000,
    }),
    bids = useRecords('Bid', { request_id: id });
  const ranked = useQuery({
    queryKey: ['ranked-bids', id, user.id],
    queryFn: () => fn('scoreBids', { request_id: id }),
    enabled: request.data?.status === 'open',
    refetchInterval: 15000,
  });
  const accept = useAction(async (bid) => {
    const result = await fn(
      'acceptBid',
      { bid_id: bid.id },
      { headers: { 'X-Convyn-Quoted-Amount': String(bid.price_cents) } },
    );
    setSelected(null);
    return result;
  });
  const cancel = useAction(() =>
    save('ServiceRequest', { status: 'cancelled' }, id),
  );
  return (
    <QueryState query={request}>
      {(r) => {
        const scores = new Map((ranked.data ?? []).map((b) => [b.id, b]));
        const all = (bids.data ?? [])
            .map((b) => scores.get(b.id) ?? b)
            .sort(
              (a, b) =>
                Number(b.score ?? -1) - Number(a.score ?? -1) ||
                a.price_cents - b.price_cents,
            ),
          submitted = all.filter(
            (b) =>
              b.status === 'submitted' && new Date(b.valid_until) > new Date(),
          ),
          others = all.filter((b) => !submitted.some((q) => q.id === b.id));
        return (
          <>
            <Intro
              eyebrow={r.reference + ' / ' + r.category_name}
              title={r.description}
              action={<Status value={r.status} />}
            >
              {r.city} · {label(r.urgency)} · {age(r.created_date)}
            </Intro>
            <Feedback
              error={accept.error || cancel.error || bids.error || ranked.error}
            />
            <div className="page-columns">
              <div>
                <section className="panel">
                  <p className="eyebrow">Your request</p>
                  <dl className="review-grid">
                    <dt>Address</dt>
                    <dd>
                      {r.address}, {r.suburb}, {r.city}
                    </dd>
                    <dt>Scheduled for</dt>
                    <dd>{date(r.scheduled_for)}</dd>
                    <dt>Contact</dt>
                    <dd>{r.customer_phone}</dd>
                    <dt>Budget guidance</dt>
                    <dd>
                      {r.budget_hint_cents
                        ? money(r.budget_hint_cents)
                        : 'Not specified'}
                    </dd>
                  </dl>
                  {r.ai_summary && <p>{r.ai_summary}</p>}
                  <FileLinks uris={r.attachments} />
                  {['open', 'draft'].includes(r.status) && (
                    <Button
                      className="button-secondary"
                      disabled={cancel.isPending}
                      onClick={() => cancel.mutate()}
                    >
                      Cancel request
                    </Button>
                  )}
                  {r.booking_id && (
                    <Link className="button" to={'/bookings#' + r.booking_id}>
                      View booking
                    </Link>
                  )}
                </section>
                <p className="eyebrow">Compare every detail</p>
                <h2>Quotes ranked for you</h2>
                {submitted.length ? (
                  submitted.map((b) => (
                    <QuoteCard
                      key={b.id}
                      bid={b}
                      onAccept={
                        r.status === 'open' && r.created_by_id === user.id
                          ? (event) =>
                              setSelected({
                                ...b,
                                trigger: event.currentTarget,
                              })
                          : null
                      }
                    />
                  ))
                ) : (
                  <Empty
                    title={
                      r.status === 'open'
                        ? 'Your request is open'
                        : 'This request has moved forward'
                    }
                  >
                    {r.status === 'open'
                      ? 'Approved providers in your service area can now submit quotes. They will appear here with their price and recommendation breakdown.'
                      : 'View the booking for the next step.'}
                  </Empty>
                )}
                {others.length > 0 && (
                  <details>
                    <summary>Other quotes ({others.length})</summary>
                    {others.map((b) => (
                      <QuoteCard key={b.id} bid={b} />
                    ))}
                  </details>
                )}
              </div>
              <SupportNote />
            </div>
            <ConfirmDialog
              open={!!selected}
              onOpenChange={(open) => {
                if (!open) setSelected(null);
              }}
              title="Accept this quote?"
              description={
                selected
                  ? `You are accepting ${money(selected.price_cents)} from ${selected.provider_name}. A booking will be created for exactly this quoted amount. Provider commission is deducted from the provider’s share.`
                  : ''
              }
              error={accept.error}
              returnFocus={selected?.trigger}
              busy={accept.isPending}
              action={() => accept.mutate(selected)}
            />
          </>
        );
      }}
    </QueryState>
  );
}
export function QuoteCard({ bid, onAccept }) {
  const provider = useQuery({
    queryKey: ['provider-card', bid.provider_profile_id],
    queryFn: () => record('ProviderProfile', bid.provider_profile_id),
  });
  return (
    <article className="quote-card">
      <div className="record-line">
        <div>
          <p className="eyebrow">{bid.provider_name}</p>
          <p className="quote-price">{money(bid.price_cents)}</p>
        </div>
        {bid.score !== null && (
          <span className="quote-score">
            {Number(bid.score).toFixed(1)} / 100
          </span>
        )}
      </div>
      <div className="meta-row">
        <span>ETA {bid.eta_minutes} min</span>
        <span>Duration {bid.duration_minutes} min</span>
        <span>{bid.warranty_days} day warranty</span>
        <Countdown until={bid.valid_until} />
      </div>
      <p>{bid.comments}</p>
      {provider.data && (
        <p className="small">
          {Number(provider.data.rating_avg).toFixed(1)} / 5 ·{' '}
          {provider.data.jobs_completed} completed jobs ·{' '}
          <Status value={provider.data.verification_status} />
        </p>
      )}
      <Status
        value={
          new Date(bid.valid_until) <= new Date() && bid.status === 'submitted'
            ? 'expired'
            : bid.status
        }
      />
      <details>
        <summary>Price and score breakdown</summary>
        <dl className="score-breakdown">
          {[
            'callout_fee_cents',
            'labour_cents',
            'materials_cents',
            'travel_cents',
            'after_hours_cents',
          ].map((key) => (
            <div className="contents" key={key}>
              <dt>{label(key.replace('_cents', ''))}</dt>
              <dd>{money(bid[key])}</dd>
            </div>
          ))}
        </dl>
        {bid.score_breakdown && (
          <dl className="score-breakdown">
            {Object.entries(bid.score_breakdown).map(([key, value]) => (
              <div className="contents" key={key}>
                <dt>
                  {label(key)} · {value.weight}%
                </dt>
                <dd>{value.contribution} points</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="small">
          {bid.score_explanation ?? 'Recommendation is being calculated.'}
        </p>
        <p className="small">Valid until {dateTime(bid.valid_until)}</p>
      </details>
      {onAccept && (
        <div className="actions">
          <Button onClick={onAccept}>Accept quote</Button>
        </div>
      )}
    </article>
  );
}
