# Semaphore

Demonstrates a semaphore — a generalization of a mutex that allows N concurrent holders instead of one.

Modeled as a movie hall with 2 seats and 10 goroutines competing for them. Go's `sync` package has no built-in semaphore; a buffered channel serves the same purpose naturally.

## Run

```bash
go run main.go
```

## What to observe

- At most 2 goroutines are watching simultaneously at any point
- Others print "waiting for seat" and block until a seat is released
- A buffered channel of size N behaves exactly like a semaphore with count N: sending blocks when full (acquire), receiving unblocks a waiting sender (release)
