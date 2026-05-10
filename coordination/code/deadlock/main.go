package main

import (
	"sync"
	"time"
)

type doubleLock struct {
	first_mu  sync.Mutex
	second_mu sync.Mutex
}

func rountine_1(wg *sync.WaitGroup, locks *doubleLock) {
	defer wg.Done()
	locks.first_mu.Lock()
	println("Routine 1 acquired lock 1")
	time.Sleep(10 * time.Millisecond)
	locks.second_mu.Lock()
	println("Routine 1 acquired lock 2")
	locks.first_mu.Unlock()
	println("Routine 1 released lock 1")
	locks.second_mu.Unlock()
	println("Routine 1 released lock 2")
}

func rountine_2(wg *sync.WaitGroup, locks *doubleLock) {
	defer wg.Done()
	locks.second_mu.Lock()
	println("Routine 2 acquired lock 2")
	time.Sleep(10 * time.Millisecond)
	locks.first_mu.Lock()
	println("Routine 2 acquired lock 1")
	locks.second_mu.Unlock()
	println("Routine 2 released lock 2")
	locks.first_mu.Unlock()
	println("Routine 2 released lock 1")
}

func main() {
	var locks doubleLock
	println("Demonstrating Deadlock using two go routines and two mutexes...")

	var wg sync.WaitGroup
	wg.Add(2)
	go rountine_1(&wg, &locks)
	go rountine_2(&wg, &locks)
	wg.Wait()
}

// to fix the deadlock here we can order that both routines first try to acquire lock1 and then lock2
// consistent ordering enusres no circular wait
