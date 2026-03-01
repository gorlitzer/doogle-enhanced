package p2p

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	pubsub "github.com/libp2p/go-libp2p-pubsub"
	"github.com/libp2p/go-libp2p/core/host"

	"github.com/doogle/doogle-v2/internal/models"
)

// Gossip manages GossipSub pub/sub for the URL frontier and shard catalog.
type Gossip struct {
	ps             *pubsub.PubSub
	urlTopic       *pubsub.Topic
	urlSub         *pubsub.Subscription
	shardTopic     *pubsub.Topic
	shardSub       *pubsub.Subscription
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

	return &Gossip{
		ps:         ps,
		urlTopic:   urlTopic,
		urlSub:     urlSub,
		shardTopic: shardTopic,
		shardSub:   shardSub,
		host:       h,
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

	var ann models.URLAnnouncement
	if err := json.Unmarshal(msg.Data, &ann); err != nil {
		return nil, fmt.Errorf("unmarshal announcement: %w", err)
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

	var catalog ShardCatalog
	if err := json.Unmarshal(msg.Data, &catalog); err != nil {
		return nil, fmt.Errorf("unmarshal shard catalog: %w", err)
	}
	return &catalog, nil
}

// Close shuts down the gossip layer.
func (g *Gossip) Close() {
	g.urlSub.Cancel()
	g.urlTopic.Close()
	g.shardSub.Cancel()
	g.shardTopic.Close()
}
