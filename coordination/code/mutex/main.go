package main

import "sync"

const LIMIT int = 1000

type safeCounter struct {
	count int
	mu    sync.Mutex
}

func increment(wg *sync.WaitGroup, counter *safeCounter) {
	defer wg.Done()
	for range LIMIT {
		counter.mu.Lock()
		counter.count++
		counter.mu.Unlock()
	}
}

func main() {
	var wg sync.WaitGroup
	counter := safeCounter{
		count: 0,
	}

	println("Initial value of counter is: ", counter.count)

	for range LIMIT {
		wg.Add(1)
		go increment(&wg, &counter)
	}

	wg.Wait()
	println("Final value of counter is: ", counter.count)
}
