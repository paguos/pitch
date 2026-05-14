// Package knockout implements pure single-elimination bracket logic:
// seeding, byes, pairing, and winner propagation. No I/O.
package knockout

import (
	"errors"
	"math/bits"
	"math/rand"

	"github.com/google/uuid"
)

// Slot identifies which side of the next match a winner feeds into.
type Slot string

const (
	SlotHome Slot = "HOME"
	SlotAway Slot = "AWAY"
)

// Status mirrors the DB-level match status for knockout matches.
type Status string

const (
	StatusPending   Status = "PENDING"
	StatusPlayable  Status = "PLAYABLE"
	StatusCompleted Status = "COMPLETED"
)

// BracketMatch describes one node in the bracket tree.
// HomeID / AwayID may be the zero UUID if a slot is empty (PENDING).
// NextRound / NextOrd point to the match that consumes this one's winner.
// If NextRound is 0, this is the final.
type BracketMatch struct {
	Round    int
	Ord      int
	HomeID   uuid.UUID
	AwayID   uuid.UUID
	Status   Status
	NextRound int
	NextOrd   int
	NextSlot  Slot
}

// Bracket is the full set of matches in tree order: round 1 first, then 2, etc.
type Bracket struct {
	Size    int // B = next power of 2 >= N
	Byes    int // B - N
	Rounds  int // log2(B)
	Matches []BracketMatch
}

// nextPow2 returns the smallest power of 2 >= n. For n<=1 returns 1.
func nextPow2(n int) int {
	if n <= 1 {
		return 1
	}
	return 1 << bits.Len(uint(n-1))
}

// standardBracketOrder returns the canonical 1-indexed seed ordering for a
// single-elimination bracket of size B. The slice has length B; adjacent
// pairs (i, i+1) are the R1 pairings. The classic property: seed 1 meets
// seed B in R1, seed 2 meets seed B-1, and high seeds are spread across the
// bracket so they only meet in later rounds.
//
// We build it iteratively: start with [1,2], then double: each round, for
// each existing seed s, insert (B+1-s) next to it, where B is the new size.
func standardBracketOrder(size int) []int {
	order := []int{1, 2}
	for len(order) < size {
		newSize := len(order) * 2
		out := make([]int, 0, newSize)
		for _, s := range order {
			out = append(out, s, newSize+1-s)
		}
		order = out
	}
	return order
}

