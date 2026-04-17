# gRPC Banking Demo

A hands-on server to understand gRPC.

The scenario: an internal banking service needs high-throughput account operations between services. REST works but is verbose — JSON over HTTP/1.1, no enforced contract, text overhead on every call. gRPC fits: binary protocol, strict schema, HTTP/2 multiplexing, and native streaming.

## Running

```bash
npm install
npm run generate   # generate TypeScript types from .proto
npm run build
npm start          # server on port 50051
```

In a separate terminal:
```bash
node dist/client.js
```

## How it works

### The contract: protobuf

Everything starts with `banking.proto`. The schema defines messages and the service:

```protobuf
service AccountService {
    rpc CreateAccount(CreateAccountRequest) returns (Account);
    rpc GetAccount(AccountRequest) returns (Account);
    rpc Deposit(DepositRequest) returns (Account);
    rpc WatchBalance(AccountRequest) returns (stream BalanceUpdate);
}
```

`ts-proto` generates TypeScript types and a client/server interface from this file. The generated code is the only place where field names and types are defined — server and client both import from it. If you change the proto, both sides break at compile time, not at runtime.

### Binary encoding

Protobuf encodes each field as `(field_number << 3) | wire_type` followed by the value. No field names on the wire — just numbers. Field 1 (`id`) with a string value encodes as tag `0x0a`, length, then UTF-8 bytes.

This is why field numbers in the proto must never change — removing or renumbering a field breaks all existing clients silently. Names can change freely; numbers cannot.

### HTTP/2 multiplexing

gRPC runs on HTTP/2. Multiple RPCs share one TCP connection as separate streams — no head-of-line blocking, no per-domain connection limits. Compare to HTTP/1.1 where each request needs its own connection slot.

### Four RPC types

gRPC has four patterns. This server uses two:

**Unary** — one request, one response (callback pattern):
```typescript
createAccount: (call, callback) => {
    callback(null, account);   // success
    callback({ code: status.NOT_FOUND, message: "..." }, null);  // error
}
```

**Server streaming** — one request, stream of responses (write/close pattern):
```typescript
watchBalance: (call) => {
    call.write(balanceUpdate);   // push an update
    call.on("close", cleanup);   // client disconnected
}
```

The other two (client streaming, bidirectional) aren't used here but follow the same pattern with `call.read()`.

### Active stream tracking

The server maintains a map of open `watchBalance` streams per account:
```
activeStreams: Map<accountId, ServerWritableStream[]>
```

When a deposit happens → write a `BalanceUpdate` to all streams watching that account.  
When a client disconnects → `call.on("close")` fires, remove its stream from the map.

### Error codes

gRPC has its own status code system — not HTTP status codes:
```
status.NOT_FOUND        → 5   (equivalent to HTTP 404)
status.INVALID_ARGUMENT → 3   (equivalent to HTTP 400)
```

These map to `code` on the error object the client receives.

## What to observe

Run the client and watch the output sequence:

1. Account created — balance 0
2. `getAccount` returns the same account
3. `getAccount` with `"Invalid"` → `NOT_FOUND` error with `code: 5`
4. Deposit `-2` → `INVALID_ARGUMENT` error with `code: 3`
5. Valid deposit → balance 50
6. `watchBalance` stream opens — initial balance printed
7. Every 10 seconds: deposit fires, balance update streams in (50 → 100 → 150 ...)

The streaming updates in step 7 are server-push — the client didn't ask again. One open stream, server writes to it each time the balance changes.

## API

```
rpc CreateAccount(CreateAccountRequest) → Account
rpc GetAccount(AccountRequest)          → Account
rpc Deposit(DepositRequest)             → Account
rpc WatchBalance(AccountRequest)        → stream BalanceUpdate
```
