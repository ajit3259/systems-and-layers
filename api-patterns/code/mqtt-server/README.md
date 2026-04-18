# MQTT ATM Health Monitor Demo

A hands-on implementation to understand MQTT.

The scenario: 10 ATMs spread across the country, each reporting its health status every 5 seconds. A bank monitoring system subscribes to all ATM health updates in real time. Connections can drop at any time — the system must self-heal without manual intervention.

## Running

Install and start Mosquitto (the MQTT broker):

```bash
brew install mosquitto
mkdir -p /opt/homebrew/etc/mosquitto
cat > /opt/homebrew/etc/mosquitto/mosquitto.conf << 'EOF'
listener 1883
allow_anonymous true

listener 9001
protocol websockets
allow_anonymous true
EOF
brew services start mosquitto
```

In one terminal (ATMs publishing):
```bash
npm install
npm run build
npm run publish-health
```

In another terminal (browser dashboard):
```bash
npm start
```

Open `http://localhost:3000` — the dashboard connects to the broker over WebSocket (port 9001) and shows live ATM health status, last seen time, and stale indicators.

Alternatively, subscribe from the terminal:
```bash
npm run subscribe-health
```

To monitor raw broker traffic:
```bash
mosquitto_sub -h localhost -t "#" -v
```

## How it works

### Broker topology

MQTT doesn't connect publishers and subscribers directly. Both connect to a **broker** (Mosquitto here) through **topics**. Publishers write to a topic, subscribers read from a topic — they never know about each other.

This is the fundamental difference from WebSocket and SSE, where the server is the central routing point written by you. In MQTT, the broker handles all routing and fanout — no application code needed to deliver a message to 1000 subscribers.

```
ATM-1 ──publish──→ broker ──fanout──→ Bank
ATM-2 ──publish──→ broker ──fanout──→ Bank
...                  ↑
ATM-10 ─publish──→ broker      (wildcard subscription: atm/+/health)
```

### Topic hierarchy and wildcards

Topics are hierarchical strings: `atm/ATM-1/health`. MQTT has two wildcard characters:

- `+` — single level: `atm/+/health` matches `atm/ATM-1/health`, `atm/ATM-2/health`, etc.
- `#` — multi level: `atm/#` matches everything under `atm/`

The bank subscribes to `atm/+/health` — one subscription, all ATMs. With WebSocket you'd need to implement this fanout yourself; the MQTT broker does it for free.

### Resilient connections

MQTT was designed for unreliable networks. The client library (`mqtt` npm package) has automatic reconnection built in — when the broker restarts or the network drops, clients reconnect without any application code:

```
ATM-1 connected
ATM-1 reconnecting...     ← broker restarted
ATM-1 connected           ← auto-reconnected
```

### QoS levels

MQTT has three delivery guarantee levels set per message:

| QoS | Guarantee | How |
|---|---|---|
| 0 | At most once — fire and forget | No ACK, message may be lost |
| 1 | At least once | Broker sends ACK; publisher retries until ACK received |
| 2 | Exactly once | 4-way handshake between client and broker; no duplicates |

This demo uses QoS 1 — each ATM health message gets a broker ACK. You can see it in the publisher logs:

```
ATM-1 broker ACK received
ATM-2 broker ACK received
```

Higher QoS = more reliability, more overhead. QoS 0 is fine for metrics where occasional loss is acceptable. QoS 2 is for financial transactions where duplicates cause real problems.

### Retained messages

A publisher can mark a message as retained: `{ retain: true }`. The broker stores the last retained message per topic indefinitely. When a new subscriber connects, it immediately receives the last retained value — even if the publisher is offline.

**What this enables:** a bank monitoring dashboard that starts up at midnight gets the current health status of all 10,000 ATMs instantly, without waiting for the next publish cycle.

To clear a retained message, publish an empty payload to the same topic with `retain: true`.

### QoS 2: why four steps and not three

QoS 1 uses three messages (PUBLISH → PUBREC → ACK) and guarantees at-least-once. QoS 2 adds a fourth step to achieve exactly-once:

1. Publisher → broker: `PUBLISH`
2. Broker → publisher: `PUBREC` (received)
3. Publisher → broker: `PUBREL` (release)
4. Broker → publisher: `PUBCOMP` (complete)

The extra step handles a race condition: if the broker crashes after sending `PUBREC` but before committing the message, the publisher would retransmit on reconnect — causing a duplicate. The `PUBREL`/`PUBCOMP` exchange is a two-phase commit — both sides agree the message is done before moving on. Three messages leave an ambiguous state; four don't.

### Ordering guarantees

MQTT guarantees message order **within a single publisher's connection** — messages from one client arrive at the broker in the order they were sent. However:

- **Multiple publishers**: no ordering guarantee across publishers on the same topic — two ATMs publishing simultaneously arrive in whatever order the broker receives them
- **QoS 1 retries**: if a client reconnects and retransmits a message, ordering can break
- **QoS 2**: preserves order within a single publisher's session — the commit protocol prevents out-of-order delivery

### Subscriber-side guarantees

QoS applies in both directions. For QoS 1, the broker expects an ACK from the subscriber after delivering a message. If the subscriber doesn't ACK, the broker retries. The full guarantee chain is:

```
Publisher → broker  (publisher ACKs)
Broker → subscriber (subscriber ACKs)
```

Both hops are covered at the requested QoS level.

### Persistent sessions

A subscriber can connect with `cleanSession: false`. The broker remembers this client and queues QoS 1/2 messages while it's offline. On reconnect, the broker delivers all missed messages in order.

With `cleanSession: true` (default), the broker discards any queued messages on disconnect — fresh start every time.

## What to observe

1. **Start publisher then open dashboard** — all 10 ATMs appear within 5 seconds, green status, last seen updating every second
2. **Stop publisher** — ATMs turn grey ("stale") after 15 seconds — 3 missed heartbeats — with no code changes needed
3. **Stop publisher, open a new browser tab** — retained messages deliver last known state instantly before any new publish
4. **Restart Mosquitto** (`brew services restart mosquitto`) while publisher is running — watch ATMs reconnect automatically in publisher logs
5. **QoS 1 ACK logs** — each publish logs "broker ACK received" in the publisher terminal
6. **Wildcard routing** — one `atm/+/health` subscription in the dashboard catches all 10 ATMs — no server-side routing code

## Alert logic (not implemented)

In production, the bank subscriber would maintain:
```typescript
lastSeen: Map<atmId, timestamp>
```

Updated on every message. A background job checks every 5 seconds — if `Date.now() - lastSeen.get(id) > 15000` (3 missed heartbeats), trigger an alert. This is application-layer logic on top of MQTT; the protocol itself has no heartbeat concept.

## Production considerations

**Broker as single point of failure** — Mosquitto is single-node. Production brokers (HiveMQ, EMQX, AWS IoT Core) support clustering and replication so the broker itself doesn't become the failure point.

**AWS IoT Core** uses MQTT as its transport. Device Shadows (last known device state stored in the cloud) are built on top of reserved MQTT topics like `$aws/things/{deviceName}/shadow/update` — essentially retained messages with a structured JSON state model and delta tracking on top.
