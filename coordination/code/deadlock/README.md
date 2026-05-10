# Deadlock

Demonstrates deadlock and its fix through consistent lock ordering.

Two goroutines, two mutexes. In the deadlock version each goroutine acquires the locks in opposite order — circular wait forms and neither can proceed. The fix: both goroutines acquire in the same order, breaking the cycle.

## Run

To see the deadlock, swap the lock acquisition order in `routine_2` back to `second_mu` first, then `first_mu`. Then:

```bash
go run main.go
```

With consistent ordering (current code):

```bash
go run main.go
```

## What to observe

- Deadlock version: Go runtime detects "all goroutines are asleep" and panics with a full trace showing which goroutine is waiting for which lock
- Fixed version: both routines complete, one after the other
- The `time.Sleep` between acquisitions makes interleaving reliable — without it, one goroutine might grab both locks before the other starts

## The four conditions for deadlock

All four must hold simultaneously:
1. Mutual exclusion — only one holder at a time
2. Hold and wait — holding one lock while waiting for another
3. No preemption — locks cannot be forcibly taken
4. Circular wait — A waits for B, B waits for A

Consistent lock ordering breaks condition 4.
