package p2p

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	pubsub "github.com/libp2p/go-libp2p-pubsub"
	"github.com/libp2p/go-libp2p/core/host"

	"github.com/doogle/doogle-v2/internal/models"
)

const maxGossipMessageSize = 64 * 1024 // 64 KB

// maxURLsPerAnnouncement bounds how many URLs a single gossip announcement may
// carry, preventing a peer from scheduling thousands of URLs in one message.
const maxURLsPerAnnouncement = 100

// truncPeerID safely truncates a peer ID string for logging without panicking
// on short (attacker-supplied) values.
func truncPeerID(id string) string {
	if len(id) <= 12 {
		return id
	}
	return id[:12]
}

// Gossip manages GossipSub pub/sub for the URL frontier, shard catalog, and spam reports.
type Gossip struct {
	ps             *pubsub.PubSub
	urlTopic       *pubsub.Topic
	urlSub         *pubsub.Subscription
	shardTopic     *pubsub.Topic
	shardSub       *pubsub.Subscription
	reportTopic    *pubsub.Topic
	reportSub      *pubsub.Subscription
	host           host.Host
}

// NewGossip creates a GossipSub instance and joins both topics.
func NewGossip(ctx context.Context, h host.Host) (*Gossip, error) {
	ps, err := pubsub.NewGossipSub(ctx, h)
	if err != nil {
		return nil, fmt.Errorf("create gossipsub: %w", err)
	}

	// URL frontier topic
	urlTopic, err := ps.Join(URLFrontierTopic)
	if err != nil {
		return nil, fmt.Errorf("join topic %s: %w", URLFrontierTopic, err)
	}
	urlSub, err := urlTopic.Subscribe()
	if err != nil {
		return nil, fmt.Errorf("subscribe to %s: %w", URLFrontierTopic, err)
	}
	log.Printf("GossipSub joined topic: %s", URLFrontierTopic)

	// Shard catalog topic
	shardTopic, err := ps.Join(ShardCatalogTopic)
	if err != nil {
		return nil, fmt.Errorf("join topic %s: %w", ShardCatalogTopic, err)
	}
	shardSub, err := shardTopic.Subscribe()
	if err != nil {
		return nil, fmt.Errorf("subscribe to %s: %w", ShardCatalogTopic, err)
	}
	log.Printf("GossipSub joined topic: %s", ShardCatalogTopic)

	// Spam report topic
	reportTopic, err := ps.Join(SpamReportTopic)
	if err != nil {
		return nil, fmt.Errorf("join topic %s: %w", SpamReportTopic, err)
	}
	reportSub, err := reportTopic.Subscribe()
	if err != nil {
		return nil, fmt.Errorf("subscribe to %s: %w", SpamReportTopic, err)
	}
	log.Printf("GossipSub joined topic: %s", SpamReportTopic)

	return &Gossip{
		ps:          ps,
		urlTopic:    urlTopic,
		urlSub:      urlSub,
		shardTopic:  shardTopic,
		shardSub:    shardSub,
		reportTopic: reportTopic,
		reportSub:   reportSub,
		host:        h,
	}, nil
}

// Publish broadcasts a URL announcement to all peers.
func (g *Gossip) Publish(ctx context.Context, ann *models.URLAnnouncement) error {
	data, err := json.Marshal(ann)
	if err != nil {
		return fmt.Errorf("marshal announcement: %w", err)
	}
	return g.urlTopic.Publish(ctx, data)
}

