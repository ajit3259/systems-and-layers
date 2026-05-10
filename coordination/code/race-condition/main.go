package main

import "sync"

const LIMIT int = 1000

var counter int = 0

func increment(wg *sync.WaitGroup) {
	defer wg.Done()
	for range LIMIT {
		counter++
	}
}

// main spins up LIMIT go routines and waits for them to complete
func main() {
	var wg sync.WaitGroup
	println("Initial value of counter is: ", counter)
	for range LIMIT {
		wg.Add(1)
		go increment(&wg)
	}
	wg.Wait()
	println("Final value of counter is: ", counter)
}
