package geo

import (
	"net"

	"github.com/libp2p/go-libp2p/core/host"
	ma "github.com/multiformats/go-multiaddr"
	"github.com/oschwald/maxminddb-golang"
)

// Service provides IP-to-country lookups using a MaxMind GeoLite2-Country database.
type Service struct {
	reader *maxminddb.Reader
}

type countryRecord struct {
	Country struct {
		ISOCode string `maxminddb:"iso_code"`
	} `maxminddb:"country"`
}

// Open loads a GeoLite2-Country .mmdb file from disk.
func Open(dbPath string) (*Service, error) {
	r, err := maxminddb.Open(dbPath)
	if err != nil {
		return nil, err
	}
	return &Service{reader: r}, nil
}

// Country returns the ISO 3166-1 alpha-2 country code for an IP, or "" if unknown.
func (s *Service) Country(ip net.IP) string {
	if s == nil || s.reader == nil || ip == nil {
		return ""
	}
	var rec countryRecord
	if err := s.reader.Lookup(ip, &rec); err != nil {
		return ""
	}
	return rec.Country.ISOCode
}

// CountryFromAddrs extracts public IPs from libp2p multiaddrs and returns
// the first valid country found.
func (s *Service) CountryFromAddrs(addrs []ma.Multiaddr) string {
	if s == nil {
		return ""
	}
	for _, addr := range addrs {
		ip := extractIP(addr)
		if ip == nil || ip.IsLoopback() || ip.IsPrivate() || ip.IsUnspecified() {
			continue
		}
		if code := s.Country(ip); code != "" {
			return code
		}
	}
	return ""
}

// SelfCountry determines this node's country from its libp2p host addresses.
func (s *Service) SelfCountry(h host.Host) string {
	if s == nil || h == nil {
		return ""
	}
	return s.CountryFromAddrs(h.Addrs())
}

// Close releases the underlying database resources.
func (s *Service) Close() {
	if s != nil && s.reader != nil {
		s.reader.Close()
	}
}

// extractIP pulls the IP address from a multiaddr (/ip4/... or /ip6/...).
func extractIP(addr ma.Multiaddr) net.IP {
	if val, err := addr.ValueForProtocol(ma.P_IP4); err == nil {
		return net.ParseIP(val)
	}
	if val, err := addr.ValueForProtocol(ma.P_IP6); err == nil {
		return net.ParseIP(val)
	}
	return nil
}