// Subscribe returns incoming URL announcements. Blocks until a message arrives or ctx is cancelled.
func (g *Gossip) Subscribe(ctx context.Context) (*models.URLAnnouncement, error) {
	msg, err := g.urlSub.Next(ctx)
	if err != nil {
		return nil, err
	}

	// Ignore our own messages
	if msg.ReceivedFrom == g.host.ID() {
		return nil, nil
	}

	// Reject oversized messages.
	if len(msg.Data) > maxGossipMessageSize {
		log.Printf("gossip: dropping oversized message (%d bytes) from %s", len(msg.Data), msg.ReceivedFrom.String()[:12])
		return nil, nil
	}

	var ann models.URLAnnouncement
	if err := json.Unmarshal(msg.Data, &ann); err != nil {
		return nil, fmt.Errorf("unmarshal announcement: %w", err)
	}

	// Reject announcements carrying an unreasonable number of URLs — a single
	// message can otherwise schedule thousands of tiny URLs (amplification).
	if len(ann.URLs) > maxURLsPerAnnouncement {
		log.Printf("gossip: dropping announcement with %d URLs (max %d) from %s",
			len(ann.URLs), maxURLsPerAnnouncement, truncPeerID(msg.ReceivedFrom.String()))
		return nil, nil
	}

	// Validate URL format — reject if any URL is invalid.
	for _, u := range ann.URLs {
		if !strings.HasPrefix(u, "http://") && !strings.HasPrefix(u, "https://") {
			return nil, nil
		}
		if len(u) > 2048 {
			return nil, nil
		}
	}

	return &ann, nil
}

// PublishShardCatalog broadcasts a shard catalog update to all peers.
func (g *Gossip) PublishShardCatalog(ctx context.Context, catalog *ShardCatalog) error {
	data, err := json.Marshal(catalog)
	if err != nil {
		return fmt.Errorf("marshal shard catalog: %w", err)
	}
	return g.shardTopic.Publish(ctx, data)
}

// SubscribeShardCatalog returns incoming shard catalog updates.
func (g *Gossip) SubscribeShardCatalog(ctx context.Context) (*ShardCatalog, error) {
	msg, err := g.shardSub.Next(ctx)
	if err != nil {
		return nil, err
	}

	if msg.ReceivedFrom == g.host.ID() {
		return nil, nil
	}

	if len(msg.Data) > maxGossipMessageSize {
		log.Printf("gossip: dropping oversized shard catalog (%d bytes) from %s", len(msg.Data), msg.ReceivedFrom.String()[:12])
		return nil, nil
	}

	var catalog ShardCatalog
	if err := json.Unmarshal(msg.Data, &catalog); err != nil {
		return nil, fmt.Errorf("unmarshal shard catalog: %w", err)
	}
	return &catalog, nil
}

// PublishSpamReport broadcasts a spam report to all peers.
func (g *Gossip) PublishSpamReport(ctx context.Context, report *models.SpamReport) error {
	data, err := json.Marshal(report)
	if err != nil {
		return fmt.Errorf("marshal spam report: %w", err)
	}
	return g.reportTopic.Publish(ctx, data)
}

// SubscribeSpamReport returns incoming spam reports from peers. Blocks until a message arrives.
func (g *Gossip) SubscribeSpamReport(ctx context.Context) (*models.SpamReport, error) {
	msg, err := g.reportSub.Next(ctx)
	if err != nil {
		return nil, err
	}

	// Ignore our own messages
	if msg.ReceivedFrom == g.host.ID() {
		return nil, nil
	}

	if len(msg.Data) > maxGossipMessageSize {
		log.Printf("gossip: dropping oversized spam report (%d bytes) from %s", len(msg.Data), msg.ReceivedFrom.String()[:12])
		return nil, nil
	}

	var report models.SpamReport
	if err := json.Unmarshal(msg.Data, &report); err != nil {
		return nil, fmt.Errorf("unmarshal spam report: %w", err)
	}

	// Basic validation
	if report.URL == "" || report.ReporterID == "" || report.Reason == "" {
		return nil, nil
	}

	return &report, nil
}

// Close shuts down the gossip layer.
func (g *Gossip) Close() {
	g.urlSub.Cancel()
	g.urlTopic.Close()
	g.shardSub.Cancel()
	g.shardTopic.Close()
	g.reportSub.Cancel()
	g.reportTopic.Close()
}
