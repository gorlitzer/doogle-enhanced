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

// Gossip manages GossipSub pub/sub for the URL frontier.
type Gossip struct {
	ps    *pubsub.PubSub
	topic *pubsub.Topic
	sub   *pubsub.Subscription
	host  host.Host
}

// NewGossip creates a GossipSub instance and joins the URL frontier topic.
func NewGossip(ctx context.Context, h host.Host) (*Gossip, error) {
	ps, err := pubsub.NewGossipSub(ctx, h)
	if err != nil {
		return nil, fmt.Errorf("create gossipsub: %w", err)
	}

	topic, err := ps.Join(URLFrontierTopic)
	if err != nil {
		return nil, fmt.Errorf("join topic %s: %w", URLFrontierTopic, err)
	}

	sub, err := topic.Subscribe()
	if err != nil {
		return nil, fmt.Errorf("subscribe to %s: %w", URLFrontierTopic, err)
	}

	log.Printf("GossipSub joined topic: %s", URLFrontierTopic)
	return &Gossip{ps: ps, topic: topic, sub: sub, host: h}, nil
}

// Publish broadcasts a URL announcement to all peers.
func (g *Gossip) Publish(ctx context.Context, ann *models.URLAnnouncement) error {
	data, err := json.Marshal(ann)
	if err != nil {
		return fmt.Errorf("marshal announcement: %w", err)
	}
	return g.topic.Publish(ctx, data)
}

// Subscribe returns incoming URL announcements. Blocks until a message arrives or ctx is cancelled.
func (g *Gossip) Subscribe(ctx context.Context) (*models.URLAnnouncement, error) {
	msg, err := g.sub.Next(ctx)
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

// Close shuts down the gossip layer.
func (g *Gossip) Close() {
	g.sub.Cancel()
	g.topic.Close()
}
