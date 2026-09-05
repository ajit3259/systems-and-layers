# Raft Leader Election

Three nodes that share no memory and no disk agree on a single leader, using terms, randomized election timeouts and majority voting.

This follows Raft's core ideas. It is not an implementation of Raft. See the limitations at the bottom before drawing any conclusions from it.

## Run

The program is spread across three files, so run the package rather than a single file:

```bash
go run .
```

It never exits on its own. Stop it with Ctrl-C.

## The files

- `messages.go` defines the four message types (VoteRequest, VoteResponse, Heartbeat, HeartbeatAck) behind a `Message` interface
- `node.go` defines `NodeState`, the three roles and a log entry
- `main.go` holds the event loop in `runNode`, plus the crash simulation

## What to observe

- One election at startup. A follower's timer expires, it becomes a candidate, increments the term and asks the other two for votes
- Steady heartbeats once a second afterwards, which is what stops anybody else starting an election
- Node 0 is crashed at ten seconds by cancelling its context. If node 0 was a follower the cluster carries on, because two of three is still a majority
- If node 0 was the leader, a survivor times out and wins a new term. Across 13 such runs failover took 3 to 11 seconds
- Sometimes both survivors time out at the same instant, each votes for itself, neither reaches a majority, and the term produces no leader at all. They retry with fresh random timeouts. This happened in 5 of those 13 runs

## Two bugs worth reintroducing

**Blocking sends.** Replace the `send` helper with a direct `ch <- msg` and run it again. Roughly twelve seconds after the crash the whole cluster wedges with `all goroutines are asleep`. A crashed node stops draining its inbox, the buffer holds ten messages, and the eleventh send blocks the leader forever. A blocking send models a network that waits indefinitely for a dead machine, which no real network does.

**Shared state across goroutines.** Move `sendHeartbeats` back into its own goroutine with a ticker. It then reads `node.role` and `node.currentTerm` while `runNode` writes them, with no synchronisation. The race detector will probably stay quiet, because in this scenario a live leader never steps down and the conflicting write never happens, which makes it a latent bug rather than a safe one. The fix used here is to stop sharing rather than to add a lock.

## What this does not do

- **No persistence.** Real Raft requires `currentTerm`, `votedFor` and the log to be flushed to disk before a node replies. Without that, a node can vote, crash, restart with no memory and vote again in the same term, which allows two leaders in one term
- **No log replication.** The log exists but nothing is ever appended, so `len(node.log)` is always zero and the up-to-date check always passes
- **Fixed membership.** Three nodes, hardcoded, with no way to add or remove one
- **Not a network.** Messages travel over in-process channels, so they are never reordered or duplicated, and are only dropped in the one case the `send` helper creates

For the actual specification, work from Figure 2 of the extended paper at [raft.github.io](https://raft.github.io), which is the one-page summary of the whole protocol.
