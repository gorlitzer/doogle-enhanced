package store

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/dgraph-io/badger/v4"
)

// Entity represents a named entity in the knowledge graph.
type Entity struct {
	Name         string            `json:"name"`
	Type         string            `json:"type"`
	Description  string            `json:"description"`
	Properties   map[string]string `json:"properties,omitempty"`
	DocumentIDs  []string          `json:"document_ids"`
	RelatedNames []string          `json:"related_names,omitempty"`
	DocCount     int               `json:"doc_count"`
}

// EntityStore persists entities and relationships in BadgerDB.
// Keys: entity:{type}:{name} → Entity JSON, entity_rel:{name1}:{name2} → co-occurrence count
type EntityStore struct {
	db *BadgerStore
}

// NewEntityStore creates an entity store backed by BadgerDB.
func NewEntityStore(db *BadgerStore) *EntityStore {
	return &EntityStore{db: db}
}

func entityKey(typ, name string) []byte {
	return []byte(fmt.Sprintf("entity:%s:%s", typ, strings.ToLower(name)))
}

func entityRelKey(name1, name2 string) []byte {
	a, b := strings.ToLower(name1), strings.ToLower(name2)
	if a > b {
		a, b = b, a
	}
	return []byte(fmt.Sprintf("entity_rel:%s:%s", a, b))
}

// TypedEntity represents an entity with type and confidence (used as input).
type TypedEntity struct {
	Name       string
	Type       string
	Confidence float64
}

// PutEntity stores or updates an entity.
func (es *EntityStore) PutEntity(e *Entity) error {
	data, err := json.Marshal(e)
	if err != nil {
		return err
	}
	return es.db.Set(entityKey(e.Type, e.Name), data)
}

// FindEntity looks up an entity by name (tries all types).
func (es *EntityStore) FindEntity(name string) *Entity {
	types := []string{"person", "organization", "location", "topic", "technology"}
	for _, typ := range types {
		data, err := es.db.Get(entityKey(typ, name))
		if err != nil || data == nil {
			continue
		}
		var e Entity
		if json.Unmarshal(data, &e) == nil {
			return &e
		}
	}
	return nil
}

// FindEntityByType looks up an entity by type and name.
func (es *EntityStore) FindEntityByType(typ, name string) *Entity {
	data, err := es.db.Get(entityKey(typ, name))
	if err != nil || data == nil {
		return nil
	}
	var e Entity
	if json.Unmarshal(data, &e) == nil {
		return &e
	}
	return nil
}

// AddDocumentEntities records entities found in a document and their co-occurrences.
func (es *EntityStore) AddDocumentEntities(docID string, entities []TypedEntity) error {
	for _, ent := range entities {
		if ent.Confidence < 0.3 {
			continue
		}

		existing := es.FindEntityByType(ent.Type, ent.Name)
		if existing == nil {
			existing = &Entity{
				Name:       ent.Name,
				Type:       ent.Type,
				Properties: make(map[string]string),
			}
		}

		// Add docID if not already present
		found := false
		for _, id := range existing.DocumentIDs {
			if id == docID {
				found = true
				break
			}
		}
		if !found {
			existing.DocumentIDs = append(existing.DocumentIDs, docID)
			// Limit stored doc IDs to 100
			if len(existing.DocumentIDs) > 100 {
				existing.DocumentIDs = existing.DocumentIDs[len(existing.DocumentIDs)-100:]
			}
		}
		existing.DocCount = len(existing.DocumentIDs)

		if err := es.PutEntity(existing); err != nil {
			return err
		}
	}

	// Record co-occurrences between entities in the same document
	for i := 0; i < len(entities) && i < 20; i++ {
		for j := i + 1; j < len(entities) && j < 20; j++ {
			es.incrementRelation(entities[i].Name, entities[j].Name)

			// Add to related names
			es.addRelatedName(entities[i].Type, entities[i].Name, entities[j].Name)
			es.addRelatedName(entities[j].Type, entities[j].Name, entities[i].Name)
		}
	}

	return nil
}

func (es *EntityStore) incrementRelation(name1, name2 string) {
	key := entityRelKey(name1, name2)
	_ = es.db.DB().Update(func(txn *badger.Txn) error {
		var count int64
		item, err := txn.Get(key)
		if err == nil {
			_ = item.Value(func(val []byte) error {
				if err := json.Unmarshal(val, &count); err != nil {
					count = 0
				}
				return nil
			})
		}
		count++
		data, _ := json.Marshal(count)
		return txn.Set(key, data)
	})
}

func (es *EntityStore) addRelatedName(typ, name, relatedName string) {
	existing := es.FindEntityByType(typ, name)
	if existing == nil {
		return
	}
	for _, rn := range existing.RelatedNames {
		if strings.EqualFold(rn, relatedName) {
			return
		}
	}
	existing.RelatedNames = append(existing.RelatedNames, relatedName)
	if len(existing.RelatedNames) > 20 {
		existing.RelatedNames = existing.RelatedNames[len(existing.RelatedNames)-20:]
	}
	_ = es.PutEntity(existing)
}

// GetRelatedEntities returns entities related to the given name.
func (es *EntityStore) GetRelatedEntities(name string, limit int) []Entity {
	entity := es.FindEntity(name)
	if entity == nil || len(entity.RelatedNames) == 0 {
		return nil
	}

	var related []Entity
	for _, rn := range entity.RelatedNames {
		if len(related) >= limit {
			break
		}
		re := es.FindEntity(rn)
		if re != nil {
			related = append(related, *re)
		}
	}
	return related
}

// SearchEntities finds entities matching a query string.
func (es *EntityStore) SearchEntities(query string, limit int) []Entity {
	query = strings.ToLower(strings.TrimSpace(query))
	if query == "" {
		return nil
	}

	var results []Entity
	prefix := []byte("entity:")
	_ = es.db.Scan(prefix, func(key, val []byte) bool {
		if len(results) >= limit {
			return false
		}
		var e Entity
		if json.Unmarshal(val, &e) == nil {
			if strings.Contains(strings.ToLower(e.Name), query) {
				results = append(results, e)
			}
		}
		return true
	})

	return results
}
