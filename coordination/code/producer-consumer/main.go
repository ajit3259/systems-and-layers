package main

import (
	"math/rand"
	"sync"
	"time"
)

const (
	PRODUCER_CNT     = 3
	JOB_CNT          = 5
	MAX_JOB_DURATION = 101
	CONSUMER_CNT     = 2
	JOB_QUEUE_SIZE   = 3
)

func producer(wg *sync.WaitGroup, ch chan int, id int) {
	defer wg.Done()
	for range JOB_CNT {
		job_duration := rand.Intn(MAX_JOB_DURATION)
		println("producer: ", id, " adding job with duration: ", job_duration, "ms")
		ch <- job_duration
	}
}

func consumer(wg *sync.WaitGroup, ch chan int, id int) {
	defer wg.Done()
	for job_duration := range ch {
		println("consumer: ", id, " working on job for: ", job_duration, "ms")
		time.Sleep(time.Duration(job_duration) * time.Millisecond)
	}
}

func main() {
	var producer_wg sync.WaitGroup
	var consumer_wg sync.WaitGroup

	ch := make(chan int, JOB_QUEUE_SIZE)

	for i := range PRODUCER_CNT {
		producer_wg.Add(1)
		go producer(&producer_wg, ch, i)
	}

	for i := range CONSUMER_CNT {
		consumer_wg.Add(1)
		go consumer(&consumer_wg, ch, i)
	}

	go func() {
		producer_wg.Wait()
		close(ch)
	}()
	consumer_wg.Wait()
}
