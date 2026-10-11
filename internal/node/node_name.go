package node

import (
	"crypto/rand"
	"encoding/binary"
	"fmt"
	mrand "math/rand"
	"os"
	"path/filepath"
	"strings"
)

var adjectives = []string{
	"Arcane", "Astral", "Blazing", "Bold", "Boundless",
	"Brave", "Bright", "Brilliant", "Celestial", "Clever",
	"Cosmic", "Crimson", "Cryptic", "Curious", "Daring",
	"Dauntless", "Defiant", "Devoted", "Divine", "Drifting",
	"Eager", "Echoing", "Elder", "Ember", "Endless",
	"Enigmatic", "Eternal", "Exalted", "Fabled", "Fearless",
	"Fervent", "Fierce", "Fleet", "Forged", "Frosty",
	"Gallant", "Gentle", "Gilded", "Gleaming", "Glorious",
	"Golden", "Grand", "Granite", "Hallowed", "Harmonic",
	"Hasty", "Heroic", "Hidden", "Hollow", "Hushed",
	"Icy", "Ignited", "Immortal", "Infinite", "Intrepid",
	"Iron", "Ivory", "Jade", "Keen", "Kindred",
	"Lasting", "Liminal", "Lofty", "Lone", "Lucid",
	"Lunar", "Lustrous", "Marble", "Mighty", "Mindful",
	"Misty", "Molten", "Mystic", "Noble", "Nomadic",
	"Obsidian", "Onyx", "Opal", "Oracle", "Orbital",
	"Pale", "Patient", "Phantom", "Platinum", "Polar",
	"Primal", "Proud", "Quantum", "Quartz", "Quick",
	"Quiet", "Radiant", "Raven", "Regal", "Resolute",
	"Rising", "Roaming", "Rooted", "Runic", "Rustic",
	"Sacred", "Sage", "Sapphire", "Scarlet", "Serene",
	"Shadow", "Shining", "Silent", "Silver", "Sleepless",
	"Solar", "Solemn", "Spectral", "Starlit", "Steadfast",
	"Steel", "Sterling", "Stoic", "Storm", "Stout",
	"Subtle", "Summit", "Swift", "Tidal", "Timber",
	"Titan", "Topaz", "Twilight", "Umbral", "Undying",
	"Valiant", "Vast", "Veiled", "Verdant", "Vigilant",
	"Vivid", "Volcanic", "Wandering", "Warden", "Wild",
	"Winding", "Woven", "Zealous", "Zenith", "Zephyr",
}

