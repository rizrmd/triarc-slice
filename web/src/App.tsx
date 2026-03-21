import { useEffect, useRef, useState } from "react";
import {
  authenticateViaWebSocket,
  getCheckoutUrl,
  getInitialSession,
  hasGoogleClientId,
  loadGoogleIdentityScript,
  logout,
  renderGoogleButton,
  type SessionState,
} from "./lib/api";

const caveBackground = new URL("../../assets/places/cave-narrow.webp", import.meta.url).href;
const logoVideo = new URL("../../assets/ui/logo.ogv", import.meta.url).href;
const heroFrame = new URL("../../assets/ui/hero-frame.webp", import.meta.url).href;
const actionFrame = new URL("../../assets/ui/action-frame.webp", import.meta.url).href;
const iconFire = new URL("../../assets/ui/elements/fire.webp", import.meta.url).href;
const iconIce = new URL("../../assets/ui/elements/ice.webp", import.meta.url).href;
const iconWind = new URL("../../assets/ui/elements/wind.webp", import.meta.url).href;
const frostQueen = new URL("../../data/hero/frost-queen/img/pose-char-fg.webp", import.meta.url).href;
const arcStrider = new URL("../../data/hero/arc-strider/img/pose-char-fg.webp", import.meta.url).href;
const dawnPriest = new URL("../../data/hero/dawn-priest/img/pose-char-fg.webp", import.meta.url).href;
const fireball = new URL("../../data/action/fireball/img/char-bg.webp", import.meta.url).href;
const frostbolt = new URL("../../data/action/frostbolt/img/char-bg.webp", import.meta.url).href;
const timeSlip = new URL("../../data/action/time-slip/img/char-bg.webp", import.meta.url).href;

interface FeaturedHero {
  name: string;
  title: string;
  blurb: string;
  element: string;
  image: string;
}

interface GameplayCard {
  name: string;
  detail: string;
  image: string;
}

const featuredHeroes: FeaturedHero[] = [
  {
    name: "Frost Queen",
    title: "Control the line",
    blurb: "Turns tempo into a weapon with cold pressure, freezing burst, and relentless zone control.",
    element: "Ice",
    image: frostQueen,
  },
  {
    name: "Arc Strider",
    title: "Strike before the answer",
    blurb: "A storm-borne duelist built around speed, lightning pressure, and sudden lethal reach.",
    element: "Wind",
    image: arcStrider,
  },
  {
    name: "Dawn Priest",
    title: "Hold the light",
    blurb: "Anchors a roster with radiant sustain, resilience, and punishing anti-shadow presence.",
    element: "Light",
    image: dawnPriest,
  },
];

const gameplayCards: GameplayCard[] = [
  {
    name: "Fireball",
    detail: "Direct burst to punish an exposed target.",
    image: fireball,
  },
  {
    name: "Frostbolt",
    detail: "Fast elemental pressure for tempo and setup.",
    image: frostbolt,
  },
  {
    name: "Time Slip",
    detail: "Bend turn rhythm and create unexpected openings.",
    image: timeSlip,
  },
];

const faqItems = [
  {
    question: "What stage is the game in?",
    answer:
      "Vanguard's Gambit is currently in prototype. The site shows real art, cards, and interface direction from the active build.",
  },
  {
    question: "What do I get for $5?",
    answer:
      "The Founder Pack is the entry backing tier. It secures founder status, a founder-only cosmetic badge, and early support recognition tied to your account.",
  },
  {
    question: "Why ask for backing this early?",
    answer:
      "This version is meant to fund completion while the combat, roster, and content direction are still being sharpened.",
  },
  {
    question: "How does purchase work?",
    answer:
      "You sign in first, then the site sends you into the Founder Pack checkout flow. If your account already has founder status, the buy CTA is replaced with a founder confirmation state.",
  },
];

