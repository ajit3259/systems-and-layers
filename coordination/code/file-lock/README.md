# File Lock

Demonstrates process-level lease coordination using a lock file on disk.

Multiple processes compete to become leader. The leader holds an exclusive lock file with a timestamp (the lease). Followers watch the file and take over if the lease expires, handling crashes without any central coordinator.

## Run

Start three processes in separate terminals, all pointing at the same lock file:

```bash
go run main.go /tmp/leader.lock
```

Each process will either acquire the lease immediately (becoming leader) or start watching. Kill a process with Ctrl-C or let the crash simulation fire, a follower will take over within one lease period.

## What to observe

- Only one process is leader at any time: O_EXCL guarantees at most one winner
- Followers poll every 3s and print the current lease holder and expiry
- When a leader crashes, followers detect the expired lease and race to take over
- Graceful shutdown (Ctrl-C) removes the lock file immediately: the next leader takes over in ~3s instead of waiting out the full 9s lease
- The crash simulation fires after 15 to 29 seconds so you can watch the full lifecycle without manual intervention. Comment it out before timing anything, since it will kill processes in the middle of an experiment

## Known bug

If a process dies between the `O_EXCL` create and the write of the lease body, the lock file exists but is empty. Every watcher then fails to parse it, calls `tryAcquireLease`, is correctly refused by `O_EXCL` because the file does exist, and loops forever. Nobody ever becomes leader and there is no expiry to wait out, because an empty file has no expiry in it.

Reproduce it with `touch /tmp/leader.lock` before starting any process.

The fix is either to write the content to a temporary file and `rename` it into place, which is atomic, or to move to a store where setting a value with a TTL is a single operation, such as Redis `SET key value NX PX 9000`. The bug is left here on purpose because it is the point of the exercise.

## The lease mechanism

A lease is a lock with a timeout. Instead of holding a mutex indefinitely, the leader writes a file containing its PID and an expiry timestamp. It must renew before expiry or it loses leadership automatically, even if it crashes and can never release.

```
lock file contents:
{ "processId": 12345, "leaseUntil": 1715430000 }
```

Three intervals control the behavior:
- **LEASE_DURATION (9s)**: how long the lease is valid
- **RENEW_INTERVAL (3s)**: how often the leader renews (must be < LEASE_DURATION)
- **WATCH_INTERVAL (3s)**: how often followers check the file

## Atomic acquisition with O_EXCL

`os.OpenFile` with `O_CREATE|O_EXCL` fails if the file already exists, this is atomic at the OS level because the filesystem inode creation is a single syscall. Two processes racing to create the same file: exactly one succeeds.

```
tryAcquireLease:
  1. O_EXCL create: fails if file exists (another leader holds it)
  2. Write PID + expiry: if this fails, remove the empty file to clean up
```

Takeover on expiry uses the same primitive: remove the expired file, then O_EXCL create. The remove+create gap is a race, if two watchers both see expiry, both try to remove, one gets the file, one gets an error. Only the winner proceeds to O_EXCL create.

## False leader window

When a leader crashes without releasing the lease, followers must wait for the full LEASE_DURATION to expire before taking over. During this window there is no active leader, the crashed process can no longer act on the lease, and followers won't touch a valid one.

This gap is unavoidable for hard crashes. The SIGTERM handler closes it for graceful shutdown:

```go
signal.Notify(sigChan, syscall.SIGTERM, syscall.SIGINT)
<-sigChan
if role == "renewal" {
    os.Remove(lockFileNamePath)  // release immediately
}
```

## Role transitions

Both routines (renewal, watcher) communicate back to main via a single `swapSignal` channel. When a goroutine sends on the channel, it returns, main spins up the opposite routine. This keeps role state in one place and avoids concurrent goroutines fighting over the lock file.

## The substrate is swappable

The disk is just the shared medium for atomic create. The same lease principle works with:
- **Redis**: `SET key value NX PX 9000`: atomic acquire with built-in TTL, no false leader window on crash
- **etcd / ZooKeeper**: distributed atomic primitives with watch callbacks instead of polling
- **Database**: INSERT with unique constraint as the O_EXCL equivalent

The lease logic, acquire, renew, watch, expire, takeover, stays identical regardless of substrate.
