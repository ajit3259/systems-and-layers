# GraphQL Banking Demo

A hands-on server to understand GraphQL.

The scenario: a banking app where clients need flexible access to user and account data. REST works but is rigid — every endpoint returns a fixed shape, forcing clients to over-fetch or make multiple calls. GraphQL fits: clients ask for exactly what they need, in one request.

## Running

```bash
npm install
npm run build
npm start
```

Open `http://localhost:4000` in the browser.

## How it works

### The contract: SDL

GraphQL uses a Schema Definition Language (SDL) — a plain text file (`schema/banking.graphql`) that defines types and operations. Both server and client understand the same schema. Unlike protobuf, there's no code generation step — the SDL is read at runtime and Apollo builds the schema from it.

```graphql
type User {
    id: ID!
    name: String!
    accounts: [Account!]!
}

type Query {
    users: [User!]!
    user(userId: ID!): User!
}

type Mutation {
    createUser(input: CreateUserInput!): User!
    deposit(input: DepositInput!): Account!
}

type Subscription {
    balanceUpdated(userId: String!, accountId: String!): Account!
}
```

`!` means non-nullable — the server guarantees that field will never be null. Field selection (asking for only some fields) is independent — clients can skip any field regardless of nullability.

### Over-fetching and under-fetching

**Over-fetching** — with REST, `GET /users/:id` always returns the full user object. If you only need name and age, you still get address, metadata, and everything else. No way to ask for less.

**Under-fetching** — to get users with their accounts, REST needs two round trips: `GET /users`, then `GET /users/:id/accounts` per user. Multiple requests for data that belongs together.

GraphQL solves both. The client defines a selection set — exactly which fields to return — and nested queries fetch related data in one request:

```graphql
query {
    users {
        id
        name
        accounts { id balance }
    }
}
```

One request. Only the fields you asked for.

### Single endpoint, operation in the body

All operations — queries, mutations, subscriptions — go to `POST /graphql`. The body carries the operation type and payload:

```json
{
  "query": "mutation($input: DepositInput!) { deposit(input: $input) { id balance } }",
  "variables": { "input": { "userId": "...", "accountId": "...", "amount": 100 } }
}
```

No HTTP caching (no GET). Caching is handled at the application layer — Apollo Client on the frontend, or DataLoader on the server.

### Resolvers: root and type

Resolvers are server-side functions that handle each field. There are two levels:

**Root resolvers** — entry points, map to `Query`, `Mutation`, `Subscription`:
```typescript
Query: {
    users: () => users.values().toArray()
}
```

**Type resolvers** — fire for fields on a type when the client requests them:
```typescript
User: {
    accounts: (parent: User) => fetchAccountsForUser(parent.id)
}
```

When you query `users { accounts { ... } }`, Apollo fires `Query.users` first, then `User.accounts` once **per user** in the result. That's the N+1 problem.

### N+1 and DataLoader

With 10 users, `User.accounts` fires 10 times — one database call per user. With 1000 users, 1000 calls.

DataLoader fixes this by batching. Instead of fetching immediately, each `User.accounts` call registers its user ID with the loader. DataLoader collects all IDs in the current tick, then fires one batch call on the next tick with all of them:

```typescript
const accountDataLoader = new DataLoader(async (userIds: readonly string[]) => {
    // called ONCE with all userIds — one batch fetch
    return userIds.map(id => fetchAccountsForUser(id));
});
```

Watch the server logs when you run `Get All Users` — you'll see `DataLoader batch called with N userIds` fire once, regardless of how many users exist.

### WebSocket for subscriptions

Queries and mutations run over HTTP POST — one request, one response. Subscriptions need the server to push updates, so they run over WebSocket.

The server creates two handlers on the same port:
- HTTP → Express → Apollo → queries and mutations
- WebSocket → `graphql-ws` → subscriptions

When a client subscribes, `graphql-ws` opens a WebSocket connection. The server uses a pub/sub model internally — when a deposit happens, it publishes an event on a topic keyed by `userId + accountId`. The subscription resolver is an async iterator that yields each published event to connected clients.

## What to observe

1. **Create a user** — note the ID autofills into other fields
2. **Create an account** — same
3. **Subscribe to balance** — green box shows "Subscribed"
4. **Make deposits** — balance updates appear in the green box in real time, pushed from server
5. **Get All Users** — check server logs: `DataLoader batch called with N userIds` fires once for all users
6. **Network tab** — only POST requests for queries/mutations; one WebSocket connection for the subscription, reused for all events

## Production considerations

**In-memory PubSub doesn't scale.** `graphql-subscriptions` stores events in memory on a single server instance. In production, you run multiple instances behind a load balancer — a deposit hitting server 1 publishes to server 1's memory only. A client subscribed on server 2 never receives the event.

The fix is a shared pub/sub layer: [graphql-redis-subscriptions](https://github.com/davidyaha/graphql-redis-subscriptions) replaces the in-memory `PubSub` with Redis. All server instances publish and subscribe through Redis, so events reach every connected client regardless of which instance they're on.

## Dependencies

| Package | Purpose |
|---|---|
| `@apollo/server` | GraphQL server — parses SDL, routes operations to resolvers |
| `@graphql-tools/schema` | Builds an executable schema object from typeDefs + resolvers, shared between Apollo (HTTP) and graphql-ws (WebSocket) |
| `graphql` | Core engine used internally by Apollo and graphql-ws — parses, validates, and executes queries |
| `express` | HTTP server — handles POST /graphql for queries and mutations |
| `graphql-ws` | WebSocket transport for subscriptions — implements the `graphql-transport-ws` protocol |
| `ws` | Raw WebSocket server that graphql-ws runs on top of |
| `dataloader` | Batches resolver calls within a request tick — solves N+1 |
| `graphql-subscriptions` | In-memory pub/sub used to publish events from mutations to subscription resolvers |