function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [session, setSession] = useState<SessionState | null>(() => getInitialSession());
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    authenticateViaWebSocket()
      .then((nextSession) => {
        setSession(nextSession);
        setSessionError(null);
      })
      .catch(() => {
        // Silent fallback: the page can load without an active account.
      });
  }, []);

  useEffect(() => {
    if (!hasGoogleClientId()) {
      setSessionError("Google Sign-In is not configured yet. Set VITE_GOOGLE_CLIENT_ID for live auth.");
      return;
    }

    loadGoogleIdentityScript()
      .then(() => setGoogleReady(true))
      .catch(() => {
        setSessionError("Google Sign-In could not be loaded right now.");
      });
  }, []);

  useEffect(() => {
    if (!googleReady || !googleButtonRef.current) {
      return;
    }

    try {
      renderGoogleButton(googleButtonRef.current, async (response) => {
        try {
          setSigningIn(true);
          setSessionError(null);
          const nextSession = await authenticateViaWebSocket(response.credential);
          setSession(nextSession);
        } catch (error) {
          setSessionError(error instanceof Error ? error.message : "Authentication failed.");
        } finally {
          setSigningIn(false);
        }
      });
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : "Google Sign-In is unavailable.");
    }
  }, [googleReady]);

  async function handlePrimaryCta() {
    setCheckoutError(null);

    if (!session?.authenticated) {
      setCheckoutError("Sign in with Google first to continue into the Founder Pack flow.");
      return;
    }

    const checkoutUrl = getCheckoutUrl();
    if (!checkoutUrl) {
      setCheckoutError("Founder checkout is not configured yet. Set VITE_CHECKOUT_URL to enable the live purchase flow.");
      return;
    }

    try {
      setCheckoutPending(true);
      window.location.href = checkoutUrl;
    } catch {
      setCheckoutError("Founder checkout could not be started. Please try again shortly.");
    } finally {
      setCheckoutPending(false);
    }
  }

  function handleLogout() {
    logout();
    setSession(null);
    setCheckoutError(null);
  }

  const primaryLabel = checkoutPending
      ? "Starting Checkout..."
      : "Back the Founder Pack - $5";

  return (
    <div className="page-shell">
      <div className="background-stack" aria-hidden="true">
        <div className="background-glow background-glow-left" />
        <div className="background-glow background-glow-right" />
      </div>

      <header className="site-header">
        <div className="brand-lockup">
          <span className="brand-mark">VG</span>
          <span className="brand-name">Vanguard&apos;s Gambit</span>
        </div>
        <button
          type="button"
          className="menu-button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="site-nav"
        >
          Menu
        </button>
      </header>

      <nav id="site-nav" className={`site-nav ${menuOpen ? "site-nav-open" : ""}`}>
        <a href="#gameplay" onClick={() => setMenuOpen(false)}>Gameplay</a>
        <a href="#heroes" onClick={() => setMenuOpen(false)}>Heroes</a>
        <a href="#founder-pack" onClick={() => setMenuOpen(false)}>Founder Pack</a>
        <a href="#faq" onClick={() => setMenuOpen(false)}>FAQ</a>
      </nav>

      <main>
        <section className="hero-section panel">
          <div className="hero-copy">
            <p className="eyebrow">Playable prototype. Early founder access is open.</p>
            <h1>A dark fantasy tactical card battler where elemental heroes decide the fight.</h1>
            <p className="lede">
              Build a roster, exploit elemental affinities, and punish mistakes with ruthless action cards.
              Back early to lock in founder status before the battlefield fills.
            </p>
            <div className="cta-stack">
              <button type="button" className="primary-button" onClick={handlePrimaryCta} disabled={checkoutPending}>
                {primaryLabel}
              </button>
              <a className="secondary-button" href="#gameplay">
                See Gameplay
              </a>
            </div>
            <div className="auth-panel">
              {session?.authenticated && session.user ? (
                <>
                  <p className="status-note">
                    Signed in as {session.user.displayName} ({session.user.playerId})
                  </p>
                  <button type="button" className="text-button" onClick={handleLogout}>
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <p className="status-note">
                    Sign in with Google to connect your Vanguard&apos;s Gambit account before checkout.
                  </p>
                  <div ref={googleButtonRef} className="google-button-slot" />
                  {signingIn ? <p className="status-note">Authenticating with sg.vangambit.com...</p> : null}
                </>
              )}
            </div>
            {sessionError ? <p className="inline-alert">{sessionError}</p> : null}
            {checkoutError ? <p className="inline-alert">{checkoutError}</p> : null}
          </div>

          <div className="hero-visual">
            <div className="hero-video-frame">
              <video autoPlay muted loop playsInline poster={caveBackground}>
                <source src={logoVideo} type="video/ogg" />
              </video>
            </div>
            <div className="hero-art-stage" style={{ backgroundImage: `url(${caveBackground})` }}>
              <img className="hero-card hero-card-left" src={frostQueen} alt="Frost Queen" />
              <img className="hero-card hero-card-center" src={arcStrider} alt="Arc Strider" />
              <img className="hero-card hero-card-right" src={dawnPriest} alt="Dawn Priest" />
            </div>
          </div>
        </section>

        <section className="value-strip panel">
          <div>
            <strong>17</strong>
            <span>Heroes</span>
          </div>
          <div>
            <strong>31</strong>
            <span>Actions</span>
          </div>
          <div>
            <strong>6</strong>
            <span>Elements</span>
          </div>
          <div>
            <strong>$5</strong>
            <span>Founder Entry</span>
          </div>
        </section>

        <section id="gameplay" className="panel section-block">
          <div className="section-copy">
            <p className="eyebrow">Gameplay proof</p>
            <h2>How Vanguard&apos;s Gambit plays</h2>
            <p>
              Every roster is a tension between role coverage and elemental risk. Pick the wrong target, waste a setup
              action, or ignore an affinity edge and the enemy line punishes you immediately.
            </p>
          </div>

          <div className="gameplay-points">
            <article>
              <img src={iconFire} alt="" aria-hidden="true" />
              <div>
                <h3>Build the roster</h3>
                <p>Choose heroes that cover pressure, defense, and elemental weaknesses.</p>
              </div>
            </article>
            <article>
              <img src={iconIce} alt="" aria-hidden="true" />
              <div>
                <h3>Exploit affinities</h3>
                <p>Fire, ice, earth, wind, light, and shadow change both output and survivability.</p>
              </div>
            </article>
            <article>
              <img src={iconWind} alt="" aria-hidden="true" />
              <div>
                <h3>Play decisive actions</h3>
                <p>Use burst, setup, protection, and tempo cards to break the enemy line first.</p>
              </div>
            </article>
          </div>

          <div className="gameplay-card-row">
            {gameplayCards.map((card) => (
              <article key={card.name} className="action-card" style={{ backgroundImage: `url(${actionFrame})` }}>
                <img src={card.image} alt={card.name} />
                <div>
                  <h3>{card.name}</h3>
                  <p>{card.detail}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel section-block feature-panel">
          <div className="section-copy">
            <p className="eyebrow">Why it hits</p>
            <h2>Character-forward tactics, not abstract systems copy</h2>
          </div>
          <div className="feature-grid">
            <article>
              <h3>Distinct heroes</h3>
              <p>Every hero enters the page as a role with visible attitude, not a faceless stat block.</p>
            </article>
            <article>
              <h3>Elemental depth</h3>
              <p>Affinity matters on offense and defense, so matchup choices stay meaningful.</p>
            </article>
            <article>
              <h3>Ruthless actions</h3>
              <p>Cards are built to punish hesitation with burst, setup, shielding, and counterplay.</p>
            </article>
          </div>
        </section>

        <section id="heroes" className="panel section-block">
          <div className="section-copy">
            <p className="eyebrow">Featured heroes</p>
            <h2>Lead with the roster</h2>
            <p>The roster is the hook. These heroes give the site its voice and the combat its shape.</p>
          </div>

          <div className="hero-showcase">
            {featuredHeroes.map((hero) => (
              <article key={hero.name} className="hero-showcase-card" style={{ backgroundImage: `url(${heroFrame})` }}>
                <img src={hero.image} alt={hero.name} />
                <div>
                  <p className="hero-element">{hero.element}</p>
                  <h3>{hero.name}</h3>
                  <strong>{hero.title}</strong>
                  <p>{hero.blurb}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="founder-pack" className="panel section-block founder-panel">
          <div className="section-copy">
            <p className="eyebrow">Founder Pack</p>
            <h2>Back Vanguard&apos;s Gambit early</h2>
            <p>
              The Founder Pack is the lowest-friction way to join early, help fund development, and secure
              founder-only recognition while the game is still in prototype.
            </p>
          </div>

          <article className="founder-card">
            <div className="price-lockup">
              <span className="price">$5</span>
              <span className="price-note">one-time founder tier</span>
            </div>
            <ul>
              <li>Founder-only cosmetic badge tied to your account</li>
              <li>Early supporter status before broader release</li>
              <li>Direct backing for continued roster and combat development</li>
            </ul>
            <button type="button" className="primary-button" onClick={handlePrimaryCta} disabled={checkoutPending}>
              {primaryLabel}
            </button>
            <p className="status-note">
              Sign-in uses Google identity, then authenticates against `wss://sg.vangambit.com/ws`.
            </p>
          </article>
        </section>

        <section className="panel section-block reasons-panel">
          <div className="section-copy">
            <p className="eyebrow">Why back now</p>
            <h2>Get in before the game hardens</h2>
          </div>
          <div className="reasons-list">
            <article>
              <h3>Shape the direction</h3>
              <p>Support the game while heroes, actions, and pacing are still being refined.</p>
            </article>
            <article>
              <h3>Enter as a founder</h3>
              <p>Claim early status before the project grows past its first supporters.</p>
            </article>
            <article>
              <h3>Back something real</h3>
              <p>The page is built around active game assets, not mock fantasy branding detached from the build.</p>
            </article>
          </div>
        </section>

        <section id="faq" className="panel section-block faq-panel">
          <div className="section-copy">
            <p className="eyebrow">FAQ</p>
            <h2>Trust matters when the ask comes early</h2>
          </div>
          <div className="faq-list">
            {faqItems.map((item) => (
              <details key={item.question}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="panel section-block final-cta">
          <p className="eyebrow">Final call</p>
          <h2>Join the first supporters of Vanguard&apos;s Gambit.</h2>
          <button type="button" className="primary-button" onClick={handlePrimaryCta} disabled={checkoutPending}>
            {primaryLabel}
          </button>
        </section>
      </main>
    </div>
  );
}

export default App;