// BuildBracket constructs a bracket for the given participants using a
// deterministic random seeding (so a stored seed reproduces the bracket).
//
// Rules:
//   - B = next pow2 >= N, byes = B - N.
//   - Participants are shuffled, then assigned seed numbers 1..N.
//   - Top `byes` seeds skip round 1 and are placed directly into round 2.
//   - Round 1 contains only real-vs-real matches (no walkover rows).
//   - Round 2..R are placeholder matches with empty slots, wired via
//     NextRound/NextOrd/NextSlot so a completed match's winner lands in the
//     correct downstream slot.
func BuildBracket(participants []uuid.UUID, seed int64) (Bracket, error) {
	n := len(participants)
	if n < 2 {
		return Bracket{}, errors.New("need at least 2 participants")
	}
	B := nextPow2(n)
	byes := B - n
	rounds := bits.Len(uint(B)) - 1 // log2(B)

	// Deterministic shuffle.
	shuffled := make([]uuid.UUID, n)
	copy(shuffled, participants)
	rng := rand.New(rand.NewSource(seed))
	rng.Shuffle(len(shuffled), func(i, j int) {
		shuffled[i], shuffled[j] = shuffled[j], shuffled[i]
	})

	// seedToPid: 1-indexed seed -> participant UUID.
	seedToPid := make(map[int]uuid.UUID, n)
	for i, p := range shuffled {
		seedToPid[i+1] = p // seed i+1 = participant at index i
	}

	// Lay seeds into the size-B bracket slots in standard order.
	order := standardBracketOrder(B) // length B, values are seed numbers 1..B
	// slotPid[i] = participant UUID for bracket position i (0..B-1), or zero
	// UUID for a phantom slot whose seed exceeds N (those are byes — their
	// opponent advances automatically and gets pre-placed into round 2).
	slotPid := make([]uuid.UUID, B)
	for i, s := range order {
		if s <= n {
			slotPid[i] = seedToPid[s]
		}
	}

	// Build round-2..R placeholder matches first so round-1 matches can
	// reference them by (round, ord). We allocate one slice per round.
	matchesPerRound := make([][]BracketMatch, rounds+1) // 1-indexed
	for r := 1; r <= rounds; r++ {
		count := B >> r // round r has B / 2^r matches
		matchesPerRound[r] = make([]BracketMatch, count)
		for i := range matchesPerRound[r] {
			matchesPerRound[r][i] = BracketMatch{
				Round:  r,
				Ord:    i,
				Status: StatusPending,
			}
		}
	}

	// Wire next-match pointers for every round except the final.
	for r := 1; r < rounds; r++ {
		for i := range matchesPerRound[r] {
			parent := i / 2
			slot := SlotHome
			if i%2 == 1 {
				slot = SlotAway
			}
			matchesPerRound[r][i].NextRound = r + 1
			matchesPerRound[r][i].NextOrd = parent
			matchesPerRound[r][i].NextSlot = slot
		}
	}
	// Final has NextRound = 0 (sentinel).

	// Walk the size-B slot array in pairs to populate round 1. Pair (2k, 2k+1)
	// is match k. There are three cases:
	//   - Both slots filled  → real R1 match (PLAYABLE).
	//   - Exactly one filled → the filled participant gets a bye to R2.
	//   - Neither filled     → impossible with our scheme (byes are top seeds).
	//
	// We *don't* materialize bye matches; the bye participant is placed
	// directly into the corresponding R2 slot.
	for k := 0; k < B/2; k++ {
		a := slotPid[2*k]
		b := slotPid[2*k+1]
		r2Parent := k / 2
		r2Slot := SlotHome
		if k%2 == 1 {
			r2Slot = SlotAway
		}
		switch {
		case a != uuid.Nil && b != uuid.Nil:
			m := BracketMatch{
				Round:    1,
				Ord:      k,
				HomeID:   a,
				AwayID:   b,
				Status:   StatusPlayable,
				NextRound: 2,
				NextOrd:   r2Parent,
				NextSlot:  r2Slot,
			}
			// Single-round special case: B=2, no R2 — clear next pointer.
			if rounds == 1 {
				m.NextRound = 0
				m.NextOrd = 0
				m.NextSlot = ""
			}
			matchesPerRound[1][k] = m
		case a != uuid.Nil || b != uuid.Nil:
			pid := a
			if pid == uuid.Nil {
				pid = b
			}
			// Pre-place the bye participant into R2.
			if r2Slot == SlotHome {
				matchesPerRound[2][r2Parent].HomeID = pid
			} else {
				matchesPerRound[2][r2Parent].AwayID = pid
			}
		default:
			// No participants in this pair — shouldn't happen given our seeding,
			// but be defensive: leave R2 slot empty too.
		}
	}

	// Round 1 slice may contain zero-value entries (the slots that became
	// byes). Compact it: keep only entries with real participants.
	r1Compact := make([]BracketMatch, 0, len(matchesPerRound[1]))
	for _, m := range matchesPerRound[1] {
		if m.HomeID != uuid.Nil && m.AwayID != uuid.Nil {
			r1Compact = append(r1Compact, m)
		}
	}
	matchesPerRound[1] = r1Compact

	// After byes propagate, some R2 matches may have BOTH slots already filled
	// (when both R2 children were byes). Mark those PLAYABLE.
	if rounds >= 2 {
		for i := range matchesPerRound[2] {
			m := &matchesPerRound[2][i]
			if m.HomeID != uuid.Nil && m.AwayID != uuid.Nil {
				m.Status = StatusPlayable
			}
		}
	}

	// Flatten in round order.
	var out []BracketMatch
	for r := 1; r <= rounds; r++ {
		out = append(out, matchesPerRound[r]...)
	}

	return Bracket{
		Size:    B,
		Byes:    byes,
		Rounds:  rounds,
		Matches: out,
	}, nil
}
