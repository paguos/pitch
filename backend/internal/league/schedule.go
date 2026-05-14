// Package league implements pure tournament logic: round-robin scheduling
// and standings computation. No I/O, no external deps — easy to unit test.
package league

// Pairing is one match in the schedule. Bye is true when one side has a bye
// in an odd-N round-robin; callers should skip these (no DB row needed).
type Pairing struct {
	HomeIdx int
	AwayIdx int
	Bye     bool
}

// RoundRobin generates a single round-robin schedule using the circle method.
// Each non-bye pair appears exactly once. For odd n, a phantom slot is added
// and pairings involving it are marked Bye=true.
//
// The returned slice has len = rounds; rounds = n-1 for even n, n for odd n.
func RoundRobin(n int) [][]Pairing {
	if n < 2 {
		return nil
	}
	bye := -1
	players := make([]int, n)
	for i := range players {
		players[i] = i
	}
	if n%2 == 1 {
		players = append(players, bye)
	}
	size := len(players)
	rounds := size - 1
	halfsize := size / 2

	// Fixed slot 0; rotate the rest.
	rotating := make([]int, size-1)
	copy(rotating, players[1:])

	out := make([][]Pairing, rounds)
	for r := 0; r < rounds; r++ {
		row := make([]int, size)
		row[0] = players[0]
		for i := 0; i < size-1; i++ {
			row[i+1] = rotating[i]
		}
		round := make([]Pairing, 0, halfsize)
		for i := 0; i < halfsize; i++ {
			a := row[i]
			b := row[size-1-i]
			isBye := a == bye || b == bye
			// Alternate home/away by round to balance — even rounds: a home, odd: swap.
			home, away := a, b
			if r%2 == 1 {
				home, away = b, a
			}
			round = append(round, Pairing{HomeIdx: home, AwayIdx: away, Bye: isBye})
		}
		out[r] = round
		// Rotate.
		last := rotating[len(rotating)-1]
		copy(rotating[1:], rotating[:len(rotating)-1])
		rotating[0] = last
	}
	return out
}
