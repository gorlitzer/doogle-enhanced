package p2p

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"time"

	"github.com/libp2p/go-libp2p/core/host"
	"github.com/libp2p/go-libp2p/core/network"
	"github.com/libp2p/go-libp2p/core/peer"

	"github.com/doogle/doogle-v2/internal/fleet"
)

// FleetHeartbeatHandler processes incoming heartbeat requests on the coordinator.
type FleetHeartbeatHandler func(senderID peer.ID, req *fleet.HeartbeatRequest) *fleet.HeartbeatResponse

// RegisterFleetHeartbeatProtocol sets up the heartbeat stream handler on the coordinator.
func RegisterFleetHeartbeatProtocol(h host.Host, handler FleetHeartbeatHandler) {
	h.SetStreamHandler(FleetHeartbeatProtocol, func(s network.Stream) {
		defer s.Close()
		s.SetDeadline(time.Now().Add(15 * time.Second))

		reader := bufio.NewReader(io.LimitReader(s, 1<<20)) // 1 MB max
		data, err := reader.ReadBytes('\n')
		if err != nil && err != io.EOF {
			log.Printf("fleet heartbeat: read error: %v", err)
			return
		}

		var req fleet.HeartbeatRequest
		if err := json.Unmarshal(data, &req); err != nil {
			log.Printf("fleet heartbeat: unmarshal error: %v", err)
			return
		}

		senderID := s.Conn().RemotePeer()
		resp := handler(senderID, &req)

		respData, err := json.Marshal(resp)
		if err != nil {
			log.Printf("fleet heartbeat: marshal error: %v", err)
			return
		}
		respData = append(respData, '\n')
		s.Write(respData)
	})
}

// SendFleetHeartbeat sends a heartbeat to the coordinator and returns the response.
func SendFleetHeartbeat(ctx context.Context, h host.Host, coordinatorID peer.ID, req *fleet.HeartbeatRequest, timeout time.Duration) (*fleet.HeartbeatResponse, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	s, err := h.NewStream(ctx, coordinatorID, FleetHeartbeatProtocol)
	if err != nil {
		return nil, fmt.Errorf("open heartbeat stream to %s: %w", coordinatorID.String()[:12], err)
	}
	defer s.Close()

	reqData, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal heartbeat: %w", err)
	}
	reqData = append(reqData, '\n')
	if _, err := s.Write(reqData); err != nil {
		return nil, fmt.Errorf("write heartbeat: %w", err)
	}
	s.CloseWrite()

	reader := bufio.NewReader(io.LimitReader(s, 1<<20))
	respData, err := reader.ReadBytes('\n')
	if err != nil && err != io.EOF {
		return nil, fmt.Errorf("read heartbeat response: %w", err)
	}

	var resp fleet.HeartbeatResponse
	if err := json.Unmarshal(respData, &resp); err != nil {
		return nil, fmt.Errorf("unmarshal heartbeat response: %w", err)
	}
	return &resp, nil
}
