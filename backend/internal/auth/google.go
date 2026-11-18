package auth

import (
	"context"
	"errors"
	"net/url"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

// Identity is a verified Google account.
type Identity struct {
	Sub           string
	Email         string
	EmailVerified bool
}

// Provider abstracts the Google sign-in so tests and local dev can use a fake.
type Provider interface {
	// AuthURL returns where to send the browser to sign in.
	AuthURL(state, nonce, challenge string) string
	// Exchange trades the callback code for a verified identity.
	Exchange(ctx context.Context, code, verifier, nonce string) (Identity, error)
}

// Google is the real provider: authorization code flow with PKCE, with the ID
// token verified (signature, audience, nonce) via OIDC discovery.
type Google struct {
	cfg      *oauth2.Config
	verifier *oidc.IDTokenVerifier
}

func NewGoogle(ctx context.Context, clientID, clientSecret, redirectURL string) (*Google, error) {
	p, err := oidc.NewProvider(ctx, "https://accounts.google.com")
	if err != nil {
		return nil, err
	}
	return &Google{
		cfg: &oauth2.Config{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			RedirectURL:  redirectURL,
			Endpoint:     p.Endpoint(),
			Scopes:       []string{oidc.ScopeOpenID, "email"},
		},
		verifier: p.Verifier(&oidc.Config{ClientID: clientID}),
	}, nil
}

func (g *Google) AuthURL(state, nonce, challenge string) string {
	return g.cfg.AuthCodeURL(state,
		oidc.Nonce(nonce),
		oauth2.SetAuthURLParam("code_challenge", challenge),
		oauth2.SetAuthURLParam("code_challenge_method", "S256"),
		oauth2.SetAuthURLParam("prompt", "select_account"),
	)
}

func (g *Google) Exchange(ctx context.Context, code, verifier, nonce string) (Identity, error) {
	tok, err := g.cfg.Exchange(ctx, code, oauth2.VerifierOption(verifier))
	if err != nil {
		return Identity{}, err
	}
	raw, ok := tok.Extra("id_token").(string)
	if !ok {
		return Identity{}, errors.New("no id_token in response")
	}
	idt, err := g.verifier.Verify(ctx, raw)
	if err != nil {
		return Identity{}, err
	}
	if idt.Nonce != nonce {
		return Identity{}, errors.New("nonce mismatch")
	}
	var claims struct {
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
	}
	if err := idt.Claims(&claims); err != nil {
		return Identity{}, err
	}
	return Identity{Sub: idt.Subject, Email: claims.Email, EmailVerified: claims.EmailVerified}, nil
}

// Fake is a stand-in provider for local development and tests: AuthURL points
// at a tiny page served by the backend where you type the email to sign in as,
// and that email becomes the "code". Never enabled in production.
type Fake struct {
	// PagePath is the backend path (as the browser sees it) of the fake page.
	PagePath string
}

func (f Fake) AuthURL(state, _, _ string) string {
	return f.PagePath + "?" + url.Values{"state": {state}}.Encode()
}

func (f Fake) Exchange(_ context.Context, code, _, _ string) (Identity, error) {
	if code == "" {
		return Identity{}, errors.New("empty code")
	}
	return Identity{Sub: "fake:" + code, Email: code, EmailVerified: true}, nil
}
