package p2p

// Protocol compatibility constants.
// Bump CompatLevel on every breaking protocol change.
// Bump MinRequiredCompat when old nodes must be forced off the network.
const (
	CompatLevel       = 1 // Our protocol compatibility level
	MinRequiredCompat = 0 // Minimum we require from peers (0 = accept pre-version nodes)
)
