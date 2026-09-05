package main

import (
	"fmt"
	"sync"
	"time"
)

const GOROUTINE_CNT = 1000
const LIMIT = 1000

type safeCounter struct {
	count int
	mu    sync.Mutex
}

// fine locks and unlocks once per increment, which is the granularity the usual
// advice recommends: keep the critical section as small as possible.
func fine(counter *safeCounter, wg *sync.WaitGroup) {
	defer wg.Done()
	for range LIMIT {
		counter.mu.Lock()
		counter.count++
		counter.mu.Unlock()
	}
}

// coarse takes the lock once and holds it for all LIMIT increments.
func coarse(counter *safeCounter, wg *sync.WaitGroup) {
	defer wg.Done()
	counter.mu.Lock()
	for range LIMIT {
		counter.count++
	}
	counter.mu.Unlock()
}

func run(name string, worker func(*safeCounter, *sync.WaitGroup)) time.Duration {
	counter := &safeCounter{}
	var wg sync.WaitGroup

	start := time.Now()
	for range GOROUTINE_CNT {
		wg.Add(1)
		go worker(counter, &wg)
	}
	wg.Wait()
	elapsed := time.Since(start)

	fmt.Printf("%-8s count=%d  elapsed=%v\n", name, counter.count, elapsed)
	return elapsed
}

func main() {
	fmt.Printf("%d goroutines, %d increments each\n\n", GOROUTINE_CNT, LIMIT)
	for i := range 3 {
		fineTime := run("fine", fine)
		coarseTime := run("coarse", coarse)
		fmt.Printf("         coarse is %.0fx faster\n", float64(fineTime)/float64(coarseTime))
		if i < 2 {
			fmt.Println()
		}
	}
}
