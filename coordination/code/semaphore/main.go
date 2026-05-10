package main

import (
	"math/rand"
	"sync"
	"time"
)

const GO_ROUNTINE_CNT = 10
const MOVIE_SLOTS = 2
const MAX_MILLISECONDS = 10000

func movie_watcher(wg *sync.WaitGroup, sem chan struct{}, id int) {
	defer wg.Done()

	println("goroutine: ", id, " waiting for seat")
	sem <- struct{}{}

	interval := rand.Intn(MAX_MILLISECONDS)
	println("goroutine: ", id, " watching movie for: ", interval, " ms")
	time.Sleep(time.Duration(interval) * time.Millisecond)
	<-sem
	println("goroutine: ", id, " left seat")
}

func main() {
	var wg sync.WaitGroup
	println("Starting movie watching simulation....")

	sem := make(chan struct{}, MOVIE_SLOTS)

	for i := range GO_ROUNTINE_CNT {
		wg.Add(1)
		go movie_watcher(&wg, sem, i)
	}

	wg.Wait()
	println("simulation ends")
}
