'use client';
import { useEffect, useState } from 'react';
import type { ApiCall } from './operations';
import { MetricsStrip, StatusLabel } from './shell';
import { EmptyState } from './empty-state';
import { RecordTable } from './record-table';
type Organisation = {
  id: string;
  name: string;
  kind: string;
  spendingLimitMinor: string;
};
type Detail = Organisation & {
  locations: { id: string; name: string; address: string }[];
  costCentres: { id: string; code: string; name: string }[];
  departments: { id: string; name: string }[];
  contracts: { id: string; name: string; responseMinutes: number }[];
  members: { role: string; user: { id: string; email: string } }[];
};
type RequestRow = {
  id: string;
  description: string;
  approval: {
    id: string;
    budgetMinor: string;
    status: string;
    purchaseOrder: string;
  };
};
function FieldsForm({
  title,
  fields,
  onSubmit,
}: {
  title: string;
  fields: { name: string; label: string; type?: string; value?: string }[];
  onSubmit: (data: Record<string, FormDataEntryValue>) => Promise<void>;
}) {
  return (
    <article>
      <h3>{title}</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit(Object.fromEntries(new FormData(e.currentTarget)));
        }}
      >
        {fields.map((field) => (
          <label key={field.name}>
            {field.label}
            <input
              name={field.name}
              type={field.type ?? 'text'}
              defaultValue={field.value}
              required
            />
          </label>
        ))}
        <button>{title}</button>
      </form>
    </article>
  );
}
export function OrganisationWorkspace({
  call,
  kind,
}: {
  call: ApiCall;
  kind: 'BUSINESS' | 'ENTERPRISE';
}) {
  const [memberships, setMemberships] = useState<
      { role: string; organisation: Organisation }[]
    >([]),
    [selected, setSelected] = useState(''),
    [detail, setDetail] = useState<Detail | null>(null),
    [requests, setRequests] = useState<RequestRow[]>([]),
    [categories, setCategories] = useState<{ id: string; name: string }[]>([]),
    [error, setError] = useState(''),
    [report, setReport] = useState<{
      requestCount: number;
      approvedBudgetMinor: string;
      invoicedMinor: string;
    } | null>(null);
  const role = memberships.find((m) => m.organisation.id === selected)?.role;
  const manage = role === 'OWNER' || role === 'ADMIN',
    approve = manage || role === 'APPROVER';
  async function load(organisationId = selected) {
    setMemberships(await call('organisations'));
    setCategories(await call('categories'));
    if (organisationId) {
      setDetail(await call('organisations/' + organisationId));
      setRequests(await call('organisations/' + organisationId + '/requests'));
    }
  }
  async function act(work: () => Promise<void>) {
    setError('');
    try {
      await work();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operation failed');
    }
  }
  useEffect(() => {
    void call<typeof memberships>('organisations')
      .then(setMemberships)
      .catch((e) => setError(e.message));
  }, [call]);
  return (
    <div id="organisation">
      <h2>
        {kind === 'ENTERPRISE'
          ? 'Enterprise operations'
          : 'Business operations'}
      </h2>
      <p>
        Organisation-scoped procurement, approval and reporting. All financial
        totals are uncollected quotation/invoice amounts.
      </p>
      <FieldsForm
        title="Create organisation"
        fields={[{ name: 'name', label: 'Organisation name' }]}
        onSubmit={(data) =>
          act(async () => {
            const created = await call<Organisation>('organisations', {
              ...data,
              kind,
            });
            setSelected(created.id);
            await load(created.id);
          })
        }
      />
      <label>
        Choose organisation
        <select
          value={selected}
          onChange={(e) => {
            const value = e.target.value;
            setSelected(value);
            setReport(null);
            void load(value).catch((e) => setError(e.message));
          }}
        >
          <option value="">Select an organisation</option>
          {memberships.map((m) => (
            <option key={m.organisation.id} value={m.organisation.id}>
              {m.organisation.name} · {m.role}
            </option>
          ))}
        </select>
      </label>
      {!detail && (
        <div className="organisation-empty">
          <EmptyState title="Choose your organisation">
            Create an organisation or select one you belong to. Your team,
            procurement and service commitments will appear below.
          </EmptyState>
          <p id="team">Team and locations require a selected organisation.</p>
          <p id="procurement">
            Select an organisation to view procurement requests.
          </p>
          <p id="budgets">Select an organisation to view cost centres.</p>
          <p id="reports">Select an organisation to view reports.</p>
          <p id="contracts">
            Select an organisation to view contracts and SLA targets.
          </p>
        </div>
      )}
      {detail && (
        <>
          <h2>{detail.name}</h2>
          <MetricsStrip
            items={[
              { label: 'Team members', value: detail.members.length },
              { label: 'Service locations', value: detail.locations.length },
              { label: 'Cost centres', value: detail.costCentres.length },
              { label: 'Requests', value: requests.length },
            ]}
          />
          <p>
            Your role: {role} · Request spending limit:{' '}
            {detail.spendingLimitMinor} ZAR cents
          </p>
          {manage && (
            <section>
              <FieldsForm
                title="Add registered employee"
                fields={[
                  { name: 'email', label: 'Employee email', type: 'email' },
                ]}
                onSubmit={(data) =>
                  act(async () => {
                    await call('organisations/' + selected + '/members', {
                      ...data,
                      role: 'MEMBER',
                    });
                  })
                }
              />
              <FieldsForm
                title="Create department"
                fields={[{ name: 'name', label: 'Department name' }]}
                onSubmit={(data) =>
                  act(async () => {
                    await call(
                      'organisations/' + selected + '/departments',
                      data,
                    );
                  })
                }
              />
              <FieldsForm
                title="Create cost centre"
                fields={[
                  { name: 'code', label: 'Cost centre code' },
                  { name: 'name', label: 'Cost centre name' },
                ]}
                onSubmit={(data) =>
                  act(async () => {
                    await call(
                      'organisations/' + selected + '/cost-centres',
                      data,
                    );
                  })
                }
              />
              <FieldsForm
                title="Add service location"
                fields={[
                  { name: 'name', label: 'Location name' },
                  { name: 'address', label: 'Street address' },
                  {
                    name: 'latitude',
                    label: 'Location latitude',
                    value: '-33.96',
                  },
                  {
                    name: 'longitude',
                    label: 'Location longitude',
                    value: '25.60',
                  },
                ]}
                onSubmit={(data) =>
                  act(async () => {
                    await call('organisations/' + selected + '/locations', {
                      ...data,
                      latitude: Number(data.latitude),
                      longitude: Number(data.longitude),
                    });
                  })
                }
              />
            </section>
          )}
          <h3 id="team">Employees</h3>
          <ul className="record-register">
            {detail.members.map((m) => (
              <li key={m.user.id}>
                {m.user.email} · {m.role}
              </li>
            ))}
          </ul>
          <h3>Departments</h3>
          <ul className="record-register">
            {detail.departments.map((d) => (
              <li key={d.id}>{d.name}</li>
            ))}
          </ul>
          <h3>Service locations</h3>
          <ul className="record-register">
            {detail.locations.map((l) => (
              <li key={l.id}>
                {l.name} · {l.address}
              </li>
            ))}
          </ul>
          <h3 id="budgets">Cost centres</h3>
          <RecordTable
            caption="Organisation cost centre register"
            headings={['Code', 'Cost centre']}
          >
            {detail.costCentres.map((centre) => (
              <tr key={centre.id}>
                <td>{centre.code}</td>
                <td>{centre.name}</td>
              </tr>
            ))}
            {detail.costCentres.length === 0 && (
              <tr>
                <td colSpan={2}>
                  No cost centres yet. An organisation owner or administrator
                  can add one.
                </td>
              </tr>
            )}
          </RecordTable>
          {detail.locations.length > 0 && detail.costCentres.length > 0 && (
            <article>
              <h3>Create procurement request</h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = Object.fromEntries(
                    new FormData(e.currentTarget),
                  );
                  void act(async () => {
                    await call('organisations/' + selected + '/requests', {
                      ...data,
                      budgetMinor: Number(data.budgetMinor),
                    });
                  });
                }}
              >
                <label>
                  Service category
                  <select name="categoryId">
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Service location
                  <select name="locationId">
                    {detail.locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Cost centre
                  <select name="costCentreId">
                    {detail.costCentres.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} · {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Service description
                  <textarea name="description" minLength={20} required />
                </label>
                <label>
                  Maximum approved quote (ZAR cents)
                  <input name="budgetMinor" type="number" min={1} required />
                </label>
                <label>
                  Purchase order reference
                  <input name="purchaseOrder" minLength={3} required />
                </label>
                <button>Submit for approval</button>
              </form>
            </article>
          )}
          <h3 id="procurement">Procurement requests</h3>
          <section>
            {requests.map((request) => (
              <article key={request.id}>
                <h4>{request.description}</h4>
                <p>
                  {request.approval.purchaseOrder} ·{' '}
                  <StatusLabel>{request.approval.status}</StatusLabel> · Budget{' '}
                  {request.approval.budgetMinor} cents
                </p>
                {approve &&
                  request.approval.status === 'PENDING' &&
                  ['APPROVED', 'REJECTED'].map((decision) => (
                    <button
                      key={decision}
                      onClick={() =>
                        void act(async () => {
                          await call(
                            'organisations/' +
                              selected +
                              '/approvals/' +
                              request.approval.id,
                            { decision },
                          );
                        })
                      }
                    >
                      {decision === 'APPROVED'
                        ? 'Approve request'
                        : 'Reject request'}
                    </button>
                  ))}
              </article>
            ))}
          </section>
          {manage && (
            <FieldsForm
              title="Register service contract"
              fields={[
                { name: 'name', label: 'Contract name' },
                { name: 'terms', label: 'Contract terms' },
                {
                  name: 'startsAt',
                  label: 'Contract start',
                  type: 'datetime-local',
                },
                {
                  name: 'endsAt',
                  label: 'Contract end',
                  type: 'datetime-local',
                },
                {
                  name: 'responseMinutes',
                  label: 'SLA response minutes',
                  type: 'number',
                },
                {
                  name: 'escalationEmail',
                  label: 'Escalation email',
                  type: 'email',
                },
              ]}
              onSubmit={(data) =>
                act(async () => {
                  await call('organisations/' + selected + '/contracts', {
                    ...data,
                    startsAt: new Date(String(data.startsAt)).toISOString(),
                    endsAt: new Date(String(data.endsAt)).toISOString(),
                    responseMinutes: Number(data.responseMinutes),
                  });
                })
              }
            />
          )}
          <h3 id="contracts">Contracts and SLA targets</h3>
          <ul className="record-register">
            {detail.contracts.map((c) => (
              <li key={c.id}>
                {c.name} · Response target {c.responseMinutes} minutes
                (automatic escalation not integrated)
              </li>
            ))}
          </ul>
          <section id="reports" aria-label="Organisation reports">
            <h3>Reports</h3>
            {!approve && (
              <p>Your organisation role does not grant report access.</p>
            )}
            {approve && (
              <>
                <button
                  onClick={() =>
                    void act(async () => {
                      setReport(
                        await call('organisations/' + selected + '/report'),
                      );
                    })
                  }
                >
                  Load organisation report
                </button>
                {report && (
                  <dl>
                    <dt>Requests</dt>
                    <dd>{report.requestCount}</dd>
                    <dt>Approved budget (cents)</dt>
                    <dd>{report.approvedBudgetMinor}</dd>
                    <dt>Issued, unpaid invoices (cents)</dt>
                    <dd>{report.invoicedMinor}</dd>
                  </dl>
                )}
              </>
            )}
          </section>
        </>
      )}
      <p role="alert">{error}</p>
    </div>
  );
}
