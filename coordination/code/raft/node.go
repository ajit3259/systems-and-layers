package main

type Role int

const (
	Follower Role = iota
	Candidate
	Leader
)

type NodeState struct {
	id          string          // unqiue id identitfying the node
	currentTerm int64           // current term believed by this node
	votedFor    string          // node id for which vote has been given in currentTerm
	role        Role            // current role of this node
	votes       int             // votes received when this node is candidate
	votesFrom   map[string]bool // votes received from which node to avoid double counting
	inbox       chan Message    // inbox channel for this node which is used by other nodes to send messages
	log         []LogEntry      // log enteries of this node
}

type LogEntry struct {
	term    int64  // current term for this log LogEntry
	command string // command run as part of this LogEntry
}
