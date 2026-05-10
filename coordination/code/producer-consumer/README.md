# Producer-Consumer

Classic coordination pattern: producers generate work, consumers process it, with a bounded queue in between.

3 producers each send 5 jobs into a buffered channel. 2 consumers read from it. A job is a duration in milliseconds — the consumer sleeps that long to simulate work.

## Run

```bash
go run main.go
```

## What to observe

- Producers and consumers interleave naturally
- Channel acts as a thread-safe bounded queue — no separate mutex needed
- Two separate WaitGroups are required: one for producers (to know when to close the channel), one for consumers (to know when all work is done)
- Closing the channel signals consumers to stop — `range ch` exits cleanly when the channel is closed

## Why two WaitGroups

Using one WaitGroup for both causes deadlock: the channel never closes because consumers are still running, and consumers never stop because the channel never closes.
