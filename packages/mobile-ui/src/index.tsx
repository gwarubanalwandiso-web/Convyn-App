import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Button,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';
import { createApiClient } from '@convyn/api-client';
type User = { id: string; role: string; firstName: string };
type Category = { id: string; name: string };
type ServiceRequest = {
  id: string;
  description: string;
  publishedAt: string | null;
  cancelledAt: string | null;
};
type Bid = {
  id: string;
  totalMinor: string;
  arrivalMinutes: number;
  provider: { user: { firstName: string; lastName: string } };
};
type Booking = {
  id: string;
  status: string;
  request: { description: string };
  bid: Bid;
  review: unknown;
};
type Message = { id: string; senderId: string; text: string };
const styles = StyleSheet.create({
  page: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 64,
    backgroundColor: '#fafafa',
    gap: 16,
  },
  heading: { fontSize: 30, fontWeight: '700', color: '#111' },
  subheading: { fontSize: 21, fontWeight: '600', color: '#111' },
  card: {
    padding: 16,
    gap: 12,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  input: {
    borderWidth: 1,
    borderColor: '#777',
    padding: 12,
    borderRadius: 6,
    color: '#111',
    backgroundColor: '#fff',
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  error: { color: '#a00' },
  text: { color: '#111' },
});
function Input({
  label,
  value,
  onChange,
  secret = false,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  secret?: boolean;
  multiline?: boolean;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.text}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        secureTextEntry={secret}
        multiline={multiline}
        autoCapitalize="none"
        style={styles.input}
      />
    </View>
  );
}
export function NativeMarketplace({ role }: { role: 'CUSTOMER' | 'PROVIDER' }) {
  const [token, setToken] = useState(''),
    [user, setUser] = useState<User | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [register, setRegister] = useState(false),
    [tab, setTab] = useState('Home');
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [firstName, setFirstName] = useState(''),
    [lastName, setLastName] = useState(''),
    [mobile, setMobile] = useState(''),
    [consent, setConsent] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]),
    [categoryId, setCategoryId] = useState(''),
    [requests, setRequests] = useState<ServiceRequest[]>([]),
    [bookings, setBookings] = useState<Booking[]>([]),
    [bids, setBids] = useState<Bid[]>([]),
    [selected, setSelected] = useState(''),
    [description, setDescription] = useState(''),
    [latitude, setLatitude] = useState('-33.96'),
    [longitude, setLongitude] = useState('25.60'),
    [scheduledAt, setScheduledAt] = useState(''),
    [qualification, setQualification] = useState(''),
    [verification, setVerification] = useState('DRAFT'),
    [quote, setQuote] = useState(''),
    [arrival, setArrival] = useState('30'),
    [quoteComment, setQuoteComment] = useState(''),
    [completionNote, setCompletionNote] = useState(''),
    [review, setReview] = useState(''),
    [rating, setRating] = useState(5),
    [notifications, setNotifications] = useState<
      { id: string; event: string }[]
    >([]),
    [conversation, setConversation] = useState(''),
    [messages, setMessages] = useState<Message[]>([]),
    [text, setText] = useState(''),
    [supportSubject, setSupportSubject] = useState(''),
    [supportText, setSupportText] = useState(''),
    [tickets, setTickets] = useState<
      { id: string; subject: string; status: string; response: string | null }[]
    >([]);
  const baseUrl =
    process.env.EXPO_PUBLIC_API_URL ??
    (Platform.OS === 'android'
      ? 'http://10.0.2.2:4000'
      : 'http://localhost:4000');
  const api = useCallback(
    createApiClient(baseUrl, () => token || undefined),
    [baseUrl, token],
  );
  const refresh = useCallback(async () => {
    if (!user) return;
    const list = await api<Category[]>('categories');
    setCategories(list);
    setCategoryId((current) => current || list[0]?.id || '');
    setBookings(await api('bookings'));
    setNotifications(await api('notifications'));
    setTickets(await api('support'));
    if (role === 'CUSTOMER') setRequests(await api('service-requests'));
    else {
      const profile = await api<{ verification: string; available: boolean }>(
        'providers/me',
      );
      setVerification(profile.verification);
      setRequests(
        profile.verification === 'APPROVED' && profile.available
          ? await api('opportunities')
          : [],
      );
    }
  }, [api, user, role]);
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, [refresh]);
  useEffect(() => {
    void SecureStore.getItemAsync('convyn-' + role).then(async (saved) => {
      if (!saved) return;
      try {
        const client = createApiClient(baseUrl, () => saved);
        const identity = await client<User>('auth/me');
        if (identity.role !== role) return;
        setToken(saved);
        setUser(identity);
      } catch {
        await SecureStore.deleteItemAsync('convyn-' + role);
      }
    });
  }, [baseUrl, role]);
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
  async function login() {
    if (register && !consent) throw new Error('Consent is required');
    const result = await api<{ accessToken: string; user: User }>(
      register ? 'auth/register' : 'auth/login',
      register
        ? { email, password, firstName, lastName, mobile, consent, role }
        : { email, password },
    );
    if (result.user.role !== role)
      throw new Error('Use the app matching your account role');
    await SecureStore.setItemAsync('convyn-' + role, result.accessToken);
    setToken(result.accessToken);
    setUser(result.user);
    setPassword('');
  }
  async function gps() {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted')
      throw new Error(
        'Location permission denied; enter service coordinates manually',
      );
    return Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
  }
  if (!user)
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <Text accessibilityRole="header" style={styles.heading}>
          CONVYN {role === 'CUSTOMER' ? 'Customer' : 'Provider'}
        </Text>
        <Text>South Africa · Gqeberha pilot</Text>
        <Text>
          Development marketplace. Online payments and external verification are
          not integrated.
        </Text>
        <Input label="Email" value={email} onChange={setEmail} />
        <Input
          label="Password"
          value={password}
          onChange={setPassword}
          secret
        />
        {register && (
          <>
            <Input
              label="First name"
              value={firstName}
              onChange={setFirstName}
            />
            <Input label="Last name" value={lastName} onChange={setLastName} />
            <Input
              label="Mobile in international format"
              value={mobile}
              onChange={setMobile}
            />
            <Text>I consent to account data processing</Text>
            <Switch
              accessibilityLabel="Consent to data processing"
              value={consent}
              onValueChange={setConsent}
            />
          </>
        )}
        <Button
          title={register ? 'Create account' : 'Sign in'}
          disabled={busy}
          onPress={() => void act(login)}
        />
        <Button
          title={register ? 'Use existing account' : 'Register'}
          onPress={() => setRegister(!register)}
        />
        {busy && <ActivityIndicator />}
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      </ScrollView>
    );
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text accessibilityRole="header" style={styles.heading}>
        Welcome, {user.firstName}
      </Text>
      <View style={styles.row}>
        {['Home', 'Bookings', 'Messages', 'Support', 'Profile'].map((name) => (
          <Button key={name} title={name} onPress={() => setTab(name)} />
        ))}
      </View>
      <Button
        title="Refresh"
        disabled={busy}
        onPress={() => void act(refresh)}
      />
      {busy && <ActivityIndicator />}
      <Text accessibilityRole="alert" style={styles.error}>
        {error}
      </Text>
      <Text accessibilityLiveRegion="polite">{notice}</Text>
      {tab === 'Home' && (
        <>
          {role === 'CUSTOMER' ? (
            <View style={styles.card}>
              <Text style={styles.subheading}>Request a service</Text>
              <Text>Choose category</Text>
              <View style={styles.row}>
                {categories.map((c) => (
                  <Button
                    key={c.id}
                    title={(categoryId === c.id ? '✓ ' : '') + c.name}
                    onPress={() => setCategoryId(c.id)}
                  />
                ))}
              </View>
              <Input
                label="Service description"
                value={description}
                onChange={setDescription}
                multiline
              />
              <Input
                label="Service latitude"
                value={latitude}
                onChange={setLatitude}
              />
              <Input
                label="Service longitude"
                value={longitude}
                onChange={setLongitude}
              />
              <Button
                title="Use device coordinates"
                onPress={() =>
                  void act(async () => {
                    const position = await gps();
                    setLatitude(String(position.coords.latitude));
                    setLongitude(String(position.coords.longitude));
                  })
                }
              />
              <Input
                label="Optional scheduled time (UTC ISO 8601)"
                value={scheduledAt}
                onChange={setScheduledAt}
              />
              <Button
                title="Publish service request"
                disabled={busy}
                onPress={() =>
                  void act(async () => {
                    await api('service-requests', {
                      categoryId,
                      description,
                      latitude: Number(latitude),
                      longitude: Number(longitude),
                      ...(scheduledAt ? { scheduledAt } : {}),
                    });
                    setDescription('');
                    setNotice('Request published');
                    await refresh();
                  })
                }
              />
              <Button
                title="Save draft"
                disabled={busy}
                onPress={() =>
                  void act(async () => {
                    await api('service-request-drafts', {
                      categoryId,
                      description,
                      latitude: Number(latitude),
                      longitude: Number(longitude),
                      ...(scheduledAt ? { scheduledAt } : {}),
                    });
                    setNotice('Draft saved');
                    await refresh();
                  })
                }
              />
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.subheading}>
                Availability · {verification}
              </Text>
              <Button
                title="Go online"
                disabled={busy || verification !== 'APPROVED'}
                onPress={() =>
                  void act(async () => {
                    await api(
                      'providers/availability',
                      { available: true },
                      'PATCH',
                    );
                    await refresh();
                  })
                }
              />
              <Button
                title="Go offline"
                disabled={busy || verification !== 'APPROVED'}
                onPress={() =>
                  void act(async () => {
                    await api(
                      'providers/availability',
                      { available: false },
                      'PATCH',
                    );
                    await refresh();
                  })
                }
              />
            </View>
          )}
          <Text style={styles.subheading}>
            {role === 'CUSTOMER' ? 'Your requests' : 'Eligible opportunities'}
          </Text>
          {requests
            .filter((r) => !r.cancelledAt)
            .map((request) => (
              <View style={styles.card} key={request.id}>
                <Text>{request.description || 'Saved draft'}</Text>
                {role === 'CUSTOMER' ? (
                  request.publishedAt ? (
                    <Button
                      title="Compare bids"
                      onPress={() =>
                        void act(async () => {
                          setSelected(request.id);
                          setBids(
                            await api(
                              'service-requests/' + request.id + '/bids',
                            ),
                          );
                        })
                      }
                    />
                  ) : (
                    <Button
                      title="Publish draft"
                      onPress={() =>
                        void act(async () => {
                          await api(
                            'service-requests/' + request.id + '/publish',
                            {},
                          );
                          await refresh();
                        })
                      }
                    />
                  )
                ) : (
                  <Button
                    title="Prepare quotation"
                    onPress={() => setSelected(request.id)}
                  />
                )}
              </View>
            ))}
          {role === 'CUSTOMER' &&
            bids.map((bid) => (
              <View key={bid.id} style={styles.card}>
                <Text>
                  {bid.provider.user.firstName} {bid.provider.user.lastName}
                </Text>
                <Text>
                  Quote: {bid.totalMinor} ZAR cents · Arrival{' '}
                  {bid.arrivalMinutes} minutes
                </Text>
                <Button
                  title="Accept this quotation"
                  disabled={busy}
                  onPress={() =>
                    void act(async () => {
                      await api('bids/' + bid.id + '/accept', {});
                      setBids([]);
                      setSelected('');
                      setNotice(
                        'Booking created. No online payment collected.',
                      );
                      await refresh();
                    })
                  }
                />
              </View>
            ))}
          {role === 'PROVIDER' && selected && (
            <View style={styles.card}>
              <Input
                label="Quote total in ZAR cents"
                value={quote}
                onChange={setQuote}
              />
              <Input
                label="Arrival in minutes"
                value={arrival}
                onChange={setArrival}
              />
              <Input
                label="Quote explanation"
                value={quoteComment}
                onChange={setQuoteComment}
                multiline
              />
              <Button
                title="Submit quotation"
                disabled={busy}
                onPress={() =>
                  void act(async () => {
                    await api('service-requests/' + selected + '/bids', {
                      totalMinor: Number(quote),
                      arrivalMinutes: Number(arrival),
                      comment: quoteComment,
                      expiresAt: new Date(Date.now() + 3600000).toISOString(),
                    });
                    setSelected('');
                    setNotice('Quotation submitted');
                  })
                }
              />
            </View>
          )}
          <Text style={styles.subheading}>Notifications</Text>
          {notifications.map((n) => (
            <Text key={n.id}>{n.event.split(':')[0].replaceAll('_', ' ')}</Text>
          ))}
        </>
      )}
      {tab === 'Bookings' &&
        bookings.map((booking) => (
          <View key={booking.id} style={styles.card}>
            <Text style={styles.subheading}>{booking.request.description}</Text>
            <Text>{booking.status.replaceAll('_', ' ')}</Text>
            <Button
              title="Open booking messages"
              onPress={() =>
                void act(async () => {
                  setConversation(booking.id);
                  setMessages(
                    await api('bookings/' + booking.id + '/messages'),
                  );
                  setTab('Messages');
                })
              }
            />
            {role === 'PROVIDER' &&
              ['CONFIRMED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'].includes(
                booking.status,
              ) && (
                <>
                  {booking.status === 'IN_PROGRESS' && (
                    <Input
                      label="Completion note"
                      value={completionNote}
                      onChange={setCompletionNote}
                      multiline
                    />
                  )}
                  <Button
                    title="Advance job status"
                    disabled={busy}
                    onPress={() =>
                      void act(async () => {
                        const states: Record<string, string> = {
                          CONFIRMED: 'EN_ROUTE',
                          EN_ROUTE: 'ARRIVED',
                          ARRIVED: 'IN_PROGRESS',
                          IN_PROGRESS: 'AWAITING_CONFIRMATION',
                        };
                        await api('bookings/' + booking.id + '/status', {
                          status: states[booking.status],
                          ...(booking.status === 'IN_PROGRESS'
                            ? { completionNote }
                            : {}),
                        });
                        await refresh();
                      })
                    }
                  />
                </>
              )}
            {role === 'PROVIDER' &&
              ['EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'].includes(
                booking.status,
              ) && (
                <>
                  <Button
                    title="Share actual device location"
                    onPress={() =>
                      void act(async () => {
                        const point = await gps();
                        await api(
                          'bookings/' + booking.id + '/tracking-consent',
                          { enabled: true, durationMinutes: 15 },
                        );
                        await api('bookings/' + booking.id + '/location', {
                          latitude: point.coords.latitude,
                          longitude: point.coords.longitude,
                          accuracyMetres: point.coords.accuracy ?? 0,
                          observedAt: new Date(point.timestamp).toISOString(),
                        });
                        setNotice(
                          'One current device location shared, valid for two minutes',
                        );
                      })
                    }
                  />
                  <Button
                    title="Stop sharing location"
                    onPress={() =>
                      void act(async () => {
                        await api(
                          'bookings/' + booking.id + '/tracking-consent',
                          { enabled: false },
                        );
                        setNotice('Sharing stopped');
                      })
                    }
                  />
                </>
              )}
            {role === 'CUSTOMER' && (
              <Button
                title="Get authorised provider location"
                onPress={() =>
                  void act(async () => {
                    const result = await api<{
                      location: { latitude: number; longitude: number } | null;
                    }>('bookings/' + booking.id + '/location');
                    setNotice(
                      result.location
                        ? `Provider location: ${result.location.latitude}, ${result.location.longitude}`
                        : 'No current authorised location',
                    );
                  })
                }
              />
            )}
            {role === 'CUSTOMER' &&
              booking.status === 'AWAITING_CONFIRMATION' && (
                <Button
                  title="Confirm completion"
                  disabled={busy}
                  onPress={() =>
                    void act(async () => {
                      await api('bookings/' + booking.id + '/status', {
                        status: 'COMPLETED',
                      });
                      await refresh();
                    })
                  }
                />
              )}
            {role === 'CUSTOMER' &&
              booking.status === 'COMPLETED' &&
              !booking.review && (
                <>
                  <Input
                    label="Your review"
                    value={review}
                    onChange={setReview}
                    multiline
                  />
                  <View style={styles.row}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Button
                        key={n}
                        title={(rating === n ? '✓ ' : '') + n}
                        onPress={() => setRating(n)}
                      />
                    ))}
                  </View>
                  <Button
                    title="Submit review"
                    disabled={busy}
                    onPress={() =>
                      void act(async () => {
                        await api('bookings/' + booking.id + '/reviews', {
                          rating,
                          comment: review,
                        });
                        await refresh();
                      })
                    }
                  />
                </>
              )}
          </View>
        ))}
      {tab === 'Messages' && (
        <View style={styles.card}>
          <Text style={styles.subheading}>Booking conversation</Text>
          {!conversation ? (
            <Text>Open a booking to select its conversation.</Text>
          ) : (
            <>
              <Button
                title="Refresh messages"
                onPress={() =>
                  void act(async () => {
                    setMessages(
                      await api('bookings/' + conversation + '/messages'),
                    );
                    await api(
                      'bookings/' + conversation + '/messages/read',
                      {},
                    );
                  })
                }
              />
              {messages.map((message) => (
                <Text key={message.id}>
                  {message.senderId === user.id ? 'You' : 'Other participant'}:{' '}
                  {message.text}
                </Text>
              ))}
              <Input
                label="Message text"
                value={text}
                onChange={setText}
                multiline
              />
              <Button
                title="Send message"
                disabled={busy}
                onPress={() =>
                  void act(async () => {
                    await api('bookings/' + conversation + '/messages', {
                      text,
                      clientId: Crypto.randomUUID(),
                    });
                    setText('');
                    setMessages(
                      await api('bookings/' + conversation + '/messages'),
                    );
                  })
                }
              />
            </>
          )}
        </View>
      )}
      {tab === 'Support' && (
        <View style={styles.card}>
          <Input
            label="Support subject"
            value={supportSubject}
            onChange={setSupportSubject}
          />
          <Input
            label="Describe your support request"
            value={supportText}
            onChange={setSupportText}
            multiline
          />
          <Button
            title="Submit support ticket"
            disabled={busy}
            onPress={() =>
              void act(async () => {
                await api('support', {
                  subject: supportSubject,
                  description: supportText,
                });
                setNotice('Support ticket created');
                await refresh();
              })
            }
          />
          {tickets.map((ticket) => (
            <Text key={ticket.id}>
              {ticket.subject} · {ticket.status} · {ticket.response}
            </Text>
          ))}
        </View>
      )}
      {tab === 'Profile' && (
        <View style={styles.card}>
          <Text>
            {user.firstName} · {user.role}
          </Text>
          {role === 'PROVIDER' && (
            <>
              <Text>Verification: {verification}</Text>
              <Input
                label="Qualification details"
                value={qualification}
                onChange={setQualification}
                multiline
              />
              <Text>Service category</Text>
              <View style={styles.row}>
                {categories.map((c) => (
                  <Button
                    key={c.id}
                    title={(c.id === categoryId ? '✓ ' : '') + c.name}
                    onPress={() => setCategoryId(c.id)}
                  />
                ))}
              </View>
              <Button
                title="Submit provider verification"
                disabled={busy}
                onPress={() =>
                  void act(async () => {
                    await api('providers/verification', {
                      qualification,
                      categories: [categoryId],
                      latitude: Number(latitude),
                      longitude: Number(longitude),
                      radiusKm: 30,
                    });
                    await refresh();
                  })
                }
              />
              <Button
                title="View completed quoted earnings"
                onPress={() =>
                  void act(async () => {
                    const result = await api<{
                      completedQuotedMinor: string;
                      completedJobs: number;
                    }>('providers/earnings');
                    setNotice(
                      `${result.completedJobs} completed jobs; ${result.completedQuotedMinor} ZAR cents quoted. Payouts are not integrated.`,
                    );
                  })
                }
              />
            </>
          )}
          <Button
            title="Sign out"
            onPress={() =>
              void act(async () => {
                try {
                  await api('auth/logout', {});
                } finally {
                  await SecureStore.deleteItemAsync('convyn-' + role);
                  setToken('');
                  setUser(null);
                  setRequests([]);
                  setBookings([]);
                  setMessages([]);
                  setConversation('');
                }
              })
            }
          />
        </View>
      )}
    </ScrollView>
  );
}
