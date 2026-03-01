package p2p

import "github.com/libp2p/go-libp2p/core/protocol"

const (
	CrawlProtocol     protocol.ID = "/doogle/crawl/1.0.0"
	IndexProtocol     protocol.ID = "/doogle/index/1.0.0"
	SearchProtocol    protocol.ID = "/doogle/search/1.0.0"
	ShardProtocol     protocol.ID = "/doogle/shard/1.0.0"
	ReplicateProtocol    protocol.ID = "/doogle/replicate/1.0.0"
	AntiEntropyProtocol  protocol.ID = "/doogle/antientropy/1.0.0"

	URLFrontierTopic  = "doogle/url-frontier"
	ShardCatalogTopic = "doogle/shard-catalog"
)
