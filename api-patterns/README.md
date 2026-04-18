---
layout: default
title: "API Patterns: Part 1 — The Decision Framework"
parent: API Patterns
nav_order: 1
---

# API Patterns — Part 1: The Decision Framework

When building a system, one of the first questions you face is: how will clients interact with it?

Do they request and wait for a response? Do they need the server to push updates? Should both sides talk freely? How much data flows, and how often?

Every system has a mix of these access patterns. And for each, your arsenal looks different — protocols, communication styles, data formats — each with different tradeoffs around scalability, performance, and complexity. Picking the wrong one means either under-serving your requirements or over-engineering your way into unnecessary complexity.

So how do you decide?

This is Part 1 — the decision framework. It gives you a mental model to reason about the choice and a story-driven walkthrough to see each option in context. [Part 2](./part-2-under-the-hood) goes under the hood: how each style actually works and where it breaks. [Part 3](./code/) has hands-on implementations.

Here we start with a framing to understand what's in your arsenal, then follow a single system — a banking app — where each new requirement forces a different choice. The decision framework falls out naturally at the end.

---

## What's in your arsenal

Before picking a tool, it helps to understand what you're actually choosing between. There are three layers:

**Protocol** — how bytes move between machines. HTTP, MQTT, raw TCP. This is the foundation everything else builds on.

**Communication style** — who talks, when, and in which direction. Does only the client initiate? Can the server push? Do both sides stream simultaneously?

**Data format** — what the bytes look like. Human-readable text like JSON, binary like Protocol Buffers, or plain newline-delimited strings.

What we call REST, gRPC, GraphQL, WebSocket — these are combinations of choices across all three layers. Understanding the layers is what lets you reason about the tradeoffs instead of just memorizing rules.

Keep this in mind as we walk through the banking app — for each requirement, ask yourself: what protocol, what communication style, what format does this need?

---

## A banking app — one system, eight requirements

Let's build a banking app. Each new requirement will force a choice.

---

### Requirement 1: Transaction history, account balance, money transfers

The client requests data, the server responds. No streaming, no real-time updates. This is the default mode of the web.

**REST** fits naturally. It's an architectural style built on HTTP — resource-oriented, stateless, using HTTP verbs (GET, POST, DELETE) as actions. A transaction is a resource. An account is a resource. The client asks, the server responds, the connection closes.

REST doesn't enforce a data format but JSON is the convention. No contract is enforced either — OpenAPI exists but it's optional documentation, not a compiler check.

The statelessness is a feature: any server instance can handle any request, making horizontal scaling straightforward.

---

### Requirement 2: The balance should update the moment a transaction hits — no refresh needed

Now the server needs to push data to the client without the client asking repeatedly.

**SSE (Server-Sent Events)** is the right tool. The client opens one HTTP connection, and the server keeps writing events down it as they happen. It's not a new protocol — it's a persistent HTTP response that never ends.

SSE is server-to-client only, which is exactly what this requires. It works through load balancers and proxies without configuration, the browser auto-reconnects if the connection drops, and the server implementation is simple: set `Content-Type: text/event-stream` and write.

WebSocket could work here too, but it would be over-engineering — the client never needs to send data after the connection opens.

---

### Requirement 3: 12 internal microservices calling each other thousands of times per second

HTTP with JSON starts to show its cost at this scale. Parsing JSON is CPU-intensive. HTTP/1.1 has head-of-line blocking. And with a dozen services, a contract you can't enforce becomes a liability.

**gRPC** is the answer for internal service-to-service communication. It runs on HTTP/2 — which multiplexes many concurrent calls over one connection. It uses Protocol Buffers (protobuf) — binary, 3–10x smaller than JSON, faster to parse. Both client and server are generated from a `.proto` file, so breaking changes are caught at compile time before they reach production.

gRPC works here because you control both sides. The strict contract and binary format are features when you own the client and server. They become burdens when you don't.

---

### Requirement 4: Notify users about suspicious logins — even when the app is closed

None of the above solutions work for a sleeping device. SSE and WebSocket require an open connection. REST requires the client to ask.

**Push notifications** solve this. The app registers with APNs (iOS) or FCM (Android) and receives a device token. Your server sends a notification to APNs/FCM with that token, and the platform delivers it to the device — even if the app hasn't been opened in days.

The topology is the same as MQTT: your server → broker (APNs/FCM) → device. Publisher and subscriber are decoupled. Neither knows the other directly.

---

### Requirement 5: Third-party fintech apps need different data from the same API

This is the over-fetching and under-fetching problem. REST returns whatever shape the server defines. One client gets too much data, another needs multiple round trips to assemble what it needs.

