---
title: "Coordination Part 4: Hands-on Code"
date: 2026-09-05
categories: [Systems, Coordination]
tags: [concurrency, go, hands-on, mutex, semaphore, deadlock, lease, raft]
---

# Coordination Part 4: Hands-on Code

The first three parts walked up one ladder. [Part 1](../coordination-part-1-thread-level/) coordinated threads through shared memory, [Part 2](../coordination-part-2-process-level/) coordinated processes through a shared disk, and [Part 3](../coordination-part-3-distributed/) coordinated machines that share nothing but an unreliable network.

This part is where the code lives, and every program in it is small, self contained and written to be run rather than read, because most of these ideas only land once we have watched the failure happen on our own machine. Everything is plain Go with no dependencies, so `go run main.go` inside a folder is enough.

The most useful habit while working through these is to predict the output before running each one, since the interesting cases are precisely the ones where the prediction turns out to be wrong.

All of it lives under [`coordination/code`](https://github.com/ajit3259/systems-and-layers/tree/main/coordination/code) in the repository.

---

## Thread level

**[race-condition](https://github.com/ajit3259/systems-and-layers/tree/main/coordination/code/race-condition)**

A thousand goroutines each increment a shared counter a thousand times, which should give us a million and never does. The cause is that `counter++` compiles to three instructions, so increments from different goroutines interleave and overwrite each other.

*Watch for:* a total that is wrong and differently wrong on every run. Run it thirty times and notice the band is much narrower than pure randomness would suggest. Then run `go run -race main.go` and read what the race detector points at.

**[mutex](https://github.com/ajit3259/systems-and-layers/tree/main/coordination/code/mutex)**

The same counter, made correct by wrapping the value and the mutex that guards it in one struct, which is how we write down what the lock is actually protecting.

*Watch for:* a million every time, with the race detector silent when we run with `-race`.

**[lock-granularity](https://github.com/ajit3259/systems-and-layers/tree/main/coordination/code/lock-granularity)**

The same counter again, timed twice: once taking the lock per increment as the usual advice recommends, and once taking it around the whole loop.

*Watch for:* the coarse version winning by sixty to ninety times, which is the opposite of what the advice predicts. Part 1 explains why, and the short version is that there was no parallelism available to win here in the first place, so the finer lock buys nothing and costs a million atomic operations.

**[semaphore](https://github.com/ajit3259/systems-and-layers/tree/main/coordination/code/semaphore)**

A movie hall with two seats and ten goroutines that want in, built on the fact that a buffered channel of size N behaves exactly like a semaphore with count N.

*Watch for:* never more than two goroutines inside at once, with the other eight blocked on the send until a seat frees up.

**[producer-consumer](https://github.com/ajit3259/systems-and-layers/tree/main/coordination/code/producer-consumer)**

Three producers, two consumers and a bounded queue between them, where the queue is a buffered channel that is already doing the work of both semaphores and the internal locking.

*Watch for:* the shutdown rather than the work. Clean shutdown needs two separate WaitGroups, and collapsing them into one deadlocks the program, which is worth doing once so the trace is familiar when it happens for real.

**[deadlock](https://github.com/ajit3259/systems-and-layers/tree/main/coordination/code/deadlock)**

Two goroutines taking two mutexes in opposite order, which forms a circular wait that neither can escape.

*Watch for:* Go printing `fatal error: all goroutines are asleep`. Then delete the `time.Sleep` between the two acquisitions and watch the bug hide itself, because that is the part that makes deadlock dangerous in a codebase with tests.

There is no program here for condition variables, and that is deliberate. Go has `sync.Cond`, but the idiomatic answer to waiting until a queue has something in it is a channel, so the producer-consumer example is the Go version of that idea. Part 1 covers the mechanism itself and the missed wakeup problem it exists to solve.

---

## Process level

**[file-lock](https://github.com/ajit3259/systems-and-layers/tree/main/coordination/code/file-lock)**

Several processes compete to be the one leader, coordinating only through a file on disk. The lock is a lease, meaning a lock that expires, so a leader that crashes without releasing anything cannot block the system forever.

This one needs a little orchestration, so start three processes in separate terminals pointing at the same lock file:

```bash
go run main.go /tmp/leader.lock
```

Two experiments are worth running, and the gap between them is the entire argument for the graceful shutdown code:

```bash
kill -9  <leader pid>     # hard crash, no chance to release
kill -TERM <leader pid>   # graceful, the leader deletes the lock file on the way out
```

*Watch for:* how long the cluster spends with nobody in charge. On my machine the hard kill left it leaderless for 9.53 seconds while the graceful one was replaced in 0.31 seconds. The built-in crash simulation fires between 15 and 30 seconds and will kill processes out from under these experiments, so comment it out before timing anything.

There is also a bug left in this program on purpose, which Part 2 explains. If a process dies between creating the lock file and writing the lease into it then the file exists but is empty, and every watcher afterwards loops forever on a file it can neither read nor recreate. Reproduce it by running `touch /tmp/leader.lock` before starting anything.

---

## Distributed level

**[raft](https://github.com/ajit3259/systems-and-layers/tree/main/coordination/code/raft)**

Three nodes that share no memory and no disk have to agree on a single leader, using terms as a logical clock, randomized election timeouts, majority voting, and stepping down whenever a higher term is seen. Run it with `go run .` rather than `go run main.go`, since it is spread across three files.

*Watch for:* one election at startup and then steady heartbeats. Node 0 is crashed at ten seconds, and if it happened to be the leader then the survivors elect a new one in a higher term. The program never exits on its own, so stop it with Ctrl-C. Across 13 runs where node 0 was the leader, failover took 3 to 11 seconds, and 5 of those 13 saw both survivors time out together, split the vote and need a second election before anybody won.

**This follows Raft's ideas and is not an implementation of Raft.** Nothing is persisted, so a node that restarts forgets what it voted for, which breaks the safety argument the real protocol depends on. The log exists but nothing is ever replicated into it, the cluster is fixed at three nodes, and the network is a set of in-process channels that never reorder or duplicate anything. For the actual specification, work from Figure 2 of the extended paper at [raft.github.io](https://raft.github.io).

The most instructive change to make here is to replace the `send` helper with a plain blocking channel send, which is how the code was originally written. The cluster then wedges roughly twelve seconds after the crash, because the leader blocks forever trying to reach a node that is no longer draining its inbox, and a crashed node's inbox holds only ten messages. Part 3 has the trace and the diagnosis, and it is a good reminder that a distributed algorithm is only as sound as the transport we assumed underneath it.

---

## What running them actually teaches

Reading about a lost update is not the same as watching the number come out different on every run, and reading about deadlock is not the same as deleting one `time.Sleep` and watching a real bug vanish from the test output while remaining in the code.

Two of the bugs written up in this series were found by running these programs rather than by reading them. One is the empty lock file that wedges every watcher in `file-lock`, and the other is the blocking send that wedges the whole cluster in `raft`, and both were sitting in code that looked correct and had been working for weeks. That is the argument for the whole exercise. None of these failures are exotic, they are the ordinary consequence of two steps that needed to be one, and they are far easier to recognise later if we have watched them happen once in front of us.
