import { Button } from '../components/ui/button';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowUpRight, Search, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth';
import { api, age, money } from '../lib';
import {
  BrandLogo,
  categoryIcons,
  Empty,
  Feedback,
  Footer,
  Intro,
  ProviderCard,
  PublicHeader,
  QueryState,
  useAction,
  useRecords,
} from '../components/shared';
export function Home() {
  const categories = useRecords('ServiceCategory'),
    ticker = useQuery({
      queryKey: ['public-ticker'],
      queryFn: () => api('marketplace/ticker'),
      refetchInterval: 15000,
    }),
    providers = useRecords('ProviderProfile');
  return (
    <>
      <PublicHeader />
      <main className="public-main">
        <section className="landing-hero">
          <div>
            <p className="eyebrow">South Africa / Professional services</p>
            <h1>
              YOUR WORLD.
              <br />
              ON DEMAND.
            </h1>
            <p>
              Describe the job. Compare quotes from verified professionals.
              Choose the right person for the work.
            </p>
            <div className="actions">
              <Link className="button button-primary" to="/requests/new">
                Request a service <ArrowUpRight size={16} />
              </Link>
              <Link to="/providers">Meet the providers</Link>
            </div>
          </div>
          <aside className="hero-summary">
            <p className="eyebrow">A clear next step</p>
            <h2>
              Expert help.
              <br />
              Your choice.
            </h2>
            <p>
              Electrical faults, burst pipes, a deep clean or a small repair.
              Start with what you need, then compare the details before you
              decide.
            </p>
            <div>
              <ShieldCheck size={24} />
              <p>
                Provider verification is reviewed before quoting is enabled.
              </p>
            </div>
            <p className="hero-caption">
              Gqeberha · East London · Cape Town · Durban · Johannesburg ·
              Pretoria
            </p>
          </aside>
        </section>
        <div className="ticker" aria-label="Live request activity">
          <strong>LIVE REQUESTS</strong>
          {ticker.data?.length ? (
            ticker.data.map((r, i) => (
              <span key={i}>
                {r.category_name} / {r.city} / {age(r.created_date)}
              </span>
            ))
          ) : (
            <span>
              New service requests will appear here as customers publish them.
            </span>
          )}
        </div>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Find your service</p>
            <h2>What needs doing?</h2>
          </div>
          <span className="small">
            {categories.data?.filter((c) => c.active).length ?? 0} active
            services
          </span>
        </div>
        <QueryState query={categories}>
          {(items) => (
            <div className="category-grid">
              {items
                .filter((category) => category.active)
                .map((category) => {
                  const Icon = categoryIcons[category.slug] ?? Search;
                  return (
                    <Link
                      to={'/requests/new?category=' + category.slug}
                      className="category-tile"
                      key={category.id}
                    >
                      <Icon size={28} />
                      <h3>{category.name}</h3>
                      <p>{category.blurb}</p>
                      <small>
                        Callout from {money(category.callout_fee_cents)}
                      </small>
                    </Link>
                  );
                })}
            </div>
          )}
        </QueryState>
        <div className="section-heading">
          <div>
            <p className="eyebrow">How it works</p>
            <h2>From request to resolved.</h2>
          </div>
        </div>
        <div className="how-grid">
          <div>
            <p className="eyebrow">01 / Describe</p>
            <h3>Tell us what you need.</h3>
            <p>
              Add your service, location and the details that help a
              professional quote accurately.
            </p>
          </div>
          <div>
            <p className="eyebrow">02 / Compare</p>
            <h3>Choose your provider.</h3>
            <p>
              Compare the price, arrival time, warranty and recommendation
              breakdown.
            </p>
          </div>
          <div>
            <p className="eyebrow">03 / Complete</p>
            <h3>Keep every step clear.</h3>
            <p>
              Follow the booking, confirm the work is complete and share your
              review.
            </p>
          </div>
        </div>
        <section className="portal-band">
          <div>
            <p className="eyebrow">For professionals</p>
            <h2>
              Your skills.
              <br />
              In demand.
            </h2>
            <p>
              Build your profile, submit verification and quote on work in your
              service area.
            </p>
          </div>
          <div>
            <p>
              {providers.data?.length ?? 0} approved profiles currently listed.
            </p>
            <Link className="button header-action" to="/provider/onboarding">
              Become a provider <ArrowUpRight size={16} />
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
export function Directory() {
  const query = useRecords('ProviderProfile'),
    [search, setSearch] = useState('');
  return (
    <>
      <PublicHeader />
      <main className="public-main">
        <Intro
          eyebrow="CONVYN / Provider directory"
          title="The people behind the work."
        >
          Explore approved providers and the services they offer.
        </Intro>
        <label>
          Search providers
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, service or city"
          />
        </label>
        <QueryState query={query}>
          {(items) => {
            const filtered = items.filter((p) =>
              (p.display_name + ' ' + p.city + ' ' + p.category_slugs.join(' '))
                .toLowerCase()
                .includes(search.toLowerCase()),
            );
            return filtered.length ? (
              <div className="record-grid">
                {filtered.map((p) => (
                  <ProviderCard key={p.id} provider={p} />
                ))}
              </div>
            ) : (
              <Empty title="No matching providers">
                Try another name, service or city. Approved profiles appear here
                after review.
              </Empty>
            );
          }}
        </QueryState>
      </main>
      <Footer />
    </>
  );
}
export function AuthPage({ mode }) {
  const { login, register, user } = useAuth(),
    navigate = useNavigate(),
    location = useLocation();
  const [token] = useState(
    () =>
      new URLSearchParams(window.location.hash.slice(1)).get(
        mode === 'register' ? 'invite' : 'token',
      ) ?? '',
  );
  const [notice, setNotice] = useState('');
  const integrations = useQuery({
    queryKey: ['integrations'],
    queryFn: () => api('marketplace/integrations'),
  });
  useEffect(() => {
    if (location.hash)
      window.history.replaceState({}, '', location.pathname + location.search);
  }, [location.hash, location.pathname, location.search]);
  const mutation = useAction(async (data) => {
    setNotice('');
    if (mode === 'login') {
      const account = await login(data.email, data.password);
      navigate(
        location.state?.from ??
          (account.role === 'ADMIN'
            ? '/admin'
            : account.role === 'PROVIDER'
              ? '/provider'
              : '/dashboard'),
      );
    } else if (mode === 'register') {
      if (data.password !== data.confirm)
        throw new Error('Passwords must match');
      const account = await register({
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        mobile: data.mobile,
        password: data.password,
        consent: data.consent === 'on',
        role: data.role,
        ...(token ? { invite: token } : {}),
      });
      navigate(
        account.role === 'PROVIDER'
          ? '/provider/onboarding'
          : account.role === 'ADMIN'
            ? '/admin'
            : '/dashboard',
      );
    } else if (mode === 'forgot-password') {
      const result = await api('marketplace/auth/forgot-password', {
        body: { email: data.email },
      });
      setNotice(result.message);
    } else {
      if (data.password !== data.confirm)
        throw new Error('Passwords must match');
      const result = await api('marketplace/auth/reset-password', {
        body: { token, password: data.password },
      });
      setNotice(result.message);
    }
  });
  const titles = {
    login: 'Sign in',
    register: 'Create your account',
    'forgot-password': 'Reset your password',
    'reset-password': 'Choose a new password',
  };
  return (
    <>
      <PublicHeader />
      <main className="auth-layout">
        <aside className="auth-editorial">
          <p className="eyebrow">CONVYN / Your account</p>
          <h1>
            YOUR WORLD.
            <br />
            ON DEMAND.
          </h1>
          <p>One account. A clear next step.</p>
          <div className="auth-context">
            <BrandLogo outline />
            <p className="eyebrow">South Africa / Professional services</p>
          </div>
        </aside>
        <div className="auth-forms">
          <p className="eyebrow">Secure access</p>
          <h2>{titles[mode]}</h2>
          {user && (
            <p>
              Signed in as {user.email}.{' '}
              <Link to="/dashboard">Open your workspace</Link>
            </p>
          )}
          <Feedback error={mutation.error} notice={notice} />
          {mode === 'reset-password' && !token ? (
            <Empty title="Open your reset link">
              Use the password reset link sent to your email.{' '}
              <Link to="/forgot-password">Request a new link</Link>.
            </Empty>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                mutation.mutate(
                  Object.fromEntries(new FormData(event.currentTarget)),
                );
              }}
            >
              {mode === 'register' && (
                <>
                  <div className="field-grid">
                    <label>
                      First name
                      <input
                        name="firstName"
                        autoComplete="given-name"
                        required
                        maxLength={80}
                      />
                    </label>
                    <label>
                      Last name
                      <input
                        name="lastName"
                        autoComplete="family-name"
                        required
                        maxLength={80}
                      />
                    </label>
                  </div>
                  <label>
                    Mobile (+27…)
                    <input
                      name="mobile"
                      type="tel"
                      autoComplete="tel"
                      pattern="\+[1-9][0-9]{7,14}"
                      required
                    />
                  </label>
                  <label>
                    Account type
                    <select name="role">
                      <option value="CUSTOMER">Customer</option>
                      <option value="PROVIDER">Provider</option>
                    </select>
                  </label>
                </>
              )}
              {mode !== 'reset-password' && (
                <label>
                  Email
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                  />
                </label>
              )}
              {mode !== 'forgot-password' && (
                <label>
                  {mode === 'reset-password'
                    ? 'New password (16+ characters)'
                    : 'Password'}
                  <input
                    name="password"
                    type="password"
                    autoComplete={
                      mode === 'login' ? 'current-password' : 'new-password'
                    }
                    minLength={
                      mode === 'login'
                        ? undefined
                        : mode === 'register'
                          ? 12
                          : 16
                    }
                    maxLength={128}
                    required
                  />
                </label>
              )}
              {['register', 'reset-password'].includes(mode) && (
                <label>
                  Confirm password
                  <input
                    name="confirm"
                    type="password"
                    autoComplete="new-password"
                    required
                  />
                </label>
              )}
              {mode === 'register' && (
                <label className="check-label">
                  <input type="checkbox" name="consent" required />I consent to
                  processing my account and service-request information.
                </label>
              )}
              <Button
                disabled={
                  mutation.isPending ||
                  (mode === 'forgot-password' &&
                    integrations.data?.email === false)
                }
              >
                {mutation.isPending ? 'Please wait…' : titles[mode]}
              </Button>
            </form>
          )}
          {mode === 'forgot-password' && integrations.data?.email === false && (
            <p className="small">
              Password recovery email is not available yet. Contact support for
              account recovery.
            </p>
          )}
          {['login', 'register'].includes(mode) && (
            <>
              <div className="actions">
                <Button
                  className="button-secondary"
                  disabled={!integrations.data?.google}
                  onClick={() => {
                    localStorage.setItem('convyn-session', '1');
                    window.location.assign('/v1/marketplace/auth/google/start');
                  }}
                >
                  Continue with Google
                </Button>
              </div>
              {!integrations.data?.google && (
                <p className="small">Google sign-in is not available yet.</p>
              )}
              {
                <p className="small">
                  Continuing with Google also confirms your consent to account
                  information processing.
                </p>
              }
            </>
          )}
          <div className="actions">
            {mode !== 'login' && <Link to="/login">Sign in</Link>}
            {mode === 'login' && (
              <>
                <Link to="/register">Create an account</Link>
                <Link to="/forgot-password">Forgot password?</Link>
              </>
            )}
          </div>
          <p className="auth-security">
            Use a unique password and sign out on shared devices.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
export function NotFound() {
  return (
    <>
      <PublicHeader />
      <main className="public-main">
        <Intro
          eyebrow="404 / Page not found"
          title="Let’s get you back on track."
        >
          This address does not match a CONVYN page.
        </Intro>
        <Link className="button" to="/">
          Return home
        </Link>
      </main>
      <Footer />
    </>
  );
}
