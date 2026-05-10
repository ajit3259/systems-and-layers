# Race Condition

Demonstrates a lost update — the most common consequence of unsynchronized shared state.

1000 goroutines each increment a shared counter 1000 times. Expected result: 1,000,000. Actual result: significantly less, and different every run.

## Run

```bash
go run main.go
```

## See the race detector catch it

```bash
go run -race main.go
```

The race detector identifies the exact memory address and goroutines involved in the conflict.

## What to observe

- Final count is wrong and non-deterministic
- Race detector reports concurrent read and write at the same address
- The root cause: `counter++` compiles to LOAD, ADD, STORE — three instructions that can be interleaved across goroutines
