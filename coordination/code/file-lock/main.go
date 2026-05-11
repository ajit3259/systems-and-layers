package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"
)

const WATCH_INTERVAl = 3 * time.Second
const RENEW_INTERVAL = 3 * time.Second
const LEASE_DURATION = 9 * time.Second

type leaseContent struct {
	ProcessId  int   `json:"processId"`
	LeaseUntil int64 `json:"leaseUntil"`
}

func getLeaseContent(lockFileNamePath string) (*leaseContent, error) {
	fileBytes, err := os.ReadFile(lockFileNamePath)
	if err != nil {
		return nil, err
	}
	var content leaseContent
	err = json.Unmarshal(fileBytes, &content)
	if err != nil {
		return nil, err
	}
	return &content, nil
}

func updateLeaseContent(lockFileNamePath string, data *leaseContent) error {
	if data == nil {
		return errors.New("data cannot be nil")
	}

	byteData, err := json.Marshal(data)
	if err != nil {
		return err
	}
	err = os.WriteFile(lockFileNamePath, byteData, 0644)
	return err
}

func tryAcquireLease(processId int, lockFileNamePath string) error {
	f, err := os.OpenFile(lockFileNamePath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	f.Close()

	data := leaseContent{
		ProcessId:  processId,
		LeaseUntil: time.Now().Add(LEASE_DURATION).Unix(),
	}
	err = updateLeaseContent(lockFileNamePath, &data)
	if err != nil {
		os.Remove(lockFileNamePath) // clean up empty file
		return err
	}
	fmt.Printf("[Process: %d] [LEADER] Acquired lease at %s, valid until %s\n", processId, time.Now().Format(time.RFC3339), time.Now().Add(LEASE_DURATION).Format(time.RFC3339))
	return nil
}

// watcher watches the lock file contents and takes action of leasing if it has expired
// or not hold by any process
func watcherRoutine(processId int, lockFileNamePath string, swapSignal chan struct{}) {
	ticker := time.NewTicker(WATCH_INTERVAl)
	defer ticker.Stop()

	for range ticker.C {
		content, err := getLeaseContent(lockFileNamePath)
		if err != nil {
			// treating all read errors as acquisition opportunities. This includes transient
			// errors like I/O failures, not just not-found or malformed content. Safe because
			// tryAcquireLease uses O_EXCL so a valid leader will block the attempt.
			err = tryAcquireLease(processId, lockFileNamePath)
			if err == nil {
				swapSignal <- struct{}{}
				return
			} else {
				fmt.Printf("[Process: %d] [WATCHER] Could not read lease file, will retry\n", processId)
			}
			continue
		}
		expiresAt := time.Unix(content.LeaseUntil, 0).Format(time.RFC3339)
		if content.LeaseUntil < time.Now().Unix() {
			fmt.Printf("[Process: %d] [WATCHER] Lease held by %d expired at %s, attempting takeover\n", processId, content.ProcessId, expiresAt)
			err = os.Remove(lockFileNamePath)
			if err != nil {
				fmt.Printf("[Process: %d] [WATCHER] Failed to remove expired lease, will retry\n", processId)
				continue
			}
			f, err := os.OpenFile(lockFileNamePath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0644)
			if err != nil {
				fmt.Printf("[Process: %d] [WATCHER] Lost takeover race, another process acquired first\n", processId)
				continue
			}
			f.Close()
			data := leaseContent{
				ProcessId:  processId,
				LeaseUntil: time.Now().Add(LEASE_DURATION).Unix(),
			}
			err = updateLeaseContent(lockFileNamePath, &data)
			if err != nil {
				fmt.Printf("[Process: %d] [WATCHER] Failed to write new lease, will retry\n", processId)
				continue
			}
			fmt.Printf("[Process: %d] [WATCHER] Takeover successful, now leader until %s\n", processId, time.Unix(data.LeaseUntil, 0).Format(time.RFC3339))
			swapSignal <- struct{}{}
			return
		} else {
			fmt.Printf("[Process: %d] [WATCHER] Lease held by %d, valid until %s\n", processId, content.ProcessId, expiresAt)
		}
	}
}

func renewalRoutine(processId int, lockFileNamePath string, swapSignal chan struct{}) {
	consecutiveFailures := 0
	ticker := time.NewTicker(RENEW_INTERVAL)
	defer ticker.Stop()

	for range ticker.C {
		content, err := getLeaseContent(lockFileNamePath)
		if err != nil {
			consecutiveFailures++
			if consecutiveFailures >= 3 {
				fmt.Printf("[Process: %d] [LEADER] Lease file unreadable, stepping down\n", processId)
				swapSignal <- struct{}{}
				return
			}
			fmt.Printf("[Process: %d] [LEADER] Could not read lease file, will retry\n", processId)
			continue
		}

		consecutiveFailures = 0
		if content.ProcessId != processId {
			fmt.Printf("[Process: %d] [LEADER] Lease taken by %d, stepping down to watcher\n", processId, content.ProcessId)
			swapSignal <- struct{}{}
			return
		}
		content.LeaseUntil = time.Now().Add(LEASE_DURATION).Unix()
		err = updateLeaseContent(lockFileNamePath, content)
		if err != nil {
			fmt.Printf("[Process: %d] [LEADER] Failed to renew lease, will retry\n", processId)
			continue
		}
		fmt.Printf("[Process: %d] [LEADER] Lease renewed, valid until %s\n", processId, time.Unix(content.LeaseUntil, 0).Format(time.RFC3339))
	}
}

func main() {
	allArgs := os.Args
	if len(allArgs) < 2 {
		panic("Must provide the lock file name path")
	}

	lockFileNamePath := allArgs[1]

	processId := os.Getpid()
	println("Process started with id: ", processId)

	swapSignal := make(chan struct{})
	currentRole := "unknown"
	var mu sync.Mutex

	// Try to acquire lease for lock file
	err := tryAcquireLease(processId, lockFileNamePath)
	if err != nil {
		mu.Lock()
		currentRole = "watcher"
		mu.Unlock()
		go watcherRoutine(processId, lockFileNamePath, swapSignal)
	} else {
		mu.Lock()
		currentRole = "renewal"
		mu.Unlock()
		go renewalRoutine(processId, lockFileNamePath, swapSignal)
	}

	go func() {
		crashAfter := time.Duration(15+rand.Intn(15)) * time.Second
		fmt.Printf("[Process: %d] Will crash in %v\n", processId, crashAfter)
		time.Sleep(crashAfter)
		fmt.Printf("[Process: %d] Crashing now\n", processId)
		os.Exit(1)
	}()

	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGTERM, syscall.SIGINT)
		<-sigChan
		fmt.Printf("[Process: %d] Received shutdown signal, releasing lease\n", processId)
		mu.Lock()
		role := currentRole
		mu.Unlock()
		if role == "renewal" {
			os.Remove(lockFileNamePath)
			fmt.Printf("[Process: %d] Lease released\n", processId)
		}
		os.Exit(0)
	}()

	for range swapSignal {
		if currentRole == "renewal" {
			mu.Lock()
			currentRole = "watcher"
			mu.Unlock()
			go watcherRoutine(processId, lockFileNamePath, swapSignal)
		} else {
			mu.Lock()
			currentRole = "renewal"
			mu.Unlock()
			go renewalRoutine(processId, lockFileNamePath, swapSignal)
		}
	}
}
