'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { BookingTools, SupportDesk } from './operations';
import { OrganisationWorkspace } from './organisations';
import { AdminOperations } from './admin';
import { DraftEditor, type DraftRequest } from './drafts';
type User = { id: string; firstName: string; role: string };
type Category = { id: string; name: string };
type RequestRow = DraftRequest & {
  id: string;
  description: string;
  urgency: string;
  publishedAt: string | null;
  cancelledAt: string | null;
  scheduledAt: string | null;
};
type Bid = {
  id: string;
  totalMinor: string;
  arrivalMinutes: number;
  comment: string;
  provider: { id: string; user: { firstName: string; lastName: string } };
};
type Booking = {
  id: string;
  status: string;
  request: { description: string };
  bid: Bid;
  review: unknown;
};
type Verification = {
  id: string;
  qualification: string;
  verification: string;
  user: { firstName: string; lastName: string };
};
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
function values(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  return Object.fromEntries(new FormData(event.currentTarget));
}
export function Marketplace({
  portal,
}: {
  portal: 'customer' | 'provider' | 'admin' | 'business' | 'enterprise';
}) {
  const [token, setToken] = useState(''),
    [user, setUser] = useState<User | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]),
    [requests, setRequests] = useState<RequestRow[]>([]),
    [bookings, setBookings] = useState<Booking[]>([]),
    [bids, setBids] = useState<Bid[]>([]),
    [selected, setSelected] = useState(''),
    [verifications, setVerifications] = useState<Verification[]>([]),
    [notifications, setNotifications] = useState<
      { id: string; event: string }[]
    >([]),
    [providerStatus, setProviderStatus] = useState('');
  const [scores, setScores] = useState<Record<string, number>>({}),
    [scoringExplanation, setScoringExplanation] = useState('');
  const call = useCallback(
    async <T,>(
      path: string,
      body?: unknown,
      access = token,
      method = 'POST',
    ): Promise<T> => {
      const response = await fetch(apiUrl + '/v1/' + path, {
        method: body === undefined ? 'GET' : method,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Convyn-Client': '1',
          ...(access ? { Authorization: 'Bearer ' + access } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          typeof result.message === 'string'
            ? result.message
            : JSON.stringify(result.message ?? 'Request failed'),
        );
      return result as T;
    },
    [token],
  );
  const refresh = useCallback(async () => {
    if (!user) return;
    setCategories(await call<Category[]>('categories'));
    setNotifications(
      await call<{ id: string; event: string }[]>('notifications'),
    );
    if (user.role === 'ADMIN')
      setVerifications(await call<Verification[]>('admin/verifications'));
    else {
      setBookings(await call<Booking[]>('bookings'));
      if (user.role === 'CUSTOMER')
        setRequests(await call<RequestRow[]>('service-requests'));
      else {
        const profile = await call<{
          verification: string;
          available: boolean;
        }>('providers/me');
        setProviderStatus(profile.verification);
        setRequests(
          profile.verification === 'APPROVED' && profile.available
            ? await call<RequestRow[]>('opportunities')
            : [],
        );
      }
    }
  }, [user, call]);
  useEffect(() => {
    void refresh().catch((e) => setError(String(e.message)));
  }, [refresh]);
  async function action(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }
  async function authenticate(
    event: FormEvent<HTMLFormElement>,
    register: boolean,
  ) {
    const data = values(event);
    await action(async () => {
      const result = await call<{ accessToken: string; user: User }>(
        'auth/' + (register ? 'register' : 'login'),
        register
          ? {
              ...data,
              role: portal === 'provider' ? 'PROVIDER' : 'CUSTOMER',
              consent: data.consent === 'on',
            }
          : {
              email: data.email,
              password: data.password,
            },
      );
      if (
        result.user.role !==
        (['business', 'enterprise'].includes(portal)
          ? 'CUSTOMER'
          : portal.toUpperCase())
      ) {
        await call('auth/logout', {}, result.accessToken);
        throw new Error('Please use the portal for your account role');
      }
      setToken(result.accessToken);
      setUser(result.user);
      setNotice('Signed in');
    });
  }
  if (!user)
    return (
      <section aria-label="Account access">
        <article>
          <h2>Sign in</h2>
          <form onSubmit={(e) => void authenticate(e, false)}>
            <label>
              Email
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <button disabled={busy}>Sign in</button>
          </form>
        </article>
        {(portal === 'customer' || portal === 'provider') && (
          <article>
            <h2>Create {portal} account</h2>
            <form onSubmit={(e) => void authenticate(e, true)}>
              <label>
                First name
                <input name="firstName" autoComplete="given-name" required />
              </label>
              <label>
                Last name
                <input name="lastName" autoComplete="family-name" required />
              </label>
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </label>
              <label>
                Mobile (+27…)
                <input name="mobile" type="tel" autoComplete="tel" required />
              </label>
              <label>
                Password (12+ characters)
                <input
                  name="password"
                  type="password"
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  required
                />
              </label>
              <label>
                <input name="consent" type="checkbox" required /> I consent to
                account data processing.
              </label>
              <button disabled={busy}>Create account</button>
            </form>
          </article>
        )}
        <p role="alert">{error}</p>
      </section>
    );
  return (
    <div>
      <div className="toolbar">
        <h2>Welcome, {user.firstName}</h2>
        <button disabled={busy} onClick={() => void action(refresh)}>
          Refresh
        </button>
        <button
          disabled={busy}
          onClick={() =>
            void action(async () => {
              await call('auth/logout', {});
              setUser(null);
              setToken('');
              setRequests([]);
              setBookings([]);
              setBids([]);
              setNotifications([]);
              setVerifications([]);
            })
          }
        >
          Sign out
        </button>
      </div>
      <p role="alert">{error}</p>
      <p role="status">{notice}</p>
      <p>
        Development marketplace · online payments, document verification and
        email delivery are not integrated.
      </p>
      {portal === 'customer' && (
        <article>
          <h2>Request a service</h2>
          <form
            onSubmit={(e) => {
              const intent = (
                (e.nativeEvent as SubmitEvent)
                  .submitter as HTMLButtonElement | null
              )?.value;
              const data = values(e);
              const { scheduledAt, ...rest } = data;
              void action(async () => {
                await call(
                  intent === 'draft'
                    ? 'service-request-drafts'
                    : 'service-requests',
                  {
                    ...rest,
                    ...(scheduledAt
                      ? {
                          scheduledAt: new Date(
                            String(scheduledAt),
                          ).toISOString(),
                        }
                      : {}),
                    latitude: Number(data.latitude),
                    longitude: Number(data.longitude),
                  },
                );
                setNotice(
                  intent === 'draft'
                    ? 'Draft saved'
                    : 'Service request published',
                );
                await refresh();
              });
            }}
          >
            <label>
              Category
              <select aria-label="Category" name="categoryId" required>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Describe the work
              <textarea
                name="description"
                minLength={20}
                maxLength={5000}
                required
              />
            </label>
            <label>
              Urgency
              <select name="urgency">
                <option>STANDARD</option>
                <option>URGENT</option>
                <option>EMERGENCY</option>
              </select>
            </label>
            <label>
              Latitude
              <input
                name="latitude"
                type="number"
                step="any"
                min={-90}
                max={90}
                defaultValue={-33.96}
                required
              />
            </label>
            <label>
              Longitude
              <input
                name="longitude"
                type="number"
                step="any"
                min={-180}
                max={180}
                defaultValue={25.6}
                required
              />
            </label>
            <label>
              Scheduled service time (optional)
              <input name="scheduledAt" type="datetime-local" />
            </label>
            <label>
              Additional instructions
              <textarea name="instructions" maxLength={2000} />
            </label>
            <button disabled={busy} value="publish">
              Publish request
            </button>
            <button disabled={busy} value="draft" formNoValidate>
              Save draft
            </button>
          </form>
        </article>
      )}
      {portal === 'customer' && (
        <article>
          <h2>Saved request drafts</h2>
          {requests
            .filter((request) => !request.publishedAt && !request.cancelledAt)
            .map((request) => (
              <DraftEditor
                key={request.id}
                request={request}
                categories={categories}
                call={call}
                onChange={refresh}
              />
            ))}
        </article>
      )}
      {portal === 'provider' && (
        <article>
          <h2>Provider verification</h2>
          <p>Status: {providerStatus}</p>
          <form
            onSubmit={(e) => {
              const data = values(e);
              void action(async () => {
                await call('providers/verification', {
                  qualification: data.qualification,
                  categories: [data.categoryId],
                  radiusKm: Number(data.radiusKm),
                  latitude: Number(data.latitude),
                  longitude: Number(data.longitude),
                });
                setNotice('Verification submitted for review');
                await refresh();
              });
            }}
          >
            <label>
              Qualification details
              <textarea name="qualification" minLength={20} required />
            </label>
            <label>
              Category
              <select aria-label="Category" name="categoryId">
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Radius (km)
              <input
                name="radiusKm"
                type="number"
                min={1}
                max={200}
                defaultValue={30}
              />
            </label>
            <label>
              Latitude
              <input
                name="latitude"
                type="number"
                step="any"
                defaultValue={-33.96}
              />
            </label>
            <label>
              Longitude
              <input
                name="longitude"
                type="number"
                step="any"
                defaultValue={25.6}
              />
            </label>
            <button
              disabled={
                busy ||
                !['DRAFT', 'MORE_INFORMATION_REQUIRED', 'REJECTED'].includes(
                  providerStatus,
                )
              }
            >
              Submit for review
            </button>
          </form>
          <button
            disabled={busy || providerStatus !== 'APPROVED'}
            onClick={() =>
              void action(async () => {
                await call(
                  'providers/availability',
                  { available: true },
                  token,
                  'PATCH',
                );
                await refresh();
                setNotice('You are online');
              })
            }
          >
            Go online
          </button>
          <button
            disabled={busy || providerStatus !== 'APPROVED'}
            onClick={() =>
              void action(async () => {
                await call(
                  'providers/availability',
                  { available: false },
                  token,
                  'PATCH',
                );
                await refresh();
                setNotice('You are offline');
              })
            }
          >
            Go offline
          </button>
        </article>
      )}
      {portal === 'admin' && (
        <section aria-label="Verification queue">
          {verifications.map((v) => (
            <article key={v.id}>
              <h3>
                {v.user.firstName} {v.user.lastName}
              </h3>
              <p>{v.qualification}</p>
              <p>{v.verification}</p>
              {[
                'UNDER_REVIEW',
                'MORE_INFORMATION_REQUIRED',
                'APPROVED',
                'REJECTED',
              ].map((status) => (
                <button
                  disabled={busy}
                  key={status}
                  onClick={() =>
                    void action(async () => {
                      await call('admin/verifications/' + v.id, { status });
                      await refresh();
                    })
                  }
                >
                  {status.replaceAll('_', ' ')}
                </button>
              ))}
            </article>
          ))}
        </section>
      )}
      {(portal === 'customer' || portal === 'provider') && (
        <>
          <h2>
            {portal === 'customer' ? 'Your requests' : 'Eligible opportunities'}
          </h2>
          {requests.length === 0 && <p>No requests to show.</p>}
          <section>
            {requests
              .filter(
                (request) =>
                  portal === 'provider' ||
                  (request.publishedAt && !request.cancelledAt),
              )
              .map((request) => (
                <article key={request.id}>
                  <h3>{request.description}</h3>
                  <p>{request.urgency}</p>
                  {portal === 'customer' ? (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          setSelected(request.id);
                          setBids(
                            await call<Bid[]>(
                              'service-requests/' + request.id + '/bids',
                            ),
                          );
                          const ranking = await call<{
                            providers: { id: string; score: number }[];
                            explanation: string;
                          }>(
                            'service-requests/' +
                              request.id +
                              '/recommendations',
                          );
                          setScores(
                            Object.fromEntries(
                              ranking.providers.map((provider) => [
                                provider.id,
                                provider.score,
                              ]),
                            ),
                          );
                          setScoringExplanation(ranking.explanation);
                        })
                      }
                    >
                      Compare bids
                    </button>
                  ) : (
                    <form
                      onSubmit={(e) => {
                        const data = values(e);
                        void action(async () => {
                          await call(
                            'service-requests/' + request.id + '/bids',
                            {
                              totalMinor: Number(data.totalMinor),
                              arrivalMinutes: Number(data.arrivalMinutes),
                              comment: data.comment,
                              expiresAt: new Date(
                                Date.now() + 3600000,
                              ).toISOString(),
                            },
                          );
                          setNotice('Bid submitted, valid for one hour');
                        });
                      }}
                    >
                      <label>
                        Total quote (ZAR cents)
                        <input
                          name="totalMinor"
                          type="number"
                          min={1}
                          max={100000000}
                          required
                        />
                      </label>
                      <label>
                        Arrival in minutes
                        <input
                          name="arrivalMinutes"
                          type="number"
                          min={1}
                          max={10080}
                          required
                        />
                      </label>
                      <label>
                        Quote explanation
                        <textarea name="comment" minLength={5} required />
                      </label>
                      <button disabled={busy}>Submit bid</button>
                    </form>
                  )}
                </article>
              ))}
          </section>
        </>
      )}
      {selected && portal === 'customer' && (
        <>
          <h2>Compare bids</h2>
          <p>{scoringExplanation}</p>
          {bids.length === 0 && <p>No valid bids yet.</p>}
          <section>
            {bids.map((bid) => (
              <article key={bid.id}>
                <h3>
                  {bid.provider.user.firstName} {bid.provider.user.lastName}
                </h3>
                <p>
                  {new Intl.NumberFormat('en-ZA', {
                    style: 'currency',
                    currency: 'ZAR',
                  }).format(Number(bid.totalMinor) / 100)}
                </p>
                <p>Arrival: {bid.arrivalMinutes} minutes</p>
                {scores[bid.provider.id] !== undefined && (
                  <p>
                    Advisory suitability: {scores[bid.provider.id].toFixed(1)} /
                    100
                  </p>
                )}
                <p>{bid.comment}</p>
                <button
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      await call('bids/' + bid.id + '/accept', {});
                      setBids([]);
                      setSelected('');
                      setNotice(
                        'Booking created. No online payment has been taken.',
                      );
                      await refresh();
                    })
                  }
                >
                  Accept quotation
                </button>
              </article>
            ))}
          </section>
        </>
      )}
      {(portal === 'customer' || portal === 'provider') && (
        <>
          <h2>Your bookings</h2>
          <section>
            {bookings.map((booking) => (
              <article key={booking.id}>
                <h3>{booking.request.description}</h3>
                <p>{booking.status.replaceAll('_', ' ')}</p>
                {portal === 'provider' &&
                  ['CONFIRMED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'].includes(
                    booking.status,
                  ) && (
                    <form
                      onSubmit={(e) => {
                        const data = values(e);
                        const next: Record<string, string> = {
                          CONFIRMED: 'EN_ROUTE',
                          EN_ROUTE: 'ARRIVED',
                          ARRIVED: 'IN_PROGRESS',
                          IN_PROGRESS: 'AWAITING_CONFIRMATION',
                        };
                        void action(async () => {
                          await call('bookings/' + booking.id + '/status', {
                            status: next[booking.status],
                            ...(data.completionNote
                              ? { completionNote: data.completionNote }
                              : {}),
                          });
                          await refresh();
                        });
                      }}
                    >
                      {booking.status === 'IN_PROGRESS' && (
                        <label>
                          Completion details
                          <textarea
                            name="completionNote"
                            minLength={10}
                            required
                          />
                        </label>
                      )}
                      <button disabled={busy}>Advance job</button>
                    </form>
                  )}
                {portal === 'customer' &&
                  booking.status === 'AWAITING_CONFIRMATION' && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          await call('bookings/' + booking.id + '/status', {
                            status: 'COMPLETED',
                          });
                          await refresh();
                        })
                      }
                    >
                      Confirm completion
                    </button>
                  )}
                {portal === 'customer' &&
                  booking.status === 'COMPLETED' &&
                  !booking.review && (
                    <form
                      onSubmit={(e) => {
                        const data = values(e);
                        void action(async () => {
                          await call('bookings/' + booking.id + '/reviews', {
                            rating: Number(data.rating),
                            comment: data.comment,
                          });
                          await refresh();
                        });
                      }}
                    >
                      <label>
                        Rating
                        <select name="rating">
                          {[5, 4, 3, 2, 1].map((n) => (
                            <option key={n}>{n}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Review
                        <textarea name="comment" minLength={5} required />
                      </label>
                      <button disabled={busy}>Submit review</button>
                    </form>
                  )}
                <BookingTools
                  bookingId={booking.id}
                  status={booking.status}
                  role={portal}
                  userId={user.id}
                  token={token}
                  call={call}
                  onChange={refresh}
                />
              </article>
            ))}
          </section>
        </>
      )}
      {portal === 'business' || portal === 'enterprise' ? (
        <OrganisationWorkspace
          call={call}
          kind={portal === 'enterprise' ? 'ENTERPRISE' : 'BUSINESS'}
        />
      ) : null}
      {portal === 'admin' && <AdminOperations call={call} />}
      <SupportDesk call={call} />
      <h2>Notifications</h2>
      <ul>
        {notifications.map((n) => (
          <li key={n.id}>{n.event.split(':')[0].replaceAll('_', ' ')}</li>
        ))}
      </ul>
    </div>
  );
}
