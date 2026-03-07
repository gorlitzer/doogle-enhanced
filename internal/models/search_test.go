package models

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestNodeStatus_CountryJSON(t *testing.T) {
	s := NodeStatus{
		PeerID:  "QmTest",
		Country: "US",
	}
	data, err := json.Marshal(s)
	if err != nil {
		t.Fatal(err)
	}
	var decoded NodeStatus
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.Country != "US" {
		t.Fatalf("expected US, got %q", decoded.Country)
	}
}

func TestNodeStatus_CountryOmitEmpty(t *testing.T) {
	s := NodeStatus{PeerID: "QmTest"}
	data, _ := json.Marshal(s)
	if strings.Contains(string(data), `"country"`) {
		t.Fatalf("expected country omitted when empty, got: %s", data)
	}
}

func TestExplorerStats_CountryJSON(t *testing.T) {
	e := ExplorerStats{
		PeerID:   "QmExplorer",
		Country:  "DE",
		DocCount: 100,
	}
	data, err := json.Marshal(e)
	if err != nil {
		t.Fatal(err)
	}
	var decoded ExplorerStats
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.Country != "DE" {
		t.Fatalf("expected DE, got %q", decoded.Country)
	}
}

func TestExplorerStats_CountryOmitEmpty(t *testing.T) {
	e := ExplorerStats{PeerID: "QmExplorer", DocCount: 10}
	data, _ := json.Marshal(e)
	if strings.Contains(string(data), `"country"`) {
		t.Fatalf("expected country omitted, got: %s", data)
	}
}

func TestRelayStats_CountryJSON(t *testing.T) {
	r := RelayStats{
		PeerID:  "QmRelay",
		Country: "JP",
	}
	data, err := json.Marshal(r)
	if err != nil {
		t.Fatal(err)
	}
	var decoded RelayStats
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.Country != "JP" {
		t.Fatalf("expected JP, got %q", decoded.Country)
	}
}

func TestRelayStats_CountryOmitEmpty(t *testing.T) {
	r := RelayStats{PeerID: "QmRelay"}
	data, _ := json.Marshal(r)
	if strings.Contains(string(data), `"country"`) {
		t.Fatalf("expected country omitted, got: %s", data)
	}
}

func TestPeerInfo_CountryJSON(t *testing.T) {
	p := PeerInfo{
		PeerID:  "QmPeer",
		Country: "BR",
		Addrs:   []string{"/ip4/1.2.3.4/tcp/4001"},
	}
	data, err := json.Marshal(p)
	if err != nil {
		t.Fatal(err)
	}
	var decoded PeerInfo
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.Country != "BR" {
		t.Fatalf("expected BR, got %q", decoded.Country)
	}
}

func TestPeerInfo_CountryOmitEmpty(t *testing.T) {
	p := PeerInfo{PeerID: "QmPeer"}
	data, _ := json.Marshal(p)
	if strings.Contains(string(data), `"country"`) {
		t.Fatalf("expected country omitted, got: %s", data)
	}
}
