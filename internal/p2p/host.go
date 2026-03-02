package p2p

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/libp2p/go-libp2p"
	"github.com/libp2p/go-libp2p/core/crypto"
	"github.com/libp2p/go-libp2p/core/host"
	"github.com/libp2p/go-libp2p/core/peer"
	connmgr "github.com/libp2p/go-libp2p/p2p/net/connmgr"
	"github.com/libp2p/go-libp2p/p2p/host/autorelay"
	"github.com/libp2p/go-libp2p/p2p/security/noise"
	libp2ptls "github.com/libp2p/go-libp2p/p2p/security/tls"
	libp2pquic "github.com/libp2p/go-libp2p/p2p/transport/quic"
	"github.com/libp2p/go-libp2p/p2p/transport/tcp"
)

// NewHost creates a libp2p host with TCP+QUIC transports, Noise encryption,
// AutoRelay for NAT traversal, and hole punching.
//
// Listens on TCP only (no QUIC listener) to avoid a quic-go v0.48.2 panic from
// inbound connection floods, while still allowing outbound QUIC dials.
// AutoRelay discovers public relay nodes on the IPFS network so that nodes
// behind NAT are reachable via /p2p-circuit addresses.
func NewHost(ctx context.Context, privKey crypto.PrivKey, port int) (host.Host, error) {
	listenTCP := fmt.Sprintf("/ip4/0.0.0.0/tcp/%d", port)

	cm, err := connmgr.NewConnManager(40, 80, connmgr.WithGracePeriod(30*time.Second))
	if err != nil {
		return nil, fmt.Errorf("connection manager: %w", err)
	}

	// The peer source closure captures h by reference. It's safe because
	// AutoRelay calls it later (after h is assigned) to find relay candidates
	// from the host's connected peers (populated by DHT bootstrap).
	var h host.Host
	peerSource := func(ctx context.Context, num int) <-chan peer.AddrInfo {
		ch := make(chan peer.AddrInfo, num)
		go func() {
			defer close(ch)
			if h == nil {
				return
			}
			for _, p := range h.Network().Peers() {
				if num <= 0 {
					return
				}
				select {
				case ch <- h.Peerstore().PeerInfo(p):
					num--
				case <-ctx.Done():
					return
				}
			}
		}()
		return ch
	}

	h, err = libp2p.New(
		libp2p.Identity(privKey),
		libp2p.ListenAddrStrings(listenTCP),
		libp2p.Transport(tcp.NewTCPTransport),
		libp2p.Transport(libp2pquic.NewTransport),
		libp2p.Security(noise.ID, noise.New),
		libp2p.Security(libp2ptls.ID, libp2ptls.New),
		libp2p.NATPortMap(),
		libp2p.EnableHolePunching(),
		libp2p.EnableAutoRelayWithPeerSource(peerSource, autorelay.WithNumRelays(2)),
		libp2p.ConnectionManager(cm),
	)
	if err != nil {
		return nil, fmt.Errorf("create libp2p host: %w", err)
	}

	slog.Info("libp2p host started", "peer_id", h.ID())
	for _, addr := range h.Addrs() {
		slog.Info("listening", "addr", fmt.Sprintf("%s/p2p/%s", addr, h.ID()))
	}

	return h, nil
}
