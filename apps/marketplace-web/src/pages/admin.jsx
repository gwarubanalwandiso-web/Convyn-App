import { tabKeys } from '../components/shared';
import { Button } from '../components/ui/button';
import { ExistingRecords } from '../components/legacy';
import { dateTime } from '../lib';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth';
import {
  api,
  amountInput,
  cities,
  date,
  fn,
  money,
  remove,
  save,
  toCents,
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
import { BookingCard } from './bookings';
const tabs = [
  'Overview',
  'Requests',
  'Bookings',
  'Providers',
  'Services',
  'Reviews',
  'People',
  'Messages',
  'Audit log',
  'Account',
  'Rules & fees',
];
export function Admin() {
  const [tab, setTab] = useState('Overview');
  return (
    <>
      <Intro
        eyebrow="CONVYN / Administration"
        title="A clear view of operations."
      >
        Review the network, manage the rules and keep the marketplace moving.
      </Intro>
      <div
        role="tablist"
        onKeyDown={tabKeys}
        aria-label="Administration sections"
        className="tab-row"
      >
        {tabs.map((name) => (
          <Button
            key={name}
            role="tab"
            aria-selected={tab === name}
            aria-controls="admin-panel"
            onClick={() => setTab(name)}
          >
            {name}
          </Button>
        ))}
      </div>
      <section role="tabpanel" id="admin-panel" aria-label={tab}>
        {tab === 'Overview' ? (
          <Overview />
        ) : tab === 'Requests' ? (
          <Requests />
        ) : tab === 'Bookings' ? (
          <AdminBookings />
        ) : tab === 'Providers' ? (
          <Providers />
        ) : tab === 'Services' ? (
          <Services />
        ) : tab === 'Reviews' ? (
          <Reviews />
        ) : tab === 'People' ? (
          <People />
        ) : tab === 'Messages' ? (
          <Messages />
        ) : tab === 'Audit log' ? (
          <Audit />
        ) : tab === 'Account' ? (
          <Account />
        ) : (
          <Rules />
        )}
      </section>
    </>
  );
}
function Overview() {
  const providers = useRecords('ProviderProfile'),
    bookings = useRecords('Booking'),
    requests = useRecords('ServiceRequest');
  const closed = bookings.data?.filter((b) => b.status === 'closed') ?? [],
    sum = (field) => closed.reduce((s, b) => s + BigInt(b[field]), 0n);
  return (
    <>
      <Metrics
        items={[
          { label: 'Provider network', value: providers.data?.length ?? 0 },
          {
            label: 'Awaiting review',
            value:
              providers.data?.filter((p) =>
                ['submitted', 'under_review', 'more_info'].includes(
                  p.verification_status,
                ),
              ).length ?? 0,
          },
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
        ]}
      />
      <Metrics
        items={[
          { label: 'Closed job value', value: money(sum('amount_cents')) },
          {
            label: 'Commission allocation',
            value: money(sum('commission_cents')),
          },
          { label: 'Provider allocation', value: money(sum('payout_cents')) },
        ]}
      />
      <p className="read-only-note">
        These are quoted allocations on closed jobs. They do not represent
        collected payments or settled payouts.
      </p>
      <Feedback error={providers.error || bookings.error || requests.error} />
      <Audit compact />
    </>
  );
}
function Requests() {
  const query = useRecords('ServiceRequest');
  return (
    <>
      <h2>Requests</h2>
      <QueryState query={query}>
        {(items) =>
          items.length ? (
            <div
              className="table-wrap"
              tabIndex={0}
              role="region"
              aria-label="Request register"
            >
              <table>
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Customer</th>
                    <th>Service</th>
                    <th>Status</th>
                    <th>Open</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <tr key={r.id}>
                      <td>{r.reference}</td>
                      <td>{r.customer_name}</td>
                      <td>{r.category_name}</td>
                      <td>
                        <Status value={r.status} />
                      </td>
                      <td>
                        <Link to={'/requests/' + r.id}>View request</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No service requests yet">
              Published customer requests will appear in this register.
            </Empty>
          )
        }
      </QueryState>
    </>
  );
}
function AdminBookings() {
  const query = useRecords('Booking');
  return (
    <>
      <h2>Bookings</h2>
      <ExistingRecords />
      <QueryState query={query}>
        {(items) =>
          items.length ? (
            items.map((job) => <BookingCard key={job.id} job={job} />)
          ) : (
            <Empty title="No bookings yet">
              Accepted quotes create bookings with an auditable timeline.
            </Empty>
          )
        }
      </QueryState>
    </>
  );
}
function Verification({ provider }) {
  const [notes, setNotes] = useState('');
  const action = useAction(async (decision) => {
    if (!notes.trim())
      throw new Error('Record your review notes before saving a decision');
    return fn('reviewProviderVerification', {
      provider_profile_id: provider.id,
      decision,
      notes,
    });
  });
  const suspend = useAction(() =>
    save(
      'ProviderProfile',
      {
        verification_status: 'suspended',
        availability: 'offline',
        verification_notes: notes,
      },
      provider.id,
    ),
  );
  return (
    <article>
      <div className="record-line">
        <div>
          <p className="eyebrow">
            {provider.provider_type} / {provider.city}
          </p>
          <h3>{provider.display_name}</h3>
        </div>
        <Status value={provider.verification_status} />
      </div>
      <p>{provider.user_email}</p>
      <p>{provider.bio}</p>
      <p>
        {provider.business_name} {provider.registration_number}
      </p>
      <p>{provider.category_slugs.join(' · ')}</p>
      <FileLinks uris={provider.documents} />
      <p>{provider.verification_notes}</p>
      <label>
        Review notes
        <textarea
          required
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={3000}
        />
      </label>
      <div className="actions">
        {['approve', 'reject', 'more_info'].map((decision) => (
          <Button
            key={decision}
            className={decision === 'approve' ? '' : 'button-secondary'}
            disabled={action.isPending || suspend.isPending || !notes.trim()}
            onClick={() => action.mutate(decision)}
          >
            {decision === 'approve'
              ? 'Approve'
              : decision === 'reject'
                ? 'Reject'
                : 'Request more information'}
          </Button>
        ))}
        {provider.verification_status === 'approved' && (
          <Button
            className="button-secondary"
            disabled={!notes.trim() || suspend.isPending}
            onClick={() => suspend.mutate()}
          >
            Suspend
          </Button>
        )}
      </div>
      <Feedback error={action.error || suspend.error} />
    </article>
  );
}
function Providers() {
  const query = useRecords('ProviderProfile'),
    [filter, setFilter] = useState('queue');
  return (
    <>
      <h2>Providers</h2>
      <div className="actions">
        <Button onClick={() => setFilter('queue')}>Verification queue</Button>
        <Button className="button-secondary" onClick={() => setFilter('all')}>
          Provider directory
        </Button>
      </div>
      <QueryState query={query}>
        {(items) => {
          const visible = items.filter(
            (p) =>
              filter === 'all' ||
              ['submitted', 'under_review', 'more_info'].includes(
                p.verification_status,
              ),
          );
          return visible.length ? (
            visible.map((p) => <Verification key={p.id} provider={p} />)
          ) : (
            <Empty title="No profiles in this view">
              New verification submissions will appear here for review.
            </Empty>
          );
        }}
      </QueryState>
    </>
  );
}
function Services() {
  const query = useRecords('ServiceCategory'),
    [editing, setEditing] = useState(null),
    [notice, setNotice] = useState('');
  const action = useAction(async (data) => {
      await save(
        'ServiceCategory',
        {
          name: data.name,
          slug: data.slug,
          blurb: data.blurb,
          callout_fee_cents: toCents(data.callout),
          hourly_rate_cents: toCents(data.hourly),
          emergency_supported: data.emergency === 'on',
          commission_pct:
            data.commission === '' ? null : Number(data.commission),
          sort_order: Number(data.sort_order),
          active: data.active === 'on',
        },
        editing?.id,
      );
      setEditing(null);
      setNotice('Service saved. It is available to new requests when active.');
    }),
    deletion = useAction((id) => remove('ServiceCategory', id)),
    toggle = useAction((c) =>
      save('ServiceCategory', { active: !c.active }, c.id),
    );
  return (
    <>
      <h2>Services</h2>
      <Feedback
        error={action.error || deletion.error || toggle.error}
        notice={notice}
      />
      <QueryState query={query}>
        {(items) => (
          <div
            className="table-wrap"
            tabIndex={0}
            role="region"
            aria-label="Service register"
          >
            <table>
              <thead>
                <tr>
                  <th>Order / Service</th>
                  <th>Callout</th>
                  <th>Hourly</th>
                  <th>Visibility</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {c.sort_order} / {c.name}
                    </td>
                    <td>{money(c.callout_fee_cents)}</td>
                    <td>{money(c.hourly_rate_cents)}</td>
                    <td>
                      <Status value={c.active ? 'active' : 'hidden'} />
                    </td>
                    <td>
                      <Button
                        className="button-secondary"
                        onClick={() => setEditing(c)}
                      >
                        Edit
                      </Button>
                      <Button
                        className="button-secondary"
                        onClick={() => toggle.mutate(c)}
                        disabled={toggle.isPending}
                      >
                        {c.active ? 'Hide' : 'Activate'}
                      </Button>
                      <Button
                        className="button-secondary"
                        disabled={deletion.isPending}
                        onClick={() => deletion.mutate(c.id)}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryState>
      <form
        className="admin-form"
        key={editing?.id ?? 'new'}
        onSubmit={(e) => {
          e.preventDefault();
          action.mutate(Object.fromEntries(new FormData(e.currentTarget)));
        }}
      >
        <h3>{editing ? 'Edit service' : 'Add service'}</h3>
        <div className="field-grid">
          <label>
            Service name
            <input
              name="name"
              defaultValue={editing?.name ?? ''}
              maxLength={100}
              required
            />
          </label>
          <label>
            Slug
            <input
              name="slug"
              defaultValue={editing?.slug ?? ''}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              required
            />
          </label>
          <label>
            Callout fee (R)
            <input
              name="callout"
              inputMode="decimal"
              defaultValue={amountInput(editing?.callout_fee_cents ?? 0)}
              pattern="[0-9]+(\.[0-9]{1,2})?"
              required
            />
          </label>
          <label>
            Hourly rate (R)
            <input
              name="hourly"
              inputMode="decimal"
              defaultValue={amountInput(editing?.hourly_rate_cents ?? 0)}
              pattern="[0-9]+(\.[0-9]{1,2})?"
              required
            />
          </label>
          <label>
            Commission override (%, optional)
            <input
              name="commission"
              type="number"
              min={0}
              max={100}
              defaultValue={editing?.commission_pct ?? ''}
            />
          </label>
          <label>
            Sort order
            <input
              name="sort_order"
              type="number"
              defaultValue={
                editing?.sort_order ?? (query.data?.length ?? 0) + 1
              }
              required
            />
          </label>
        </div>
        <label>
          Blurb
          <textarea name="blurb" defaultValue={editing?.blurb ?? ''} />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            name="emergency"
            defaultChecked={editing?.emergency_supported ?? false}
          />
          Emergency supported
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            name="active"
            defaultChecked={editing?.active ?? true}
          />
          Active
        </label>
        <div className="actions">
          <Button disabled={action.isPending}>Save service</Button>
          {editing && (
            <Button
              type="button"
              className="button-secondary"
              onClick={() => setEditing(null)}
            >
              Cancel edit
            </Button>
          )}
        </div>
      </form>
      <p className="small">
        Services referenced by requests cannot be deleted. Hide them to stop new
        requests while preserving existing work.
      </p>
    </>
  );
}
function Reviews() {
  const query = useRecords('Review'),
    deletion = useAction((id) => remove('Review', id));
  return (
    <>
      <h2>Reviews</h2>
      <Feedback error={deletion.error} />
      <QueryState query={query}>
        {(items) =>
          items.length ? (
            items.map((r) => (
              <article key={r.id}>
                <p className="eyebrow">
                  {r.provider_name} / {r.rating} out of 5
                </p>
                <h3>{r.customer_name}</h3>
                <p>{r.comment}</p>
                <p className="small">
                  {r.tags.join(' · ')} / {date(r.created_date)}
                </p>
                <Button
                  className="button-secondary"
                  disabled={deletion.isPending}
                  onClick={() => deletion.mutate(r.id)}
                >
                  Delete review
                </Button>
              </article>
            ))
          ) : (
            <Empty title="Reviews follow completed work">
              Customers can review a provider after closing their booking.
            </Empty>
          )
        }
      </QueryState>
    </>
  );
}
function People() {
  const { user } = useAuth(),
    query = useQuery({
      queryKey: ['people', user.id],
      queryFn: () => api('marketplace/people'),
    }),
    change = useAction(({ id, role }) =>
      api('marketplace/people/' + id, { method: 'PATCH', body: { role } }),
    ),
    invite = useAction((data) => api('marketplace/invites', { body: data }));
  return (
    <>
      <h2>People</h2>
      <Feedback
        error={query.error || change.error || invite.error}
        notice={invite.data?.message}
      />
      <QueryState query={query}>
        {(items) => (
          <div
            className="table-wrap"
            tabIndex={0}
            role="region"
            aria-label="People register"
          >
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.firstName} {p.lastName}
                    </td>
                    <td>{p.email}</td>
                    <td>
                      <select
                        aria-label={'Role for ' + p.email}
                        value={p.role}
                        disabled={p.id === user.id || change.isPending}
                        onChange={(e) =>
                          change.mutate({ id: p.id, role: e.target.value })
                        }
                      >
                        {['CUSTOMER', 'PROVIDER', 'ADMIN'].map((role) => (
                          <option key={role}>{role}</option>
                        ))}
                      </select>
                    </td>
                    <td>{date(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryState>
      <form
        className="admin-form"
        onSubmit={(e) => {
          e.preventDefault();
          invite.mutate(Object.fromEntries(new FormData(e.currentTarget)));
        }}
      >
        <h3>Invite a person</h3>
        <label>
          Email
          <input name="email" type="email" required />
        </label>
        <label>
          Role
          <select name="role">
            {['CUSTOMER', 'PROVIDER', 'ADMIN'].map((role) => (
              <option key={role}>{role}</option>
            ))}
          </select>
        </label>
        <Button disabled={invite.isPending}>Send invitation</Button>
      </form>
      <p className="small">
        Invitations require configured email delivery. A role change signs out
        the affected account.
      </p>
    </>
  );
}
function Messages() {
  const { user } = useAuth(),
    query = useRecords('Notification'),
    send = useAction((data) => api('marketplace/messages', { body: data })),
    deletion = useAction((id) => remove('Notification', id));
  return (
    <>
      <h2>Messages</h2>
      <Feedback
        error={send.error || deletion.error}
        notice={
          send.data
            ? `Sent to ${send.data.sent} account${send.data.sent === 1 ? '' : 's'}.`
            : ''
        }
      />
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          send.mutate(Object.fromEntries(new FormData(e.currentTarget)));
        }}
      >
        <label>
          Recipient email or all
          <input
            name="recipient"
            required
            placeholder="Email address, or all"
          />
        </label>
        <label>
          Title
          <input name="title" maxLength={200} required />
        </label>
        <label>
          Message
          <textarea name="body" maxLength={3000} required />
        </label>
        <label>
          Record link
          <input
            name="link"
            defaultValue="/dashboard"
            pattern="/[^/].*"
            required
          />
        </label>
        <Button disabled={send.isPending}>Send message</Button>
      </form>
      <h3>Sent messages</h3>
      <QueryState query={query}>
        {(items) => {
          const sent = items.filter(
            (n) => n.created_by_id === user.id && n.type === 'message',
          );
          return sent.length ? (
            <ul className="record-register">
              {sent.map((n) => (
                <li key={n.id}>
                  <strong>{n.title}</strong>
                  <p>
                    {n.user_email} / {n.body}
                  </p>
                  <Button
                    className="button-secondary"
                    disabled={deletion.isPending}
                    onClick={() => deletion.mutate(n.id)}
                  >
                    Delete sent message
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="No messages sent yet">
              Send an in-app message to one account or broadcast to the current
              account register.
            </Empty>
          );
        }}
      </QueryState>
    </>
  );
}
function Audit({ compact = false }) {
  const query = useRecords('AuditLog');
  return (
    <>
      <p className="eyebrow">Immutable activity register</p>
      <h2>{compact ? 'Recent audit' : 'Audit log'}</h2>
      <QueryState query={query}>
        {(items) =>
          items.length ? (
            <div
              className="table-wrap"
              tabIndex={0}
              role="region"
              aria-label="Audit register"
            >
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {(compact ? items.slice(0, 10) : items).map((row) => (
                    <tr key={row.id}>
                      <td>{dateTime(row.created_date)}</td>
                      <td>{row.actor_email ?? 'System'}</td>
                      <td>{row.action}</td>
                      <td>{row.entity_type}</td>
                      <td>
                        {Object.entries(row.detail)
                          .map(([k, v]) => `${k}: ${v ?? '—'}`)
                          .join(' · ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="The audit starts with activity">
              Changes to marketplace records appear here automatically.
            </Empty>
          )
        }
      </QueryState>
    </>
  );
}
function Account() {
  const { user, setUser, logout } = useAuth(),
    update = useAction(async (data) => {
      const account = await api('marketplace/account', {
        method: 'PATCH',
        body: { display_name: data.display_name },
      });
      setUser(account);
    });
  return (
    <>
      <h2>Account</h2>
      <Feedback error={update.error} />
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate(Object.fromEntries(new FormData(e.currentTarget)));
        }}
      >
        <label>
          Display name
          <input
            name="display_name"
            defaultValue={user.firstName}
            maxLength={150}
            required
          />
        </label>
        <p>{user.email}</p>
        <Button disabled={update.isPending}>Save account</Button>
      </form>
      <div className="actions">
        <Link to="/forgot-password">Reset your password</Link>
        <Button className="button-secondary" onClick={() => void logout()}>
          Sign out
        </Button>
      </div>
    </>
  );
}
function Rules() {
  const query = useRecords('PlatformSetting'),
    action = useAction(async (data) => {
      const settings = query.data[0],
        keys = [
          'skills',
          'ratings',
          'experience',
          'credentials',
          'reliability',
          'location',
          'response',
          'recommendations',
        ],
        weights = Object.fromEntries(
          keys.map((key) => [key, Number(data[key])]),
        );
      if (Object.values(weights).reduce((sum, n) => sum + n, 0) !== 100)
        throw new Error('Scoring weights must total 100');
      return save(
        'PlatformSetting',
        {
          commission_pct: Number(data.commission_pct),
          vat_pct: Number(data.vat_pct),
          emergency_cap_pct: Number(data.emergency_cap_pct),
          weights,
          marketplace_city: data.marketplace_city,
          support_email: data.support_email,
          pricing_version: data.pricing_version,
        },
        settings.id,
      );
    });
  return (
    <>
      <h2>Rules & fees</h2>
      <Feedback
        error={action.error}
        notice={
          action.isSuccess
            ? 'Rules saved. New quotes and bookings use the updated configuration.'
            : ''
        }
      />
      <QueryState query={query}>
        {(items) => {
          const cfg = items[0];
          return (
            <form
              className="panel"
              key={cfg.updated_date}
              onSubmit={(e) => {
                e.preventDefault();
                action.mutate(
                  Object.fromEntries(new FormData(e.currentTarget)),
                );
              }}
            >
              <p className="eyebrow">Pricing rules</p>
              <div className="field-grid">
                {[
                  ['commission_pct', 'Commission (%)', 100],
                  ['vat_pct', 'VAT (%)', 100],
                  ['emergency_cap_pct', 'Emergency cap (%)', 1000],
                ].map(([key, title, max]) => (
                  <label key={key}>
                    {title}
                    <input
                      name={key}
                      type="number"
                      min={0}
                      max={max}
                      defaultValue={cfg[key]}
                      required
                    />
                  </label>
                ))}
                <label>
                  Pricing version
                  <input
                    name="pricing_version"
                    defaultValue={cfg.pricing_version}
                    required
                    maxLength={100}
                  />
                </label>
                <label>
                  Home city
                  <select
                    name="marketplace_city"
                    defaultValue={cfg.marketplace_city}
                  >
                    {cities.map((city) => (
                      <option key={city}>{city}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Support email
                  <input
                    name="support_email"
                    type="email"
                    defaultValue={cfg.support_email}
                    required
                  />
                </label>
              </div>
              <h3>Recommendation weights</h3>
              <p className="small">The eight weights must total 100.</p>
              <div className="field-grid">
                {Object.entries(cfg.weights).map(([key, value]) => (
                  <label key={key}>
                    {key}
                    <input
                      name={key}
                      type="number"
                      min={0}
                      max={100}
                      defaultValue={value}
                      required
                    />
                  </label>
                ))}
              </div>
              <Button disabled={action.isPending}>Save rules</Button>
              <p className="read-only-note">
                Commission is deducted from the provider allocation. The
                customer’s agreed amount stays equal to the accepted quote. VAT
                configuration does not add a charge to an accepted quote.
              </p>
            </form>
          );
        }}
      </QueryState>
    </>
  );
}