var characterNames = []string{
	// Literature
	"Gandalf", "Frodo", "Aragorn", "Legolas", "Gimli",
	"Galadriel", "Elrond", "Samwise", "Bilbo", "Eowyn",
	"Sherlock", "Watson", "Moriarty", "Poirot", "Marple",
	"Atticus", "Gatsby", "Hamlet", "Prospero", "Oberon",
	"Titania", "Puck", "Ariel", "Portia", "Beatrice",
	"Quixote", "Sancho", "DArtagnan", "Athos", "Aramis",
	"Ahab", "Ishmael", "Huck", "Sawyer", "Crusoe",
	"Pip", "Heathcliff", "Rochester", "Darcy", "Bennet",
	"Karenina", "Raskolnikov", "Valjean", "Javert", "Faust",
	"Scheherazade", "Cyrano", "Quasimodo", "Ivanhoe", "Lancelot",
	// Mythology — Greek
	"Athena", "Apollo", "Artemis", "Hermes", "Hera",
	"Zeus", "Poseidon", "Hades", "Ares", "Demeter",
	"Hephaestus", "Dionysus", "Persephone", "Orpheus", "Perseus",
	"Odysseus", "Achilles", "Hector", "Ajax", "Theseus",
	"Icarus", "Daedalus", "Prometheus", "Atlas", "Pandora",
	"Medusa", "Midas", "Cassandra", "Penelope", "Circe",
	// Mythology — Norse
	"Odin", "Thor", "Freya", "Loki", "Baldur",
	"Tyr", "Heimdall", "Fenrir", "Sigurd", "Brynhild",
	// Mythology — Egyptian
	"Isis", "Osiris", "Anubis", "Thoth", "Bastet",
	"Horus", "Sekhmet", "Sobek", "Hathor", "Maat",
	// Mythology — Other
	"Amaterasu", "Susanoo", "Quetzalcoatl", "Coyolxauhqui", "Anansi",
	"Vishnu", "Shiva", "Lakshmi", "Saraswati", "Hanuman",
	"Gilgamesh", "Enkidu", "Morrigan", "Brigid", "Cernunnos",
	// History — Ancient
	"Cleopatra", "Caesar", "Augustus", "Hannibal", "Spartacus",
	"Pericles", "Leonidas", "Alexander", "Ramesses", "Hatshepsut",
	"Boudicca", "Zenobia", "Cyrus", "Darius", "Xerxes",
	// History — Medieval & Renaissance
	"Saladin", "Genghis", "Marco", "Columbus", "Magellan",
	"DaVinci", "Galileo", "Copernicus", "Gutenberg", "Avicenna",
	// History — Modern
	"Newton", "Darwin", "Maxwell", "Faraday", "Kepler",
	// Science
	"Tesla", "Edison", "Curie", "Pasteur", "Planck",
	"Einstein", "Bohr", "Fermi", "Heisenberg", "Dirac",
	"Feynman", "Hawking", "Turing", "Lovelace", "Babbage",
	"Hopper", "Shannon", "Neumann", "Euler", "Gauss",
	"Euclid", "Archimedes", "Fibonacci", "Pythagoras", "Hypatia",
	"Noether", "Ramanujan", "Bernoulli", "Leibniz", "Laplace",
	"Fourier", "Riemann", "Hilbert", "Godel", "Cantor",
	"Mendel", "Linnaeus", "Lamarck", "Hubble", "Sagan",
	"Rosalind", "Crick", "Pauling", "Rutherford", "Kelvin",
	"Doppler", "Hertz", "Ampere", "Volta", "Ohm",
	"Joule", "Watt", "Pascal", "Torricelli", "Celsius",
	// Computing
	"Knuth", "Dijkstra", "Ritchie", "Thompson", "Torvalds",
	"Berners", "Cerf", "Diffie", "Hellman", "Rivest",
	"Carmack", "Gosling", "Wozniak", "Kernighan", "Stroustrup",
	// Explorers & Navigators
	"Amundsen", "Shackleton", "Earhart", "Cousteau", "Aldrin",
	"Gagarin", "Armstrong", "Kepler", "Hubble", "Halley",
	// Philosophers
	"Socrates", "Plato", "Aristotle", "Confucius", "Laozi",
	"Seneca", "Aurelius", "Descartes", "Spinoza", "Voltaire",
}

// GenerateNodeName returns a random memorable name like "Curious Gandalf-a3f1".
func GenerateNodeName() string {
	// Seed math/rand from crypto/rand for adjective/name selection.
	var seed [8]byte
	rand.Read(seed[:])
	rng := mrand.New(mrand.NewSource(int64(binary.LittleEndian.Uint64(seed[:]))))

	adj := adjectives[rng.Intn(len(adjectives))]
	name := characterNames[rng.Intn(len(characterNames))]

	// 4 hex digits from crypto/rand.
	var hx [2]byte
	rand.Read(hx[:])

	return fmt.Sprintf("%s %s-%04x", adj, name, hx)
}

const nodeNameFile = "node_name"

// LoadNodeName reads the persisted node name from disk.
// Returns empty string if no name has been saved.
func LoadNodeName(dataDir string) string {
	data, err := os.ReadFile(filepath.Join(dataDir, nodeNameFile))
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

// SaveNodeName persists the node name to disk.
func SaveNodeName(dataDir, name string) error {
	if err := os.MkdirAll(dataDir, 0700); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dataDir, nodeNameFile), []byte(name), 0600)
}
