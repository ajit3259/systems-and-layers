# SSE Banking Demo

A hands-on server to understand Server-Sent Events (SSE).

Built on top of the REST banking server — same account CRUD, with one new endpoint: `GET /accounts/:id/balance` which streams real-time balance updates to connected clients.

## Running

```bash
npm install
npm run build
npm start
```

Open `http://localhost:3000` in the browser with DevTools → Network tab open.

## What to observe

### The connection stays pending

In the Network tab, the `/balance` request never completes. DevTools shows:
- **Response tab** — "failed to load response data" (not an error — the response is still open)
- **EventStream tab** — each `data:` frame appears as a row as events arrive in real time

This is the fundamental difference from REST:
```
REST:  request → response → connection closes
SSE:   request → connection stays open → server writes events down it
```

### How SSE works on the server

Two things make it different from a normal endpoint:

**1. Headers tell the client and all intermediaries what this is:**
```
Content-Type: text/event-stream
Cache-Control: no-cache
```
`no-cache` tells proxies and CDNs not to buffer — pass each chunk through immediately. Without it, events might arrive in batches or not at all.

**2. `flushHeaders()` sends headers without closing the response body:**
```typescript
res.flushHeaders(); // headers sent, connection stays open
res.write(`data: ${JSON.stringify({ balance })}\n\n`); // send events later
```
Any call to `res.json()`, `res.send()`, or `res.end()` would close the connection. For SSE you only use `res.write()`.

### Server tracks active connections

The server maintains a map of open connections per account:
```
activeSseConnections: Map<accountId, Response[]>
```

When deposit or withdraw happens → write to all connections watching that account.
When a client disconnects → remove its `Response` from the map via `req.on("close", ...)`.

### Testing with two tabs

1. Create an account in tab 1 — copy the ID
2. Connect SSE in both tabs using the same account ID
3. Deposit or withdraw in either tab
4. Both balances update simultaneously — one server write, two clients notified

### The 6-connection limit

HTTP/1.1 allows 6 connections per domain. Each SSE connection holds one slot permanently. Open 6 SSE connections and the 7th request (deposit, withdraw, anything) stalls — the browser has no free slots to send it.

Fix: use HTTP/2 (no per-domain limit), or multiplex multiple accounts over one SSE connection.

## API

```
POST /accounts                   → create account
GET  /accounts/:id               → get account
POST /accounts/:id/deposit       → deposit (notifies SSE clients)
POST /accounts/:id/withdraw      → withdraw (notifies SSE clients)
GET  /accounts/:id/balance       → SSE stream of balance updates
```
