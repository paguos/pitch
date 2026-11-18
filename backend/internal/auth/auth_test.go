package auth

import (
	"testing"
	"time"
)

func TestPasswordRoundTrip(t *testing.T) {
	h, err := HashPassword("correct horse battery")
	if err != nil {
		t.Fatal(err)
	}
	if ok, err := VerifyPassword("correct horse battery", h); err != nil || !ok {
		t.Fatalf("right password: ok=%v err=%v", ok, err)
	}
	if ok, _ := VerifyPassword("wrong", h); ok {
		t.Fatal("wrong password accepted")
	}
	h2, _ := HashPassword("correct horse battery")
	if h == h2 {
		t.Fatal("hashes must be salted")
	}
	if _, err := VerifyPassword("x", "not-a-hash"); err == nil {
		t.Fatal("malformed hash should error")
	}
}

func TestTokensAreHashedAndUnique(t *testing.T) {
	a, ah, _ := NewToken()
	b, _, _ := NewToken()
	if a == b || a == ah || HashToken(a) != ah {
		t.Fatal("token/hash invariant broken")
	}
}

func TestLimiter(t *testing.T) {
	l := NewLimiter(2, 50*time.Millisecond)
	l.Fail("k")
	if l.Blocked("k") {
		t.Fatal("blocked too early")
	}
	l.Fail("k")
	if !l.Blocked("k") {
		t.Fatal("should be blocked after max failures")
	}
	if l.Blocked("other") {
		t.Fatal("keys must be independent")
	}
	time.Sleep(60 * time.Millisecond)
	if l.Blocked("k") {
		t.Fatal("window should have expired")
	}
	l.Fail("k")
	l.Fail("k")
	l.Reset("k")
	if l.Blocked("k") {
		t.Fatal("reset should clear")
	}
}
