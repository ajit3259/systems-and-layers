package main

type VoteRequest struct {
	term         int64  // election term for which vote is being asked for
	candidateId  string // nodeId which is requesting vote
	lastLogIndex int64  // last log index of the candidate
	lastLogTerm  int64  // last log term of candidate used in case of tie
}

type VoteResponse struct {
	term        int64  // election term for which vote is done
	voteGranted bool   // whether vote was granted
	fromId      string // nodeId who provided this vote
}

type Heartbeat struct {
	term     int64  // current term for which heartbeat is send by leader
	leaderId string // nodeId which is sending heartbeat
}

type HeartbeatAck struct {
	term   int64  // current term for which heartbeat ack is send by followers
	fromId string // nodeId sending the heartbeat ack
}

type Message interface {
	messageType() string
}

func (v VoteRequest) messageType() string {
	return "VoteRequest"
}

func (v VoteResponse) messageType() string {
	return "VoteResponse"
}

func (h Heartbeat) messageType() string {
	return "Heartbeat"
}

func (h HeartbeatAck) messageType() string {
	return "HeartbeatAck"
}
