---
layout: default
title: "API Patterns: Part 3 — Hands-on Code"
parent: API Patterns
nav_order: 3
---

# Part 3: Hands-on Code

← [Part 2: Under the Hood](../part-2-under-the-hood)

In Part 1 we discussed how API communication can be layered as protocol + communication style + data format, and how different scenarios call for different patterns. In Part 2 we looked at the mechanics of each pattern — what happens on the wire.

In this part we go hands-on. Each implementation builds a piece of the same banking system, chosen to put one communication style in its natural habitat. The goal is not just to make it run — it's to observe the strengths and tradeoffs in action: network behaviour in DevTools, error handling, streaming, reconnection, delivery guarantees.

Each scenario lives in its own folder with a full README and an interactive webpage to run and observe.

## Implementations

| Scenario | Problem | How it's solved | Stack |
|---|---|---|---|
| [REST](https://github.com/ajit3259/systems-and-layers/tree/main/api-patterns/code/rest-server) | Bank needs to manage accounts — create, read, deposit, withdraw | Client hits resource endpoints, server responds with status codes. Demonstrates HTTP verbs, idempotency, and ETag caching | Express + Node + TypeScript |
| [SSE](https://github.com/ajit3259/systems-and-layers/tree/main/api-patterns/code/sse-server) | Bank needs to push live balance updates without the client refreshing | Client opens a persistent HTTP connection, server streams events down it as balance changes | Express + Node + TypeScript |
| [WebSocket](https://github.com/ajit3259/systems-and-layers/tree/main/api-patterns/code/ws-server) | Bank needs to support real-time customer support chat between customers and agents | Bidirectional connection over a single persistent socket — both sides send at any time | ws + Express + Node + TypeScript |
| [gRPC](https://github.com/ajit3259/systems-and-layers/tree/main/api-patterns/code/grpc-server) | Bank has internal services that need fast, low-latency communication with strict contracts | Binary encoding (protobuf) reduces payload size, HTTP/2 multiplexing reduces connection overhead. Also demonstrates server-side streaming for live balance updates | grpc-js + Node + TypeScript |
| [GraphQL](https://github.com/ajit3259/systems-and-layers/tree/main/api-patterns/code/graphql-server) | Bank needs to serve various clients who want different shapes of data for users and their accounts | Clients define exactly what fields they need. Demonstrates queries, mutations, subscriptions, the N+1 problem, and DataLoader batching | Apollo Server + Express + graphql-ws + Node + TypeScript |
| [MQTT](https://github.com/ajit3259/systems-and-layers/tree/main/api-patterns/code/mqtt-server) | Bank needs to monitor 10,000 ATMs over unreliable satellite connections | ATMs publish health to a broker over topic hierarchy. Bank subscribes via wildcard. Demonstrates QoS levels, retained messages, and automatic reconnection | Mosquitto + mqtt + Node + TypeScript |

Each tutorial also includes an interactive webpage so you can observe network behaviour in the browser DevTools without writing client code.
