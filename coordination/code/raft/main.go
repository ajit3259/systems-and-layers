package main

import (
	"context"
	"fmt"
	"math/rand"
	"strconv"
	"time"
)

const NODE_CNT = 3
const CHANNEL_BUFFER_SIZE = 10
const HEARTBEAT_INTERVAL = 1 * time.Second

// send delivers a message without blocking. A full inbox means the receiver is
// crashed or unreachable and is no longer draining it, so we drop the message.
// A blocking send here would model a network that waits forever for a dead node,
// which wedges the whole cluster once one node goes away.
func send(ch chan Message, msg Message) {
	select {
	case ch <- msg:
	default:
	}
}

func randomElectionTimeout() time.Duration {
	return time.Duration(3+rand.Intn(3)) * time.Second
}

func getLastLogTerm(log []LogEntry) int64 {
	if len(log) > 0 {
		return log[len(log)-1].term
	}
	return 0
}

func stepDown(node *NodeState, newTerm int64) {
	node.role = Follower
	node.currentTerm = newTerm
	node.votedFor = ""
	node.votes = 0
	node.votesFrom = make(map[string]bool)
}

// sendHeartbeats is called from runNode's own goroutine, never as a goroutine of
// its own. Running it separately would leave NodeState shared between two
// goroutines with no synchronisation, which is the race Part 1 is about: this
// code reads node.role and node.currentTerm while runNode writes both.
func sendHeartbeats(node *NodeState, msgChannels []chan Message) {
	nodeID, _ := strconv.Atoi(node.id)
	for i, ch := range msgChannels {
		if i != nodeID {
			send(ch, Heartbeat{term: node.currentTerm, leaderId: node.id})
		}
	}
}

// runNode simulates behaviour of a node
// It receives messages from other nodes through its inbox channel and take action based on message type
// and send messages to other nodes through respective msgChannels
func runNode(ctx context.Context, node *NodeState, msgChannels []chan Message) {
	electionTimeout := randomElectionTimeout()
	timer := time.NewTimer(electionTimeout)
	defer timer.Stop()
	heartbeatTicker := time.NewTicker(HEARTBEAT_INTERVAL)
	defer heartbeatTicker.Stop()

	for {
		select {
		case msg := <-node.inbox:
			switch msg.messageType() {
			case "VoteRequest":
				voteRequest := msg.(VoteRequest)
				fmt.Printf("[Node %s] [Term %d] Received VoteRequest from %s for term %d\n", node.id, node.currentTerm, voteRequest.candidateId, voteRequest.term)
				// never vote on lower election term
				if voteRequest.term < node.currentTerm {
					continue
				}
				// vote only when not already voted and requestor has log upto date
				lastLogTerm := getLastLogTerm(node.log)
				if voteRequest.term > node.currentTerm {
					stepDown(node, voteRequest.term)
				}
				isLogUpToDate := voteRequest.lastLogTerm > lastLogTerm ||
					(voteRequest.lastLogTerm == lastLogTerm && voteRequest.lastLogIndex >= int64(len(node.log)))
				if isLogUpToDate && (node.votedFor == "" || node.votedFor == voteRequest.candidateId) {
					node.votedFor = voteRequest.candidateId
					// reset election timer when votedFor
					timer.Reset(randomElectionTimeout())
					candidateId, _ := strconv.Atoi(voteRequest.candidateId)
					send(msgChannels[candidateId], VoteResponse{
						term:        voteRequest.term,
						voteGranted: true,
						fromId:      node.id,
					})
				}
			case "VoteResponse":
				voteResponse := msg.(VoteResponse)
				if node.role != Candidate || voteResponse.term != node.currentTerm {
					continue
				}
				if voteResponse.voteGranted {
					if !node.votesFrom[voteResponse.fromId] {
						node.votesFrom[voteResponse.fromId] = true
						node.votes++
					}
				}
				if node.votes > NODE_CNT/2 && node.role != Leader {
					fmt.Printf("[Node %s] [Term %d] Won election, becoming LEADER\n", node.id, node.currentTerm)
					node.role = Leader
					sendHeartbeats(node, msgChannels)
				}
			case "Heartbeat":
				heartBeat := msg.(Heartbeat)
				fmt.Printf("[Node %s] [Term %d] Heartbeat from leader %s\n", node.id, node.currentTerm, heartBeat.leaderId)
				if heartBeat.term < node.currentTerm {
					continue
				}
				stepDown(node, heartBeat.term)
				timer.Reset(randomElectionTimeout())
				// send heartbeatAck
				senderID, _ := strconv.Atoi(heartBeat.leaderId)
				send(msgChannels[senderID], HeartbeatAck{term: node.currentTerm, fromId: node.id})
			case "HeartbeatAck":
				heartbeatAck := msg.(HeartbeatAck)
				if node.role != Leader {
					continue
				}
				if heartbeatAck.term > node.currentTerm {
					stepDown(node, heartbeatAck.term)
				}
			}
		case <-heartbeatTicker.C:
			if node.role == Leader {
				sendHeartbeats(node, msgChannels)
			}
		case <-timer.C:
			if node.role == Leader {
				continue
			}
			// election timeout detected become candidate and send the VoteRequest to all
			node.role = Candidate
			node.votesFrom = make(map[string]bool)
			// candidate always votes for itself
			node.votes = 1
			node.votedFor = node.id
			node.votesFrom[node.id] = true
			node.currentTerm += 1
			fmt.Printf("[Node %s] Election timeout, starting election for term %d\n", node.id, node.currentTerm)
			nodeID, _ := strconv.Atoi(node.id)
			for i := range msgChannels {
				voteReq := VoteRequest{
					term:         node.currentTerm,
					candidateId:  node.id,
					lastLogIndex: int64(len(node.log)),
					lastLogTerm:  getLastLogTerm(node.log),
				}
				if i != nodeID {
					send(msgChannels[i], voteReq)
				}
			}
			timer.Reset(randomElectionTimeout())
		case <-ctx.Done():
			return
		}
	}
}

func main() {
	msgChannels := make([]chan Message, NODE_CNT)
	for i := range NODE_CNT {
		msgChannels[i] = make(chan Message, CHANNEL_BUFFER_SIZE)
	}
	cancels := make([]context.CancelFunc, NODE_CNT)
	for i := range NODE_CNT {
		ctx, cancel := context.WithCancel(context.Background())
		cancels[i] = cancel
		node := &NodeState{
			id:          fmt.Sprintf("%d", i),
			role:        Follower,
			currentTerm: 0,
			votedFor:    "",
			inbox:       msgChannels[i],
			log:         make([]LogEntry, 0),
		}
		go runNode(ctx, node, msgChannels)
	}
	go func() {
		time.Sleep(10 * time.Second)
		fmt.Println("--- Crashing Node 0 ---")
		cancels[0]()
	}()
	select {} // block so that goroutines are not killed
}
