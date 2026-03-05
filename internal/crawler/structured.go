package crawler

import (
	"encoding/json"
	"strings"

	"github.com/PuerkitoBio/goquery"

	"github.com/doogle/doogle-v2/internal/models"
)

// ExtractStructuredData extracts Schema.org JSON-LD, microdata, and RDFa from an HTML document.
func ExtractStructuredData(doc *goquery.Document) []models.StructuredItem {
	var items []models.StructuredItem

	// 1. JSON-LD (most common modern format)
	items = append(items, extractJSONLD(doc)...)

	// 2. Microdata (itemscope/itemprop)
	items = append(items, extractMicrodata(doc)...)

	// Cap at 20 items to prevent abuse
	if len(items) > 20 {
		items = items[:20]
	}

	return items
}

// PrimarySchemaType returns the most significant schema type from structured data.
func PrimarySchemaType(items []models.StructuredItem) string {
	priority := map[string]int{
		"Article": 10, "NewsArticle": 10, "BlogPosting": 9,
		"Product": 8, "Recipe": 8, "Event": 7,
		"Organization": 6, "Person": 5, "LocalBusiness": 7,
		"FAQPage": 6, "HowTo": 6, "Review": 5,
		"WebPage": 1, "WebSite": 1,
	}

	bestType := ""
	bestPri := 0
	for _, item := range items {
		if p, ok := priority[item.Type]; ok && p > bestPri {
			bestType = item.Type
			bestPri = p
		} else if bestType == "" {
			bestType = item.Type
		}
	}
	return bestType
}

// extractJSONLD parses <script type="application/ld+json"> blocks.
func extractJSONLD(doc *goquery.Document) []models.StructuredItem {
	var items []models.StructuredItem

	doc.Find(`script[type="application/ld+json"]`).Each(func(_ int, s *goquery.Selection) {
		raw := strings.TrimSpace(s.Text())
		if raw == "" {
			return
		}

		// Try single object
		var obj map[string]interface{}
		if err := json.Unmarshal([]byte(raw), &obj); err == nil {
			if item := jsonLDToItem(obj); item != nil {
				items = append(items, *item)
			}
			// Check @graph array
			if graph, ok := obj["@graph"].([]interface{}); ok {
				for _, g := range graph {
					if gObj, ok := g.(map[string]interface{}); ok {
						if item := jsonLDToItem(gObj); item != nil {
							items = append(items, *item)
						}
					}
				}
			}
			return
		}

		// Try array of objects
		var arr []map[string]interface{}
		if err := json.Unmarshal([]byte(raw), &arr); err == nil {
			for _, obj := range arr {
				if item := jsonLDToItem(obj); item != nil {
					items = append(items, *item)
				}
			}
		}
	})

	return items
}

func jsonLDToItem(obj map[string]interface{}) *models.StructuredItem {
	typeVal, ok := obj["@type"]
	if !ok {
		return nil
	}

	typeName := ""
	switch v := typeVal.(type) {
	case string:
		typeName = v
	case []interface{}:
		if len(v) > 0 {
			if s, ok := v[0].(string); ok {
				typeName = s
			}
		}
	}
	if typeName == "" {
		return nil
	}

	// Strip schema.org prefix
	typeName = strings.TrimPrefix(typeName, "http://schema.org/")
	typeName = strings.TrimPrefix(typeName, "https://schema.org/")

	props := make(map[string]string)
	for key, val := range obj {
		if strings.HasPrefix(key, "@") {
			continue
		}
		switch v := val.(type) {
		case string:
			if len(v) <= 500 {
				props[key] = v
			}
		case float64:
			b, _ := json.Marshal(v)
			props[key] = string(b)
		case bool:
			if v {
				props[key] = "true"
			} else {
				props[key] = "false"
			}
		}
	}

	// Limit properties
	if len(props) > 30 {
		trimmed := make(map[string]string)
		count := 0
		for k, v := range props {
			trimmed[k] = v
			count++
			if count >= 30 {
				break
			}
		}
		props = trimmed
	}

	return &models.StructuredItem{
		Type:       typeName,
		Properties: props,
	}
}

// extractMicrodata extracts Schema.org microdata (itemscope/itemprop).
func extractMicrodata(doc *goquery.Document) []models.StructuredItem {
	var items []models.StructuredItem

	doc.Find("[itemscope]").Each(func(_ int, s *goquery.Selection) {
		itemType, exists := s.Attr("itemtype")
		if !exists {
			return
		}

		// Normalize the type URL to short name
		typeName := itemType
		typeName = strings.TrimPrefix(typeName, "http://schema.org/")
		typeName = strings.TrimPrefix(typeName, "https://schema.org/")
		if strings.Contains(typeName, "/") {
			// Not a schema.org type, skip
			return
		}

		props := make(map[string]string)
		s.Find("[itemprop]").Each(func(_ int, prop *goquery.Selection) {
			name, _ := prop.Attr("itemprop")
			if name == "" {
				return
			}

			var value string
			if content, exists := prop.Attr("content"); exists {
				value = content
			} else if href, exists := prop.Attr("href"); exists {
				value = href
			} else if src, exists := prop.Attr("src"); exists {
				value = src
			} else {
				value = strings.TrimSpace(prop.Text())
			}

			if len(value) <= 500 {
				props[name] = value
			}
		})

		if len(props) > 30 {
			trimmed := make(map[string]string)
			count := 0
			for k, v := range props {
				trimmed[k] = v
				count++
				if count >= 30 {
					break
				}
			}
			props = trimmed
		}

		items = append(items, models.StructuredItem{
			Type:       typeName,
			Properties: props,
		})
	})

	return items
}
