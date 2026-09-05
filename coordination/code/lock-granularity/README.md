# Lock Granularity

Times two correct versions of the same counter to show that "keep critical sections small" is a heuristic with conditions attached.

Both versions produce 1,000,000. The only difference is where the lock is taken:

- **fine** locks and unlocks once per increment, which is the granularity the usual advice recommends
- **coarse** takes the lock once and holds it for all 1000 increments

## Run

```bash
go run main.go
```

## What to observe

The coarse version wins by roughly sixty to ninety times:

```
fine     count=1000000  elapsed=85.605458ms
coarse   count=1000000  elapsed=929.625µs
         coarse is 92x faster
```

The first of the three rounds is consistently the worst for the fine-grained version.

## Why

Every increment touches the same counter, so every increment is serialized in both versions and the total serialized work is identical. The fine-grained version simply wraps a million lock and unlock operations around that same work, with a thousand goroutines contending for one mutex, parking and waking, and passing a single cache line between cores.

Fine-grained locking pays off when goroutines have work they can do outside the lock, so that a shorter critical section lets that outside work overlap. Here there is no outside, because the critical section is the entire job.

Read the result for what it is: one machine, one workload where the shared state is all there is. Put real work between the increments and the ranking flips back.
