package crawler

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/doogle/doogle-v2/internal/models"
	"github.com/doogle/doogle-v2/pkg/urlutil"
)

// DocumentFetcher handles non-HTML document types (PDF, plain text, etc.).
type DocumentFetcher struct {
	client    *http.Client
	userAgent string
	maxSize   int64 // max bytes to download
}

// NewDocumentFetcher creates a fetcher for non-HTML documents.
func NewDocumentFetcher(userAgent string, timeout time.Duration) *DocumentFetcher {
	return &DocumentFetcher{
		client: &http.Client{
			Timeout: timeout,
		},
		userAgent: userAgent,
		maxSize:   10 * 1024 * 1024, // 10 MB
	}
}

// SupportedContentType returns true if the content type is a non-HTML document we can extract text from.
func SupportedContentType(contentType string) bool {
	ct := strings.ToLower(contentType)
	return strings.Contains(ct, "application/pdf") ||
		strings.Contains(ct, "text/plain") ||
		strings.Contains(ct, "text/csv") ||
		strings.Contains(ct, "text/markdown") ||
		strings.Contains(ct, "application/xml") ||
		strings.Contains(ct, "text/xml")
}

// FetchDocument downloads and extracts text from a non-HTML document.
func (df *DocumentFetcher) FetchDocument(rawURL string) (*models.Document, error) {
	req, err := http.NewRequest("GET", rawURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", df.userAgent)

	resp, err := df.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("status %d", resp.StatusCode)
	}

	// Limit download size
	body, err := io.ReadAll(io.LimitReader(resp.Body, df.maxSize))
	if err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}

	contentType := resp.Header.Get("Content-Type")
	var title, content string

	switch {
	case strings.Contains(contentType, "application/pdf"):
		title, content = extractPDFText(body, rawURL)
	case strings.Contains(contentType, "text/plain"),
		strings.Contains(contentType, "text/csv"),
		strings.Contains(contentType, "text/markdown"),
		strings.Contains(contentType, "text/xml"),
		strings.Contains(contentType, "application/xml"):
		title, content = extractPlainText(body, rawURL)
	default:
		return nil, fmt.Errorf("unsupported content type: %s", contentType)
	}

	if content == "" {
		return nil, fmt.Errorf("no text extracted from %s", rawURL)
	}

	doc := &models.Document{
		ID:          models.DocumentID(rawURL),
		URL:         rawURL,
		Domain:      urlutil.ExtractDomain(rawURL),
		Title:       title,
		Content:     content,
		ContentSize: len(content),
		StatusCode:  resp.StatusCode,
		CrawledAt:   time.Now(),
		IsHTTPS:     strings.HasPrefix(rawURL, "https://"),
	}
	doc.ComputeHash()

	return doc, nil
}

// extractPDFText extracts text from a PDF binary using a simple text extraction.
// This is a basic approach that finds text strings in the PDF binary.
// For production use, consider using a proper PDF library.
func extractPDFText(data []byte, rawURL string) (title, content string) {
	// Extract title from URL
	title = titleFromURL(rawURL)

	// Simple PDF text extraction: find text between parentheses in content streams
	// and extract readable text from the binary
	var textParts []string
	var current bytes.Buffer

	for i := 0; i < len(data); i++ {
		b := data[i]

		// Look for text in parentheses (PDF string objects)
		if b == '(' {
			current.Reset()
			depth := 1
			i++
			for i < len(data) && depth > 0 {
				if data[i] == '\\' && i+1 < len(data) {
					i++ // skip escaped char
					current.WriteByte(data[i])
				} else if data[i] == '(' {
					depth++
					current.WriteByte(data[i])
				} else if data[i] == ')' {
					depth--
					if depth > 0 {
						current.WriteByte(data[i])
					}
				} else {
					current.WriteByte(data[i])
				}
				i++
			}
			text := current.String()
			if isReadableText(text) && len(text) > 1 {
				textParts = append(textParts, text)
			}
		}

		// Also look for BT...ET text blocks (text objects)
		if i+1 < len(data) && b == 'B' && data[i+1] == 'T' {
			// Skip to ET
			for i < len(data)-1 {
				if data[i] == 'E' && data[i+1] == 'T' {
					break
				}
				i++
			}
		}
	}

	// Also try to extract hex-encoded strings
	for i := 0; i < len(data)-1; i++ {
		if data[i] == '<' && data[i+1] != '<' {
			end := bytes.IndexByte(data[i+1:], '>')
			if end > 0 && end < 200 {
				hexStr := string(data[i+1 : i+1+end])
				if decoded := decodeHexString(hexStr); isReadableText(decoded) && len(decoded) > 1 {
					textParts = append(textParts, decoded)
				}
			}
		}
	}

	content = strings.Join(textParts, " ")
	content = collapseWhitespace(content)

	// Truncate to reasonable size
	if len(content) > 100000 {
		content = content[:100000]
	}

	// Try to extract title from first meaningful text
	if title == "" && len(textParts) > 0 {
		for _, p := range textParts {
			if len(p) > 5 && len(p) < 200 {
				title = p
				break
			}
		}
	}

	return title, content
}

// extractPlainText handles plain text, CSV, markdown, and XML documents.
func extractPlainText(data []byte, rawURL string) (title, content string) {
	// Ensure valid UTF-8
	if !utf8.Valid(data) {
		data = bytes.ToValidUTF8(data, []byte(""))
	}

	content = string(data)
	content = collapseWhitespace(content)

	if len(content) > 100000 {
		content = content[:100000]
	}

	// Use first line as title, or URL-based title
	lines := strings.SplitN(content, "\n", 2)
	if len(lines) > 0 && len(lines[0]) > 0 && len(lines[0]) < 200 {
		title = strings.TrimSpace(lines[0])
		// Strip markdown heading markers
		title = strings.TrimLeft(title, "# ")
	}
	if title == "" {
		title = titleFromURL(rawURL)
	}

	return title, content
}

func titleFromURL(rawURL string) string {
	parts := strings.Split(rawURL, "/")
	if len(parts) > 0 {
		last := parts[len(parts)-1]
		// Remove extension
		if idx := strings.LastIndex(last, "."); idx > 0 {
			last = last[:idx]
		}
		// Replace dashes/underscores with spaces
		last = strings.NewReplacer("-", " ", "_", " ").Replace(last)
		return last
	}
	return ""
}

func isReadableText(s string) bool {
	if len(s) == 0 {
		return false
	}
	readable := 0
	total := 0
	for _, r := range s {
		total++
		if unicode.IsLetter(r) || unicode.IsDigit(r) || unicode.IsSpace(r) || unicode.IsPunct(r) {
			readable++
		}
	}
	return total > 0 && float64(readable)/float64(total) > 0.7
}

func decodeHexString(hex string) string {
	hex = strings.ReplaceAll(hex, " ", "")
	if len(hex)%2 != 0 {
		return ""
	}
	var result bytes.Buffer
	for i := 0; i < len(hex)-1; i += 2 {
		var b byte
		for j := 0; j < 2; j++ {
			c := hex[i+j]
			b <<= 4
			switch {
			case c >= '0' && c <= '9':
				b |= c - '0'
			case c >= 'a' && c <= 'f':
				b |= c - 'a' + 10
			case c >= 'A' && c <= 'F':
				b |= c - 'A' + 10
			default:
				return ""
			}
		}
		if b >= 32 && b < 127 {
			result.WriteByte(b)
		} else if b == 0 {
			result.WriteByte(' ')
		}
	}
	return result.String()
}