**GraphQL** lets the client declare exactly what it wants — including traversing relationships in one request:

```graphql
query {
  account(id: "123") {
    balance
    transactions {
      amount
      merchant { name, category }
    }
  }
}
```

One request. Client controls the shape. Server has a typed schema both sides share.

**Honest caveat:** GraphQL makes sense when you genuinely have diverse clients with meaningfully different data needs. For most systems with one web app and one mobile app, REST works fine — you add a field to the endpoint. The operational cost of GraphQL (N+1 query problem, DataLoader, broken HTTP caching) isn't worth it unless you're actually feeling the pain.

---

### Requirement 6: Third-party apps want to be notified when a transaction occurs

The fintech app has a server. It doesn't need a persistent connection — it just needs to know when something happens.

**Webhooks** flip the model: instead of the client polling, the bank calls the client. The fintech app registers a URL. When a transaction occurs, your server makes an HTTP POST to that URL.

Event-driven, no wasted requests, scales well. This is how Stripe, GitHub, and Twilio work. If you can offer webhooks, they're almost always the right choice over polling for server-to-server event delivery.

---

### Requirement 7: Monitor 10,000 ATMs on satellite connections

HTTP is too heavy for this. Each request carries significant header overhead. Connections drop and reconnect constantly. You need something designed for exactly these constraints.

**MQTT** was built for this world — industrial sensors on satellite links. Its minimum packet is 2 bytes. It has explicit QoS levels: fire-and-forget (0), at-least-once (1), or exactly-once (2). A broker sits in the middle; ATMs publish to topics, your monitoring system subscribes.

```
atms/region-us/atm-1042/cash-level
atms/region-us/#                     ← wildcard: subscribe to all ATMs in US
```

The ATMs don't know who's consuming their data. The monitoring system doesn't know which ATM will be online. The broker handles it.

---

### Requirement 8: Live customer support chat

Now both sides need to talk freely. The customer sends messages, the support agent responds, typing indicators flow both ways.

**WebSocket** is the right call. The client makes an HTTP request with an `Upgrade: websocket` header. The server responds with `101 Switching Protocols`. HTTP is done — the TCP connection now speaks the WebSocket protocol, and either side can send a message at any time.

Unlike SSE, WebSocket gives you a raw channel. You define your own message format, your own protocol. This flexibility is the point — chat apps, collaborative editors, multiplayer games all build custom protocols on top of WebSocket.

The tradeoff: WebSocket connections are stateful. If you have multiple server instances, you need sticky sessions (load balancer always routes a user to the same instance) or a shared pub/sub layer like Redis so servers can reach connections they don't own.

---

## Decision framework

Every scenario above maps to a question you can ask about your own system:

| Question | Answer |
|---|---|
| Simple request-response, CRUD? | REST |
| Server pushes updates, client only listens? | SSE |
| Both sides talk freely? | WebSocket |
| Internal service-to-service, high throughput? | gRPC |
| Diverse clients needing different data shapes? | GraphQL |
| Constrained devices, unreliable network? | MQTT |
| Notify a device even when app is closed? | Push notifications (APNs/FCM) |
| Notify a server when an event occurs? | Webhooks |
| Need near-realtime, no webhooks available? | Long polling |
| Simplest possible, delay acceptable? | Short polling |

---

## Real-world combinations

Systems rarely use just one style. Two patterns worth knowing:

**gRPC internally, REST externally.**

A service can expose gRPC to internal callers and REST to external ones simultaneously. Tools like gRPC-Gateway generate a REST/JSON API directly from the `.proto` file — one source of truth, two interfaces. Internal services get performance and compile-time safety. External clients get browser compatibility and no SDK requirement.

**GraphQL as an API gateway layer.**

Rather than replacing REST everywhere, teams often put GraphQL in front of multiple REST or gRPC services. The gateway aggregates data from several upstream services and lets clients query across all of them in one request. The underlying services stay simple; the complexity of composition lives in the gateway.

---

## Quick reference

| Style | Built on | Direction | Format | Best for |
|---|---|---|---|---|
| REST | HTTP | Client → Server | JSON | CRUD, public APIs |
| gRPC | HTTP/2 | Both + streaming | Protobuf | Internal services |
| GraphQL | HTTP | Client → Server | JSON | Diverse client data needs |
| SSE | HTTP | Server → Client | Text | Live feeds, LLM tokens |
| WebSocket | TCP (HTTP upgrade) | Both | Any | Chat, real-time, gaming |
| MQTT | TCP | Pub/Sub via broker | Binary | IoT, constrained devices |
| Webhooks | HTTP | Server → Server | JSON | Event notifications |
| Push notifications | APNs/FCM | Server → Device | Platform | Mobile alerts |
