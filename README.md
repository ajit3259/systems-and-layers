# Systems and Layers

A collection of deep dives into systems topics, written from first principles and built hands-on.

Each topic follows the same arc: understand the problem, learn the tools, build something real, write it down clearly enough to teach it.

## Topics

### [Coordination and Consensus](https://systemsandlayers.com/categories/coordination/)

One problem at three scales: threads sharing memory, processes sharing a disk, and machines sharing only an unreliable network.

- [Part 1: Threads in One Process](https://systemsandlayers.com/systems/coordination/coordination-part-1-thread-level/)
- [Part 2: Processes on One Machine](https://systemsandlayers.com/systems/coordination/coordination-part-2-process-level/)
- [Part 3: Machines on a Network](https://systemsandlayers.com/systems/coordination/coordination-part-3-distributed/)
- [Part 4: Hands-on Code](https://systemsandlayers.com/systems/coordination/coordination-part-4-hands-on/)

Code in [`coordination/code`](./coordination/code/), all Go with no dependencies:

| | |
|---|---|
| [race-condition](./coordination/code/race-condition/) | a lost update, and the race detector finding it |
| [mutex](./coordination/code/mutex/) | the same counter, made correct |
| [lock-granularity](./coordination/code/lock-granularity/) | fine against coarse locking, timed |
| [semaphore](./coordination/code/semaphore/) | a buffered channel as a semaphore |
| [producer-consumer](./coordination/code/producer-consumer/) | a bounded queue, and why shutdown needs two WaitGroups |
| [deadlock](./coordination/code/deadlock/) | circular wait, and the ordering that prevents it |
| [file-lock](./coordination/code/file-lock/) | leases across processes, with a lock file on disk |
| [raft](./coordination/code/raft/) | leader election following Raft's ideas |

### [API Patterns](https://systemsandlayers.com/categories/api-patterns/)

Choosing between REST, gRPC, GraphQL, SSE, WebSocket and MQTT, worked through one banking app.

- [Part 1: The Decision Framework](https://systemsandlayers.com/systems/api-patterns/api-patterns-part-1-decision-framework/)
- [Part 2: Under the Hood](https://systemsandlayers.com/systems/api-patterns/api-patterns-part-2-under-the-hood/)
- [Part 3: Hands-on Code](https://systemsandlayers.com/systems/api-patterns/api-patterns-part-3-hands-on/)

Code in [`api-patterns/code`](./api-patterns/code/), one runnable server per pattern.

## Website

Published at [systemsandlayers.com](https://systemsandlayers.com/)
