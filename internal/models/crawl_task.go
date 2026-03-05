package models

import "time"

// CrawlTask represents a URL to be crawled, shared over P2P.
type CrawlTask struct {
	URL       string    `json:"url"`
	Domain    string    `json:"domain"`
	Depth     int       `json:"depth"`
	Priority  int       `json:"priority"`
	SourceURL string    `json:"source_url,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

// URLAnnouncement is broadcast via GossipSub when new URLs are discovered.
type URLAnnouncement struct {
	URLs      []string `json:"urls"`
	SourceURL string   `json:"source_url"`
	Depth     int      `json:"depth"`
	PeerID    string   `json:"peer_id"`

	// Proof-of-work fields (Sybil resistance)
	PoWNonce      uint64 `json:"pow_nonce,omitempty"`
	PoWTimestamp  int64  `json:"pow_ts,omitempty"`
	PoWDifficulty uint8  `json:"pow_diff,omitempty"`
}
