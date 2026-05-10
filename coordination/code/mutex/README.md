# Mutex

Fixes the race condition from the previous example using a mutex.

The counter and its mutex are wrapped in a `safeCounter` struct — idiomatic Go that keeps the lock physically close to what it protects. The mutex is locked and unlocked around each increment, making the critical section atomic.

## Run

```bash
go run main.go
go run -race main.go
```

## What to observe

- Final count is always 1,000,000
- Race detector reports no issues
- Lock granularity: mutex is acquired per increment, not per goroutine — keeps the critical section small so other goroutines can interleave between increments
