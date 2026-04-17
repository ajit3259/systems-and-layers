# REST Banking Demo

A hands-on REST server built with Express and TypeScript. Demonstrates HTTP verbs, status codes, caching, and REST conventions through a simple banking API.

## Running

```bash
npm install
npm run build
npm start
```

Open `http://localhost:3000` in the browser with DevTools → Network tab open.

## What to observe

### HTTP verbs are conventions, not enforcement

Nothing stops you from using POST to delete a resource or GET to create one. Express will happily register `app.get("/accounts/:id/delete", ...)`. The verbs are a contract — between you, your clients, and the HTTP ecosystem (caches, proxies, load balancers). Breaking them means losing the benefits that come with them.

### Verb semantics

| Verb   | Meaning             | Idempotent | Safe |
|--------|---------------------|------------|------|
| GET    | Read                | Yes        | Yes  |
| POST   | Create              | No         | No   |
| PUT    | Replace (full)      | Yes        | No   |
| PATCH  | Update (partial)    | No         | No   |
| DELETE | Remove              | Yes        | No   |

**Idempotent** — calling multiple times with the same input produces the same result.
**Safe** — calling it does not change server state.

### Status codes

| Code | Meaning        | When to use |
|------|----------------|-------------|
| 200  | OK             | Successful GET, PUT, PATCH |
| 201  | Created        | Successful POST that creates a resource |
| 204  | No Content     | Successful DELETE — nothing to return |
| 304  | Not Modified   | GET with matching ETag — use cached copy |
| 400  | Bad Request    | Invalid input (negative deposit, missing fields) |
| 401  | Unauthorized   | Not authenticated — no valid credentials |
| 403  | Forbidden      | Authenticated but not allowed |
| 404  | Not Found      | Resource doesn't exist |
| 405  | Method Not Allowed | Wrong verb for this path |

Note: Express returns 404 for unregistered routes regardless of verb. A proper 405 requires explicit handling.

### Response body conventions

```
POST   → 201 + created resource (client gets the generated id)
PUT    → 200 + updated resource (client sees the full new state)
PATCH  → 200 + updated resource
DELETE → 204 + no body
GET    → 200 + resource, or 304 + no body (cached)
```

Returning the updated resource on writes saves the client an extra GET.

### Caching with ETags

GET responses include an `ETag` header — a fingerprint of the response body. On the next request, the client sends `If-None-Match: <etag>`. If the resource hasn't changed, the server returns `304 Not Modified` with no body.

```
First GET:   200 OK  + full body + ETag: W/"67-abc..."
Second GET:  304 Not Modified + no body  (server did less work, client uses cache)
After PATCH: 200 OK  + full body + new ETag  (fingerprint changed, cache invalidated)
```

Observe in DevTools Timing:
- **TTFB (Waiting)** — server processing time. Lower on 304 because server only compares ETags, doesn't serialize a response body.
- **Content Download** — near zero on 304 (no body transferred).
- **Stalled** — browser scheduling noise, not server performance. Ignore for comparisons.

Cache also has a lifetime via `Cache-Control: max-age=N`. After expiry the browser revalidates with the ETag rather than using the stale cached copy blindly.

## API

```
POST   /accounts                    → create account
GET    /accounts/:id                → get account
PUT    /accounts/:id                → replace account (full update)
PATCH  /accounts/:id                → update description only
DELETE /accounts/:id                → delete account
POST   /accounts/:id/deposit        → deposit amount
POST   /accounts/:id/withdraw       → withdraw amount
```
