package knockout

import (
	"fmt"
	"testing"

	"github.com/google/uuid"
)

func mkParticipants(n int) []uuid.UUID {
	out := make([]uuid.UUID, n)
	for i := 0; i < n; i++ {
		// Deterministic non-zero UUIDs.
		out[i] = uuid.NewSHA1(uuid.NameSpaceDNS, []byte(fmt.Sprintf("p%d", i)))
	}
	return out
}

func TestNextPow2(t *testing.T) {
	cases := map[int]int{1: 1, 2: 2, 3: 4, 4: 4, 5: 8, 7: 8, 8: 8, 9: 16, 16: 16, 17: 32}
	for in, want := range cases {
		if got := nextPow2(in); got != want {
			t.Errorf("nextPow2(%d) = %d, want %d", in, got, want)
		}
	}
}

func TestStandardBracketOrderPairsTopWithBottom(t *testing.T) {
	o := standardBracketOrder(8)
	if len(o) != 8 {
		t.Fatalf("len=%d, want 8", len(o))
	}
	// R1 pairings are adjacent pairs.
	// (1 vs 8) (4 vs 5) (3 vs 6) (2 vs 7) is standard.
	pairs := [][2]int{{o[0], o[1]}, {o[2], o[3]}, {o[4], o[5]}, {o[6], o[7]}}
	for _, p := range pairs {
		if p[0]+p[1] != 9 {
			t.Errorf("pair %v should sum to B+1=9", p)
		}
	}
	// Seeds 1 and 2 must be on opposite halves.
	if (o[0] == 1 && o[len(o)/2] != 2) && !(o[0] == 1 && o[len(o)-2] == 2 || true) {
		// Loose check: just ensure they aren't in the same R2 quartet.
	}
	idx := func(v int) int {
		for i, x := range o {
			if x == v {
				return i
			}
		}
		return -1
	}
	if idx(1) < 4 != (idx(2) >= 4) {
		t.Errorf("seeds 1 and 2 should be in opposite halves; order=%v", o)
	}
}

func TestBracketShape(t *testing.T) {
	cases := []struct {
		n       int
		size    int
		byes    int
		rounds  int
		r1count int
		total   int // total matches across all rounds
	}{
		{2, 2, 0, 1, 1, 1},
		{3, 4, 1, 2, 1, 2},
		{4, 4, 0, 2, 2, 3},
		{5, 8, 3, 3, 1, 4},
		{7, 8, 1, 3, 3, 6},
		{8, 8, 0, 3, 4, 7},
		{9, 16, 7, 4, 1, 8},
		{16, 16, 0, 4, 8, 15},
		{17, 32, 15, 5, 1, 16},
	}
	for _, c := range cases {
		t.Run(fmt.Sprintf("n=%d", c.n), func(t *testing.T) {
			b, err := BuildBracket(mkParticipants(c.n), 42)
			if err != nil {
				t.Fatal(err)
			}
			if b.Size != c.size || b.Byes != c.byes || b.Rounds != c.rounds {
				t.Errorf("size/byes/rounds=%d/%d/%d, want %d/%d/%d",
					b.Size, b.Byes, b.Rounds, c.size, c.byes, c.rounds)
			}
			r1 := 0
			for _, m := range b.Matches {
				if m.Round == 1 {
					r1++
				}
			}
			if r1 != c.r1count {
				t.Errorf("R1 count = %d, want %d", r1, c.r1count)
			}
			if len(b.Matches) != c.total {
				t.Errorf("total matches = %d, want %d", len(b.Matches), c.total)
			}
			// Total matches must equal N-1: every match eliminates one player.
			if len(b.Matches) != c.n-1 {
				t.Errorf("total matches = %d, want N-1 = %d", len(b.Matches), c.n-1)
			}
		})
	}
}

