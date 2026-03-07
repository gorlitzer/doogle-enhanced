package fleet

import "time"

// WorkerStats contains runtime statistics from a worker node.
type WorkerStats struct {
	IndexedDocs    int    `json:"indexed_docs"`
	CrawledURLs    int    `json:"crawled_urls"`
	URLsInQueue    int    `json:"urls_in_queue"`
	ConnectedPeers int    `json:"connected_peers"`
	Uptime         string `json:"uptime"`
	Version        string `json:"version,omitempty"`
}

// HeartbeatRequest is sent by workers to the coordinator.
type HeartbeatRequest struct {
	PeerID    string      `json:"peer_id"`
	NodeName  string      `json:"node_name"`
	Stats     WorkerStats `json:"stats"`
	Timestamp int64       `json:"timestamp"`
	Signature string      `json:"signature"`
}

// HeartbeatResponse is the coordinator's reply to a heartbeat.
type HeartbeatResponse struct {
	Status string `json:"status"` // "ok" or "rejected"
	Reason string `json:"reason,omitempty"`
}

// ProxyRequest is sent by the coordinator to a worker to proxy an HTTP request.
type ProxyRequest struct {
	Method    string            `json:"method"`
	Path      string            `json:"path"`
	Query     string            `json:"query,omitempty"`
	Headers   map[string]string `json:"headers,omitempty"`
	Body      []byte            `json:"body,omitempty"`
	Timestamp int64             `json:"timestamp"`
	Signature string            `json:"signature"`
}

// ProxyResponse is the worker's reply header for a proxied request.
type ProxyResponse struct {
	StatusCode    int               `json:"status_code"`
	Headers       map[string]string `json:"headers,omitempty"`
	ContentLength int64             `json:"content_length"`
}

// FleetNode represents a worker in the coordinator's registry.
type FleetNode struct {
	PeerID    string      `json:"peer_id"`
	Name      string      `json:"name"`
	Stats     WorkerStats `json:"stats"`
	Status    string      `json:"status"` // "online", "stale", "offline"
	LastSeen  time.Time   `json:"last_seen"`
	FirstSeen time.Time   `json:"first_seen"`
}

// FleetSummary is the API response for the fleet overview.
type FleetSummary struct {
	CoordinatorID string       `json:"coordinator_id"`
	TotalNodes    int          `json:"total_nodes"`
	OnlineNodes   int          `json:"online_nodes"`
	TotalDocs     int          `json:"total_docs"`
	Nodes         []*FleetNode `json:"nodes"`
}
