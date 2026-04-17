# WebSocket Chat Demo

A hands-on server to understand WebSockets.

The scenario: customers need real-time support from agents. Both sides send messages at any time, with near-zero latency. REST doesn't work here — client can't initiate and server can't push simultaneously. SSE doesn't work — server-to-client only. WebSocket fits.

## Running

```bash
npm install
npm run build
npm start
```

Open `http://localhost:3000` with DevTools → Network → filter by **WS**.

Or test from the terminal:
```bash
npx wscat -c ws://localhost:3000
{"msgType":"identity","role":"customer","from":"","text":""}
{"msgType":"chat","role":"customer","from":"","text":"I need help"}
```

## How it works

### The upgrade handshake

WebSocket starts as a GET request, then drops HTTP and works directly on the underlying TCP connection using frames:

```
Client → GET / HTTP/1.1
         Upgrade: websocket
         Sec-WebSocket-Key: <random base64>

Server → HTTP/1.1 101 Switching Protocols
         Upgrade: websocket
         Sec-WebSocket-Accept: <SHA1(key + fixed GUID)>
```

After 101, the TCP connection is still open but the protocol has changed. All subsequent communication is WebSocket frames — not HTTP requests.

**On `Sec-WebSocket-Accept`:** The server hashes the client's key with a GUID hardcoded in the WebSocket spec (RFC 6455). The client verifies it matches. This proves the server understands WebSocket — not for encryption, just protocol validation. Real security comes from `wss://` (WebSocket over TLS).

### Message schema

Both sides speak the same format:

```typescript
type Message = {
    msgType: "chat" | "identity";
    role:    "customer" | "agent";
    from:    string;
    to?:     string;
    text:    string;
}
```

### Connection lifecycle

**On connect** — server creates a closure with `clientId = null`.

**First message (identity)** — server assigns a UUID as `clientId`, creates a dedicated Agent instance, stores both in maps, sends greeting:
```
wsConnections: Map<clientId, WebSocket>
clientToAgent: Map<clientId, Agent>
```

In production, `clientId` would come from an auth token — never trust an ID from the client itself.

**Subsequent messages (chat)** — server uses `clientId` from the closure (not from the message) to look up the agent and send a reply.

**On close** — `ws.on("close")` fires, server deletes both map entries using `clientId` from the closure.

### The Agent

A simple round-robin responder — cycles through fixed replies on each message. In production this would be a real agent's WebSocket connection, with the server routing messages between customer and agent connections.

## What to observe in DevTools

- **Status 101** — the upgrade response, not 200
- **Messages tab** — all frames in both directions through one connection, with arrows showing direction (↑ outgoing, ↓ incoming)
- **`Sec-WebSocket-Accept` header** — the handshake verification
- **1 request, persistent** — entire conversation over one connection, unlike REST where each action is a separate request

## Path routing

The current setup attaches WebSocket to all paths — every connection to `ws://localhost:3000` hits the same handler. To route by path, check `req.url` in the connection handler:

```typescript
wss.on("connection", (ws, req) => {
    if (req.url?.startsWith("/support")) { ... }
    if (req.url?.startsWith("/notifications")) { ... }
});
```

Or use `express-ws` for Express-style route params:

```typescript
app.ws("/support/:id", (ws, req) => {
    const accountId = req.params.id;
});
```

## Production considerations

**Multiple connections per client** — a customer might open multiple tabs or reconnect after a drop. A more complete model:
```
clientId    → conversation (history, assigned agent)
connectionId → WebSocket (the live socket)
clientId    → connectionId[]
connectionId → clientId  (reverse, for cleanup on close)
```

On reconnect, restore the conversation rather than starting fresh.

**Scaling** — each WebSocket connection is tied to one server instance. Multiple servers need sticky sessions (load balancer routes a client to the same instance) or a shared pub/sub layer (Redis) so servers can route messages across instances.

**Same server for REST and WebSocket** — yes. `http.createServer(app)` handles both on the same port. HTTP requests go to Express, upgrade requests go to WebSocketServer. Common in production for APIs that need both CRUD and real-time.
