# Part 3: Hands-on Code

← [Part 2: Under the Hood](../part-2-under-the-hood.md)

Each implementation demonstrates one communication style through the banking app scenario from Part 1. Run them, observe the network behaviour, read the README in each folder.

## Implementations

- [REST](./rest-server/) — HTTP verbs, status codes, ETag caching
- [SSE](./sse-server/) — server push, live balance updates, persistent connection
- [WebSocket](./ws-server/) — bidirectional, real-time customer support chat
- [gRPC](./grpc-server/) — internal service-to-service, binary protocol, strict contracts, streaming
- [GraphQL](./graphql-server/) — flexible client queries, mutations, subscriptions, N+1 and DataLoader
