package league

import (
	"fmt"
	"testing"
)

func TestRoundRobin_PairUniqueness(t *testing.T) {
	for _, n := range []int{2, 3, 4, 5, 6, 7, 8} {
		t.Run(fmt.Sprintf("n=%d", n), func(t *testing.T) {
			sched := RoundRobin(n)
			seen := map[string]int{}
			byes := 0
			for _, round := range sched {
				for _, p := range round {
					if p.Bye {
						byes++
						continue
					}
					a, b := p.HomeIdx, p.AwayIdx
					if a > b {
						a, b = b, a
					}
					key := fmt.Sprintf("%d-%d", a, b)
					seen[key]++
				}
			}
			expectedPairs := n * (n - 1) / 2
			if len(seen) != expectedPairs {
				t.Fatalf("expected %d unique pairs, got %d (seen=%v)", expectedPairs, len(seen), seen)
			}
			for k, v := range seen {
				if v != 1 {
					t.Fatalf("pair %s played %d times, want 1", k, v)
				}
			}
			expectedRounds := n - 1
			if n%2 == 1 {
				expectedRounds = n
			}
			if len(sched) != expectedRounds {
				t.Fatalf("expected %d rounds, got %d", expectedRounds, len(sched))
			}
		})
	}
}

func TestRoundRobin_Deterministic(t *testing.T) {
	a := RoundRobin(6)
	b := RoundRobin(6)
	if len(a) != len(b) {
		t.Fatalf("rounds differ")
	}
	for i := range a {
		if len(a[i]) != len(b[i]) {
			t.Fatalf("round %d size differ", i)
		}
		for j := range a[i] {
			if a[i][j] != b[i][j] {
				t.Fatalf("round %d match %d differ: %+v vs %+v", i, j, a[i][j], b[i][j])
			}
		}
	}
}

func TestRoundRobin_SmallCases(t *testing.T) {
	if RoundRobin(0) != nil || RoundRobin(1) != nil {
		t.Fatal("expected nil for n<2")
	}
	s := RoundRobin(2)
	if len(s) != 1 || len(s[0]) != 1 {
		t.Fatalf("n=2 should be 1 round 1 match, got %+v", s)
	}
}
