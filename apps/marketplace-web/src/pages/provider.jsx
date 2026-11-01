import { tabKeys } from '../components/shared';
import { Button } from '../components/ui/button';
import { ExistingRecords } from '../components/legacy';
import { southAfricanISO, dateTime } from '../lib';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import {
  age,
  amountInput,
  cities,
  fn,
  localDateTime,
  money,
  save,
  toCents,
  upload,
} from '../lib';
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
export function QuoteForm({ request, existing, onSaved }) {
  const categories = useRecords('ServiceCategory'),
    category = categories.data?.find((c) => c.slug === request.category_slug);
  const keys = [
    'callout_fee_cents',
    'labour_cents',
    'materials_cents',
    'travel_cents',
    'after_hours_cents',
  ];
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      keys.map((key) => [key, amountInput(existing?.[key] ?? 0)]),
    ),
  );
  useEffect(() => {
    if (!existing && category)
      setValues((old) => ({
        ...old,
        callout_fee_cents: amountInput(category.callout_fee_cents),
        labour_cents: amountInput(category.hourly_rate_cents),
      }));
  }, [category?.id, existing]);
  const mutation = useAction(async (data) => {
    const parts = Object.fromEntries(
      keys.map((key) => [key, toCents(values[key])]),
    );
    const total = Object.values(parts).reduce((sum, n) => sum + BigInt(n), 0n);
    if (total > BigInt(Number.MAX_SAFE_INTEGER))
      throw new Error('The quote is too large');
    const saved = await fn('submitBid', {
      request_id: request.id,
      ...parts,
      price_cents: Number(total),
      eta_minutes: Number(data.eta_minutes),
      duration_minutes: Number(data.duration_minutes),
      warranty_days: Number(data.warranty_days),
      valid_until: southAfricanISO(data.valid_until),
      comments: data.comments,
    });
    onSaved?.(saved);
  });
  let total = 0n;
  try {
    total = keys.reduce((sum, key) => sum + BigInt(toCents(values[key])), 0n);
  } catch {
    /* The input validation message is shown on submission. */
  }
  return (
    <form
      className="admin-form"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate(Object.fromEntries(new FormData(e.currentTarget)));
      }}
    >
      <h3>{existing ? 'Update your quote' : 'Submit a quote'}</h3>
      <p className="small">
        Include every cost. The customer pays exactly this total.
      </p>
      <div className="field-grid">
        {keys.map((key) => (
          <label key={key}>
            {
              {
                callout_fee_cents: 'Callout',
                labour_cents: 'Labour',
                materials_cents: 'Materials',
                travel_cents: 'Travel',
                after_hours_cents: 'After hours',
              }[key]
            }{' '}
            (R)
            <input
              inputMode="decimal"
              pattern="[0-9]+(\.[0-9]{1,2})?"
              required
              value={values[key]}
              onChange={(e) =>
                setValues((old) => ({ ...old, [key]: e.target.value }))
              }
            />
          </label>
        ))}
        <label>
          Arrival time (minutes)
          <input
            name="eta_minutes"
            type="number"
            min={1}
            max={10080}
            defaultValue={existing?.eta_minutes ?? 30}
            required
          />
        </label>
        <label>
          Duration (minutes)
          <input
            name="duration_minutes"
            type="number"
            min={1}
            max={10080}
            defaultValue={existing?.duration_minutes ?? 60}
            required
          />
        </label>
        <label>
          Warranty (days)
          <input
            name="warranty_days"
            type="number"
            min={0}
            max={3650}
            defaultValue={existing?.warranty_days ?? 0}
            required
          />
        </label>
        <label>
          Valid until
          <input
            name="valid_until"
            type="datetime-local"
            defaultValue={localDateTime(
              existing?.valid_until ?? Date.now() + 3600000,
            )}
            required
          />
        </label>
      </div>
      <label>
        Comments
        <textarea
          name="comments"
          maxLength={5000}
          defaultValue={existing?.comments ?? ''}
        />
      </label>
      <p className="quote-price">Total {money(total)}</p>
      {request.urgency === 'emergency' && (
        <p className="small">
          Emergency quotes must stay within the service’s callout and hourly
          base plus the configured emergency cap.
        </p>
      )}
      <Feedback error={mutation.error} />
      <Button disabled={mutation.isPending}>
        {mutation.isPending
          ? 'Saving…'
          : existing
            ? 'Update quote'
            : 'Submit quote'}
      </Button>
    </form>
  );
}
export function ProviderHub() {
  const { user } = useAuth(),
    profile = useRecords('ProviderProfile', { mine: 'true' }),
    quotes = useRecords('Bid', { mine: 'true' }),
    bookings = useRecords('Booking');
  const p = profile.data?.[0],
    [open, setOpen] = useState(null);
  const [tab, setTab] = useState('Opportunities');
  const [items, setItems] = useState([]),
    [loadError, setLoadError] = useState('');
  useEffect(() => {
    if (
      !p ||
      p.verification_status !== 'approved' ||
      p.availability !== 'online'
    ) {
      setItems([]);
      return;
    }
    let active = true;
    const refresh = () =>
      fn('listOpportunities', { provider_profile_id: p.id })
        .then((result) => {
          if (active) {
            setItems(result);
            setLoadError('');
          }
        })
        .catch((error) => {
          if (active) setLoadError(error.message);
        });
    void refresh();
    const timer = setInterval(refresh, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [p?.id, p?.verification_status, p?.availability, quotes.dataUpdatedAt]);
  const withdrawal = useAction((bid) => fn('withdrawBid', { bid_id: bid.id })),
    availability = useAction(() =>
      save(
        'ProviderProfile',
        { availability: p.availability === 'online' ? 'offline' : 'online' },
        p.id,
      ),
    );
  const assigned = (bookings.data ?? []).filter(
      (b) => b.provider_user_email === user.email,
    ),
    closed = assigned.filter((b) => b.status === 'closed'),
    sum = (field) => closed.reduce((total, b) => total + BigInt(b[field]), 0n);
  return (
    <>
      <Intro
        eyebrow="CONVYN / Provider hub"
        title="Good work starts here."
        action={
          <Link className="button button-secondary" to="/provider/onboarding">
            {p ? 'Your profile' : 'Become a provider'}
          </Link>
        }
      >
        Find opportunities, manage quotes and keep your jobs moving.
      </Intro>
      <Feedback
        error={
          profile.error ||
          quotes.error ||
          bookings.error ||
          withdrawal.error ||
          availability.error ||
          loadError
        }
      />
      {!p ? (
        <Empty
          title="Put your skills on the map"
          action={
            <Link className="button" to="/provider/onboarding">
              Build your provider profile
            </Link>
          }
        >
          Submit your profile and verification documents. Quoting opens after
          administrator approval.
        </Empty>
      ) : (
        <>
          <div className="panel record-line">
            <div>
              <p className="eyebrow">Verification / Availability</p>
              <Status value={p.verification_status} />
              {p.verification_status !== 'approved' && (
                <p>
                  Your profile must be approved before you can view or quote on
                  open requests.
                </p>
              )}
              {p.verification_notes && <p>{p.verification_notes}</p>}
            </div>
            <div>
              <Status value={p.availability} />
              {p.verification_status === 'approved' &&
                p.availability !== 'busy' && (
                  <Button
                    className="button-secondary"
                    onClick={() => availability.mutate()}
                    disabled={availability.isPending}
                  >
                    {p.availability === 'online' ? 'Go offline' : 'Go online'}
                  </Button>
                )}
            </div>
          </div>
          <Metrics
            items={[
              { label: 'Opportunities', value: items.length },
              {
                label: 'Active quotes',
                value:
                  quotes.data?.filter(
                    (b) =>
                      b.status === 'submitted' &&
                      new Date(b.valid_until) > new Date(),
                  ).length ?? 0,
              },
              {
                label: 'Active jobs',
                value: assigned.filter(
                  (b) => !['closed', 'cancelled'].includes(b.status),
                ).length,
              },
              { label: 'Completed jobs', value: p.jobs_completed },
            ]}
          />
          <div
            role="tablist"
            onKeyDown={tabKeys}
            aria-label="Provider workspace"
            className="tab-row"
          >
            {[
              'Opportunities',
              'My quotes',
              'Active jobs',
              'Completed jobs',
              'Earnings',
            ].map((name) => (
              <Button
                key={name}
                role="tab"
                aria-selected={tab === name}
                aria-controls="provider-panel"
                onClick={() => setTab(name)}
              >
                {name}
              </Button>
            ))}
          </div>
          <section id="provider-panel" role="tabpanel" aria-label={tab}>
            {tab === 'Opportunities' &&
              (items.length ? (
                items.map((r) => (
                  <article key={r.id}>
                    <p className="eyebrow">
                      {r.reference} / {r.category_name}
                    </p>
                    <div className="record-line">
                      <h2>{r.description}</h2>
                      <Status value={r.urgency} />
                    </div>
                    <div className="meta-row">
                      <span>
                        {r.suburb}, {r.city}
                      </span>
                      <span>{r.distance} km away</span>
                      <span>{age(r.created_date)}</span>
                    </div>
                    <FileLinks uris={r.attachments ?? []} />
                    {r.budget_hint_cents && (
                      <p>Budget guidance {money(r.budget_hint_cents)}</p>
                    )}
                    <details>
                      <summary>Prepare a quote</summary>
                      <QuoteForm
                        request={r}
                        onSaved={() =>
                          setItems((old) =>
                            old.filter((item) => item.id !== r.id),
                          )
                        }
                      />
                    </details>
                  </article>
                ))
              ) : (
                <Empty
                  title={
                    p.availability === 'online'
                      ? 'No matching opportunities yet'
                      : 'You’re not online'
                  }
                >
                  {p.availability === 'online'
                    ? 'New open requests in your approved categories and service radius will appear here.'
                    : 'Go online after approval to receive opportunities in your service area.'}
                </Empty>
              ))}
            {tab === 'My quotes' && (
              <QueryState query={quotes}>
                {(data) =>
                  data.length ? (
                    data.map((b) => (
                      <article key={b.id}>
                        <p className="eyebrow">
                          {b.request_reference} / {b.category_slug}
                        </p>
                        <div className="record-line">
                          <h2>{money(b.price_cents)}</h2>
                          <Status
                            value={
                              b.status === 'submitted' &&
                              new Date(b.valid_until) <= new Date()
                                ? 'expired'
                                : b.status
                            }
                          />
                        </div>
                        <p>{b.comments}</p>
                        <p className="small">
                          Valid until {dateTime(b.valid_until)}
                        </p>
                        {b.status === 'submitted' &&
                          new Date(b.valid_until) > new Date() && (
                            <>
                              <div className="actions">
                                <Button
                                  className="button-secondary"
                                  onClick={() =>
                                    setOpen(open === b.id ? null : b.id)
                                  }
                                >
                                  Edit quote
                                </Button>
                                <Button
                                  className="button-secondary"
                                  disabled={withdrawal.isPending}
                                  onClick={() => withdrawal.mutate(b)}
                                >
                                  Withdraw quote
                                </Button>
                              </div>
                              {open === b.id && (
                                <QuoteForm
                                  request={{
                                    id: b.request_id,
                                    category_slug: b.category_slug,
                                  }}
                                  existing={b}
                                  onSaved={() => setOpen(null)}
                                />
                              )}
                            </>
                          )}
                      </article>
                    ))
                  ) : (
                    <Empty title="Your quotes will live here">
                      Submit a quote on an opportunity to track it here.
                    </Empty>
                  )
                }
              </QueryState>
            )}
            {['Active jobs', 'Completed jobs'].includes(tab) && (
              <>
                {assigned
                  .filter((b) =>
                    tab === 'Completed jobs'
                      ? b.status === 'closed'
                      : !['closed', 'cancelled'].includes(b.status),
                  )
                  .map((b) => (
                    <article key={b.id}>
                      <p className="eyebrow">{b.reference}</p>
                      <h3>
                        {b.category_name} / {b.customer_name}
                      </h3>
                      <Status value={b.status} />
                      <p>
                        {b.address}, {b.city}
                      </p>
                      <Link className="button" to={'/bookings#' + b.id}>
                        Open booking
                      </Link>
                    </article>
                  ))}
                {!assigned.some((b) =>
                  tab === 'Completed jobs'
                    ? b.status === 'closed'
                    : !['closed', 'cancelled'].includes(b.status),
                ) && (
                  <Empty title="No jobs in this view">
                    Accepted quotes create jobs. Confirmed completions move to
                    your completed register.
                  </Empty>
                )}
              </>
            )}
            {['Active jobs', 'Completed jobs'].includes(tab) && (
              <ExistingRecords bookingsOnly />
            )}
            {tab === 'Earnings' && (
              <>
                <Metrics
                  items={[
                    {
                      label: 'Gross quoted',
                      value: money(sum('amount_cents')),
                    },
                    {
                      label: 'Commission',
                      value: money(sum('commission_cents')),
                    },
                    {
                      label: 'Provider allocation',
                      value: money(sum('payout_cents')),
                    },
                  ]}
                />
                <p className="read-only-note">
                  These totals cover closed jobs. They are quoted allocations,
                  not payments received or payouts made. Payment processing is
                  not connected.
                </p>
              </>
            )}
          </section>
        </>
      )}
    </>
  );
}
export function ProviderOnboarding() {
  const profile = useRecords('ProviderProfile', { mine: 'true' }),
    categories = useRecords('ServiceCategory'),
    p = profile.data?.[0];
  const [loaded, setLoaded] = useState(''),
    [data, setData] = useState({
      display_name: '',
      provider_type: 'individual',
      business_name: '',
      registration_number: '',
      bio: '',
      skills: '',
      category_slugs: [],
      city: 'Gqeberha',
      suburb: '',
      latitude: -33.96,
      longitude: 25.6,
      service_radius_km: 30,
      emergency_available: false,
      hourly_rate: '0',
      callout_fee: '0',
      payout_method: '',
      documents: [],
    });
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (p && p.id !== loaded) {
      setData({
        ...p,
        skills: p.skills.join(', '),
        hourly_rate: amountInput(p.hourly_rate_cents),
        callout_fee: amountInput(p.callout_fee_cents),
      });
      setLoaded(p.id);
    }
  }, [p, loaded]);
  const change = (key, value) => setData((old) => ({ ...old, [key]: value }));
  const files = useAction(async (selected) => {
    if (selected.length + data.documents.length > 10)
      throw new Error('Attach at most ten verification documents');
    const result = await upload('documents', selected);
    change('documents', [...data.documents, ...result.map((f) => f.uri)]);
  });
  const submit = useAction(async () => {
    if (!data.category_slugs.length)
      throw new Error('Choose at least one service');
    await save(
      'ProviderProfile',
      {
        display_name: data.display_name,
        provider_type: data.provider_type,
        business_name: data.business_name,
        registration_number: data.registration_number,
        bio: data.bio,
        skills: data.skills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        category_slugs: data.category_slugs,
        city: data.city,
        suburb: data.suburb,
        latitude: Number(data.latitude),
        longitude: Number(data.longitude),
        service_radius_km: Number(data.service_radius_km),
        emergency_available: data.emergency_available,
        hourly_rate_cents: toCents(data.hourly_rate),
        callout_fee_cents: toCents(data.callout_fee),
        payout_method: data.payout_method,
        documents: data.documents,
        verification_status:
          p &&
          ['approved', 'under_review', 'suspended'].includes(
            p.verification_status,
          )
            ? p.verification_status
            : 'submitted',
        ...(p ? {} : { availability: 'offline' }),
      },
      p?.id,
    );
    setNotice(
      'Verification submitted. Your profile remains submitted until an administrator records a decision.',
    );
  });
  return (
    <>
      <Intro
        eyebrow="CONVYN / Provider onboarding"
        title="Make your experience count."
      >
        Build your profile and submit the documents needed for review.
      </Intro>
      <Feedback
        error={profile.error || categories.error || files.error || submit.error}
        notice={notice}
      />
      {p && (
        <div className="panel">
          <Status value={p.verification_status} />
          <p>
            {p.verification_notes ||
              'Your verification decision will appear here.'}
          </p>
        </div>
      )}
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
      >
        <p className="eyebrow">Your professional profile</p>
        <div className="field-grid">
          <label>
            Display name
            <input
              required
              maxLength={150}
              value={data.display_name}
              onChange={(e) => change('display_name', e.target.value)}
            />
          </label>
          <label>
            Provider type
            <select
              value={data.provider_type}
              onChange={(e) => change('provider_type', e.target.value)}
            >
              <option value="individual">Individual</option>
              <option value="business">Business</option>
              <option value="company">Company</option>
            </select>
          </label>
          {data.provider_type !== 'individual' && (
            <>
              <label>
                Business name
                <input
                  required
                  value={data.business_name}
                  onChange={(e) => change('business_name', e.target.value)}
                />
              </label>
              <label>
                Registration number
                <input
                  required
                  value={data.registration_number}
                  onChange={(e) =>
                    change('registration_number', e.target.value)
                  }
                />
              </label>
            </>
          )}
        </div>
        <label>
          About your work
          <textarea
            maxLength={5000}
            required
            minLength={20}
            value={data.bio}
            onChange={(e) => change('bio', e.target.value)}
          />
        </label>
        <label>
          Skills (comma-separated)
          <input
            value={data.skills}
            onChange={(e) => change('skills', e.target.value)}
          />
        </label>
        <fieldset>
          <legend>Service categories</legend>
          <div className="field-grid">
            {categories.data?.map((c) => (
              <label className="check-label" key={c.id}>
                <input
                  type="checkbox"
                  checked={data.category_slugs.includes(c.slug)}
                  onChange={(e) =>
                    change(
                      'category_slugs',
                      e.target.checked
                        ? [...data.category_slugs, c.slug]
                        : data.category_slugs.filter((slug) => slug !== c.slug),
                    )
                  }
                />
                {c.name}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="field-grid">
          <label>
            City
            <select
              value={data.city}
              onChange={(e) => change('city', e.target.value)}
            >
              {cities.map((city) => (
                <option key={city}>{city}</option>
              ))}
            </select>
          </label>
          <label>
            Suburb
            <input
              required
              value={data.suburb}
              onChange={(e) => change('suburb', e.target.value)}
            />
          </label>
          <label>
            Service radius (km)
            <input
              required
              type="number"
              min={1}
              max={300}
              value={data.service_radius_km}
              onChange={(e) => change('service_radius_km', e.target.value)}
            />
          </label>
          <label>
            Hourly rate (R)
            <input
              required
              inputMode="decimal"
              pattern="[0-9]+(\.[0-9]{1,2})?"
              value={data.hourly_rate}
              onChange={(e) => change('hourly_rate', e.target.value)}
            />
          </label>
          <label>
            Callout fee (R)
            <input
              required
              inputMode="decimal"
              pattern="[0-9]+(\.[0-9]{1,2})?"
              value={data.callout_fee}
              onChange={(e) => change('callout_fee', e.target.value)}
            />
          </label>
          <label>
            Payout method
            <input
              value={data.payout_method}
              onChange={(e) => change('payout_method', e.target.value)}
              placeholder="Preferred method; payouts are not connected"
            />
          </label>
          <label>
            Service latitude
            <input
              required
              type="number"
              min={-90}
              max={90}
              step="any"
              value={data.latitude}
              onChange={(e) => change('latitude', e.target.value)}
            />
          </label>
          <label>
            Service longitude
            <input
              required
              type="number"
              min={-180}
              max={180}
              step="any"
              value={data.longitude}
              onChange={(e) => change('longitude', e.target.value)}
            />
          </label>
        </div>
        <label className="check-label">
          <input
            type="checkbox"
            checked={data.emergency_available}
            onChange={(e) => change('emergency_available', e.target.checked)}
          />
          Available for emergency requests
        </label>
        <label>
          Private verification documents
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            multiple
            disabled={files.isPending}
            onChange={(e) => {
              const selected = [...e.target.files];
              if (selected.length) files.mutate(selected);
              e.target.value = '';
            }}
          />
        </label>
        <p className="small">
          Only you and administrators can open these documents. Upload at most
          ten files, 10 MB each, in batches of up to four.
        </p>
        <FileLinks uris={data.documents} />
        <Button disabled={submit.isPending || files.isPending}>
          Submit verification
        </Button>
      </form>
    </>
  );
}