func TestBracketWiringReachesFinal(t *testing.T) {
	for _, n := range []int{2, 3, 4, 5, 7, 8, 9, 16, 17} {
		t.Run(fmt.Sprintf("n=%d", n), func(t *testing.T) {
			b, err := BuildBracket(mkParticipants(n), 1)
			if err != nil {
				t.Fatal(err)
			}
			// Index by (round, ord).
			idx := map[[2]int]int{}
			for i, m := range b.Matches {
				idx[[2]int{m.Round, m.Ord}] = i
			}
			// Walk each non-final match and confirm its next pointer resolves.
			finalCount := 0
			for _, m := range b.Matches {
				if m.NextRound == 0 {
					finalCount++
					continue
				}
				key := [2]int{m.NextRound, m.NextOrd}
				if _, ok := idx[key]; !ok {
					t.Errorf("match R%d.O%d points to missing R%d.O%d", m.Round, m.Ord, m.NextRound, m.NextOrd)
				}
				if m.NextSlot != SlotHome && m.NextSlot != SlotAway {
					t.Errorf("match R%d.O%d has invalid slot %q", m.Round, m.Ord, m.NextSlot)
				}
			}
			if finalCount != 1 {
				t.Errorf("expected exactly 1 final, got %d", finalCount)
			}
		})
	}
}

func TestBracketByesPrePlacedIntoRound2(t *testing.T) {
	// N=5: 3 byes, 1 R1 match. After Build:
	//   - Round 1 has exactly 1 match (both slots filled).
	//   - Round 2 has 2 matches; 3 of the 4 R2 slots are pre-filled by byes,
	//     1 slot is empty awaiting the R1 winner.
	b, err := BuildBracket(mkParticipants(5), 7)
	if err != nil {
		t.Fatal(err)
	}
	r2Filled := 0
	r2Empty := 0
	for _, m := range b.Matches {
		if m.Round != 2 {
			continue
		}
		if m.HomeID != uuid.Nil {
			r2Filled++
		} else {
			r2Empty++
		}
		if m.AwayID != uuid.Nil {
			r2Filled++
		} else {
			r2Empty++
		}
	}
	if r2Filled != 3 || r2Empty != 1 {
		t.Errorf("R2 slots: filled=%d empty=%d, want 3/1", r2Filled, r2Empty)
	}
}

func TestBracketDeterministicWithSameSeed(t *testing.T) {
	parts := mkParticipants(8)
	a, _ := BuildBracket(parts, 12345)
	b, _ := BuildBracket(parts, 12345)
	if len(a.Matches) != len(b.Matches) {
		t.Fatalf("length mismatch")
	}
	for i := range a.Matches {
		if a.Matches[i] != b.Matches[i] {
			t.Fatalf("match %d differs: %+v vs %+v", i, a.Matches[i], b.Matches[i])
		}
	}
}

func TestBracketDifferentSeedsCanDiffer(t *testing.T) {
	parts := mkParticipants(8)
	a, _ := BuildBracket(parts, 1)
	b, _ := BuildBracket(parts, 999999)
	diff := false
	for i := range a.Matches {
		if a.Matches[i] != b.Matches[i] {
			diff = true
			break
		}
	}
	if !diff {
		t.Error("expected different seeds to produce different brackets (probabilistic)")
	}
}

func TestBracketAllParticipantsAppearInRound1OrBye(t *testing.T) {
	for _, n := range []int{2, 3, 4, 5, 7, 8, 9, 16, 17} {
		t.Run(fmt.Sprintf("n=%d", n), func(t *testing.T) {
			parts := mkParticipants(n)
			b, err := BuildBracket(parts, 42)
			if err != nil {
				t.Fatal(err)
			}
			seen := map[uuid.UUID]bool{}
			for _, m := range b.Matches {
				if m.HomeID != uuid.Nil {
					seen[m.HomeID] = true
				}
				if m.AwayID != uuid.Nil {
					seen[m.AwayID] = true
				}
			}
			for _, p := range parts {
				if !seen[p] {
					t.Errorf("participant %s does not appear anywhere in bracket", p)
				}
			}
		})
	}
}
