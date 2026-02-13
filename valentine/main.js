/* ============================================
   Long-Distance Protocol – Valentine Delivery
   main.js
   
   Orchestrates the full experience:
   Phase 1: Landing (starfield + typewriter terminal)
   Phase 2: Globe animation (3D globe with arc from SF → Boston)
   Phase 3: Status overlay (animated counters)
   Phase 4: Transition (cyber → romantic)
   Phase 5: Letter reveal (typewriter + content)
   Phase 6: The Ask (accept / dodge interactions)
   ============================================ */

(function () {
  'use strict';

  /* ---------- Constants ---------- */
  const SF_COORDS = { lat: 37.7749, lng: -122.4194 };
  const BOSTON_COORDS = { lat: 42.3601, lng: -71.0589 };
  const DISTANCE_MILES = 3084;
  const ARC_FLIGHT_TIME = 7000;        // ms for the arc animation
  const ARRIVING_THRESHOLD = 0.75;     // 75% through the arc
  const CE_DISPLAY_TIME = 2500;        // ms to show "Connection Established"
  const TYPEWRITER_SPEED = 25;         // ms per character

  /* ---------- DOM References ---------- */
  const $landing = document.getElementById('landing');
  const $globePhase = document.getElementById('globe-phase');
  const $letterPhase = document.getElementById('letter-phase');
  const $btnBegin = document.getElementById('btn-begin');
  const $globeContainer = document.getElementById('globe-container');
  const $statusOverlay = document.getElementById('status-overlay');
  const $connectionEstablished = document.getElementById('connection-established');
  const $statLatency = document.getElementById('stat-latency');
  const $statPacket = document.getElementById('stat-packet');
  const $btnAccept = document.getElementById('btn-accept');
  const $btnRetry = document.getElementById('btn-retry');
  const $retryError = document.getElementById('retry-error');
  const $acceptedState = document.getElementById('accepted-state');
  const $countdown = document.getElementById('countdown');

  /* ---------- State ---------- */
  let retryCount = 0;
  const retryMessages = [
    'Error: Connection refused.',
    'Error: Timeout exceeded.',
    'Rerouting to Accept...'
  ];

  /* ============================================
     PHASE 1: LANDING SCREEN
     ============================================ */

  /**
   * Draws a kawaii pixel-art starfield on a canvas element.
   * Stars are rendered as small square pixels with pastel colors
   * and step-based twinkling for an authentic pixel-art feel.
   */
  function initStarfield() {
    const canvas = document.getElementById('starfield');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    let animId;
    const stars = [];
    const STAR_COUNT = 120;
    // Pixel grid size — stars snap to this grid
    const PIXEL = 3;

    // Pastel star colors (kawaii palette)
    const STAR_COLORS = [
      [200, 180, 255],  // lavender
      [180, 220, 255],  // baby blue
      [255, 200, 220],  // pink
      [180, 255, 220],  // mint
      [255, 230, 180],  // peach
      [220, 220, 240],  // soft white
    ];

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    function createStars() {
      stars.length = 0;
      for (let i = 0; i < STAR_COUNT; i++) {
        const color = STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)];
        stars.push({
          // Snap to pixel grid
          x: Math.floor((Math.random() * canvas.width) / PIXEL) * PIXEL,
          y: Math.floor((Math.random() * canvas.height) / PIXEL) * PIXEL,
          size: (Math.random() > 0.7 ? 2 : 1) * PIXEL,  // Mostly 1-pixel, some 2-pixel
          color: color,
          alpha: Math.random() * 0.7 + 0.3,
          speed: (Math.random() > 0.8 ? 2 : 1) * PIXEL * 0.01,  // Slow, stepped drift
          twinkleRate: Math.floor(Math.random() * 60 + 30),  // Frames between twinkle changes
          twinkleFrame: Math.floor(Math.random() * 60),
          on: true  // Twinkle state
        });
      }
    }

    let frameCount = 0;

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      frameCount++;

      for (const s of stars) {
        // Step-based twinkling (discrete on/off like pixel art)
        if (frameCount % s.twinkleRate === 0) {
          s.on = !s.on;
        }

        if (s.on) {
          const [r, g, b] = s.color;
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${s.alpha})`;
          ctx.fillRect(s.x, s.y, s.size, s.size);
        }

        // Slow upward drift
        s.y -= s.speed;
        if (s.y < -s.size) {
          s.y = canvas.height + s.size;
          s.x = Math.floor((Math.random() * canvas.width) / PIXEL) * PIXEL;
        }
      }
      animId = requestAnimationFrame(draw);
    }

    resize();
    createStars();
    animId = requestAnimationFrame(draw);

    window.addEventListener('resize', () => {
      resize();
      createStars();
    });

    // Return cleanup function
    return () => cancelAnimationFrame(animId);
  }

  /**
   * Animates terminal lines appearing one by one with a typewriter-like
   * fade-in effect, then reveals the "Begin Transmission" button.
   */
  function animateTerminal() {
    const lines = document.querySelectorAll('.terminal-line');
    lines.forEach((line, i) => {
      const delay = parseInt(line.dataset.delay, 10) || i * 600;
      setTimeout(() => line.classList.add('visible'), delay);
    });

    // Show button after all lines are visible
    const totalDelay = Array.from(lines).reduce((max, line) => {
      return Math.max(max, parseInt(line.dataset.delay, 10) || 0);
    }, 0);

    setTimeout(() => {
      $btnBegin.classList.add('show');
    }, totalDelay + 800);
  }

  /* ============================================
     PHASE 2: GLOBE ANIMATION
     ============================================ */

  /**
   * Initializes Globe.gl with night-Earth aesthetic,
   * two city markers, and an animated arc from SF to Boston.
   * Returns a promise that resolves when the arc "arrives."
   */
  function initGlobe() {
    return new Promise((resolve) => {
      const $loading = document.getElementById('globe-loading');

      // Wait for Globe.gl to be available (with retry)
      let waitAttempts = 0;
      function waitForGlobe() {
        if (typeof Globe !== 'undefined') {
          buildGlobe();
        } else if (waitAttempts < 50) {
          waitAttempts++;
          setTimeout(waitForGlobe, 200);
        } else {
          console.warn('Globe.gl failed to load. Skipping to letter.');
          if ($loading) $loading.style.display = 'none';
          resolve();
        }
      }

      function buildGlobe() {
        const width = window.innerWidth;
        const height = window.innerHeight;

        // Create the globe instance at full resolution
        const globe = Globe()
          .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-night.jpg')
          .backgroundImageUrl('https://unpkg.com/three-globe/example/img/night-sky.png')
          .width(width)
          .height(height)
          .backgroundColor('rgba(0,0,0,0)')
          .atmosphereColor('#a78bfa')           // Lavender atmosphere
          .atmosphereAltitude(0.25)
          .showGraticules(false)
          ($globeContainer);

        // Hide loading text once globe renders
        setTimeout(() => {
          if ($loading) {
            $loading.style.transition = 'opacity 0.5s ease';
            $loading.style.opacity = '0';
            setTimeout(() => $loading.style.display = 'none', 500);
          }
        }, 800);

        // Point-of-view: center on the US, slight tilt
        globe.pointOfView({ lat: 39.5, lng: -98.0, altitude: 2.2 }, 1000);

        // Disable auto-rotate so we control the view
        globe.controls().autoRotate = false;
        globe.controls().enableZoom = false;
        // Allow gentle drag but restrict
        globe.controls().enableRotate = true;
        globe.controls().rotateSpeed = 0.3;

        // City markers — kawaii pastel colors
        const markerData = [
          { ...SF_COORDS, city: 'San Francisco', color: '#a78bfa' },  // Lavender
          { ...BOSTON_COORDS, city: 'Cambridge', color: '#f9a8d4' }    // Pink
        ];

        globe
          .ringsData(markerData)
          .ringLat(d => d.lat)
          .ringLng(d => d.lng)
          .ringColor(d => () => d.color)
          .ringMaxRadius(3)
          .ringPropagationSpeed(2)
          .ringRepeatPeriod(1200);

        // Point markers
        globe
          .pointsData(markerData)
          .pointLat(d => d.lat)
          .pointLng(d => d.lng)
          .pointColor(d => d.color)
          .pointAltitude(0.015)
          .pointRadius(0.5);

        // Labels
        globe
          .labelsData(markerData)
          .labelLat(d => d.lat)
          .labelLng(d => d.lng)
          .labelText(d => d.city)
          .labelSize(1.4)
          .labelDotRadius(0.5)
          .labelColor(d => () => d.color)
          .labelAltitude(0.018)
          .labelResolution(1);  // Low resolution for pixel feel

        // Animated arc from SF to Boston — pastel gradient
        const arcData = [{
          startLat: SF_COORDS.lat,
          startLng: SF_COORDS.lng,
          endLat: BOSTON_COORDS.lat,
          endLng: BOSTON_COORDS.lng,
          color: ['#a78bfa', '#f9a8d4']  // Lavender → Pink
        }];

        // Start with no arc, add after globe settles
        setTimeout(() => {
          globe
            .arcsData(arcData)
            .arcColor(d => d.color)
            .arcStroke(1.2)    // Thicker stroke for pixel visibility
            .arcDashLength(0.6)
            .arcDashGap(0.3)
            .arcDashAnimateTime(ARC_FLIGHT_TIME)
            .arcAltitudeAutoScale(0.4);

          // Show status overlay
          $statusOverlay.classList.add('visible');

          // Start the latency counter animation
          animateLatencyCounter();

          // Schedule status changes
          scheduleStatusUpdates(resolve);
        }, 1500);

        // Handle resize
        const handleResize = () => {
          globe.width(window.innerWidth);
          globe.height(window.innerHeight);
        };
        window.addEventListener('resize', handleResize);
      }

      waitForGlobe();
    });
  }

  /**
   * Animates the latency counter from 0 to DISTANCE_MILES
   * using requestAnimationFrame with easing.
   */
  function animateLatencyCounter() {
    const duration = ARC_FLIGHT_TIME * 0.8; // Counter completes at 80% of flight
    const start = performance.now();

    function update(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(eased * DISTANCE_MILES);
      $statLatency.textContent = value.toLocaleString();
      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }

    requestAnimationFrame(update);
  }

  /**
   * Schedules status overlay text changes to sync with the arc animation.
   * Calls resolve() when the connection is "established."
   */
  function scheduleStatusUpdates(resolve) {
    // At 75%: "Arriving..."
    setTimeout(() => {
      $statPacket.textContent = 'Arriving...';
      $statPacket.classList.add('status-arriving');
    }, ARC_FLIGHT_TIME * ARRIVING_THRESHOLD);

    // At 100%: "Delivered" → then "Connection Established"
    setTimeout(() => {
      $statPacket.textContent = 'Delivered';
      $statPacket.classList.remove('status-arriving');
      $statPacket.classList.add('status-delivered');
    }, ARC_FLIGHT_TIME);

    // Show "Connection Established" overlay
    setTimeout(() => {
      $connectionEstablished.classList.add('visible');
    }, ARC_FLIGHT_TIME + 800);

    // Resolve after CE display
    setTimeout(() => {
      resolve();
    }, ARC_FLIGHT_TIME + 800 + CE_DISPLAY_TIME);
  }

  /* ============================================
     PHASE TRANSITIONS
     ============================================ */

  /**
   * Transitions from landing to globe phase.
   */
  function transitionToGlobe() {
    $landing.classList.remove('active');
    setTimeout(() => {
      $globePhase.classList.add('active');
    }, 400);
  }

  /**
   * Transitions from globe to letter phase.
   * Handles the color palette shift from cyber → romantic.
   */
  function transitionToLetter() {
    // Fade out globe
    $globePhase.classList.remove('active');

    // Switch body to romantic phase (triggers CSS color transitions)
    setTimeout(() => {
      document.body.classList.add('romantic-phase');
    }, 600);

    // Show letter phase
    setTimeout(() => {
      $letterPhase.classList.add('active');
      // Allow scrolling on letter phase
      document.body.style.overflow = 'auto';
      // Start ambient particles
      createAmbientParticles();
      // Start typewriter on first section
      startTypewriter();
      // Start countdown
      startCountdown();
    }, 1200);
  }

  /* ============================================
     LETTER PHASE
     ============================================ */

  /**
   * Creates floating ambient particles for the romantic phase background.
   */
  function createAmbientParticles() {
    const container = document.getElementById('ambient-particles');
    const PARTICLE_COUNT = 25;
    const colors = ['#e8828a', '#f8bbd0', '#ffccbc', '#d4606a'];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const dot = document.createElement('div');
      dot.classList.add('ambient-dot');
      dot.style.left = Math.random() * 100 + '%';
      dot.style.animationDuration = (Math.random() * 15 + 10) + 's';
      dot.style.animationDelay = (Math.random() * 10) + 's';
      dot.style.width = (Math.random() * 4 + 2) + 'px';
      dot.style.height = dot.style.width;
      dot.style.background = colors[Math.floor(Math.random() * colors.length)];
      container.appendChild(dot);
    }
  }

  /**
   * Typewriter effect for ALL paragraphs inside .typewriter-target.
   * Types through each <p> sequentially, moving the cursor between them.
   * Uses innerText to preserve rendered HTML entities (e.g., &mdash;).
   */
  function startTypewriter() {
    const target = document.querySelector('.typewriter-target');
    if (!target) return;

    const paragraphs = Array.from(target.querySelectorAll('p'));
    if (paragraphs.length === 0) return;

    // Store the full text for each paragraph, then clear them all
    const texts = paragraphs.map(p => {
      const text = p.innerText;
      p.textContent = '';
      p.style.display = 'none'; // Hide until it's their turn
      return text;
    });

    // Create the blinking cursor
    const cursor = document.createElement('span');
    cursor.classList.add('typewriter-cursor');

    let pIndex = 0;   // Which paragraph we're typing
    let charIndex = 0; // Which character within that paragraph

    function typeNextParagraph() {
      if (pIndex >= paragraphs.length) {
        // All done — fade out cursor
        setTimeout(() => {
          cursor.style.animation = 'none';
          cursor.style.opacity = '0';
          cursor.style.transition = 'opacity 0.5s ease';
        }, 1500);
        return;
      }

      const p = paragraphs[pIndex];
      const fullText = texts[pIndex];
      charIndex = 0;

      // Show this paragraph and attach cursor
      p.style.display = '';
      p.appendChild(cursor);

      function typeChar() {
        if (charIndex < fullText.length) {
          const textNode = document.createTextNode(fullText[charIndex]);
          p.insertBefore(textNode, cursor);
          charIndex++;
          setTimeout(typeChar, TYPEWRITER_SPEED);
        } else {
          // Paragraph complete — brief pause, then move to next
          pIndex++;
          if (pIndex < paragraphs.length) {
            setTimeout(typeNextParagraph, 400); // Pause between paragraphs
          } else {
            typeNextParagraph(); // Triggers the cursor fade-out
          }
        }
      }

      typeChar();
    }

    // Start after the letter fades in
    setTimeout(typeNextParagraph, 1800);
  }

  /**
   * Countdown timer to Valentine's Day (Feb 14, 2026 midnight EST).
   */
  function startCountdown() {
    // Feb 14, 2026 00:00:00 EST (UTC-5)
    const valentineDate = new Date('2026-02-14T00:00:00-05:00');

    function update() {
      const now = new Date();
      const diff = valentineDate - now;

      if (diff <= 0) {
        $countdown.textContent = "Happy Valentine's Day";
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      const parts = [];
      if (days > 0) parts.push(`${days}d`);
      parts.push(`${String(hours).padStart(2, '0')}h`);
      parts.push(`${String(minutes).padStart(2, '0')}m`);
      parts.push(`${String(seconds).padStart(2, '0')}s`);

      $countdown.textContent = `// Valentine's Day in ${parts.join(' ')}`;
    }

    update();
    setInterval(update, 1000);
  }

  /* ============================================
     THE ASK – Button Interactions
     ============================================ */

  /**
   * Handles the "Accept Transmission" button click:
   * fires confetti, hides buttons, shows final message.
   */
  function handleAccept() {
    // Fire confetti
    if (typeof confetti === 'function') {
      // First burst - center
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.65 },
        colors: ['#e8828a', '#f8bbd0', '#ff6b9d', '#d4606a', '#ffccbc'],
        shapes: ['circle'],
        scalar: 1.2,
        ticks: 200
      });

      // Second burst - left
      setTimeout(() => {
        confetti({
          particleCount: 60,
          angle: 60,
          spread: 55,
          origin: { x: 0.1, y: 0.65 },
          colors: ['#e8828a', '#f8bbd0', '#ff6b9d'],
          scalar: 1.1
        });
      }, 200);

      // Third burst - right
      setTimeout(() => {
        confetti({
          particleCount: 60,
          angle: 120,
          spread: 55,
          origin: { x: 0.9, y: 0.65 },
          colors: ['#e8828a', '#f8bbd0', '#ff6b9d'],
          scalar: 1.1
        });
      }, 400);

      // Heart confetti burst
      setTimeout(() => {
        confetti({
          particleCount: 50,
          spread: 100,
          origin: { y: 0.55 },
          shapes: ['circle'],
          colors: ['#e8828a', '#d4606a', '#ff6b9d'],
          scalar: 1.5,
          ticks: 300
        });
      }, 600);
    }

    // Hide buttons and ask text
    const askSection = document.querySelector('.the-ask');
    askSection.style.transition = 'opacity 0.8s ease';
    askSection.style.opacity = '0';

    setTimeout(() => {
      askSection.style.display = 'none';
      // Show accepted state
      $acceptedState.classList.add('visible');
    }, 800);
  }

  /**
   * Handles the "Retry Connection" button clicks:
   * shakes, dodges, shows error messages, eventually disappears.
   */
  function handleRetry() {
    if (retryCount >= retryMessages.length) return;

    const message = retryMessages[retryCount];

    // Show error message
    $retryError.textContent = message;
    $retryError.classList.add('visible');

    if (retryCount === 0) {
      // First click: shake the button
      $btnRetry.classList.add('shake');
      setTimeout(() => $btnRetry.classList.remove('shake'), 500);
    } else if (retryCount === 1) {
      // Second click: shake + dodge to a random position
      $btnRetry.classList.add('shake');
      setTimeout(() => $btnRetry.classList.remove('shake'), 500);

      setTimeout(() => {
        $btnRetry.classList.add('dodge');
        // Keep dodge range small enough for mobile
        const maxX = Math.min(60, window.innerWidth * 0.1);
        const randomX = (Math.random() - 0.5) * maxX * 2;
        const randomY = -20 - Math.random() * 30;
        $btnRetry.style.transform = `translate(${randomX}px, ${randomY}px)`;
      }, 500);
    } else {
      // Third click: button disappears
      $btnRetry.classList.add('hiding');
      setTimeout(() => {
        $retryError.textContent = '';
        $retryError.classList.remove('visible');
      }, 1500);
    }

    retryCount++;

    // Clear error message after a delay (unless it was the final message)
    if (retryCount < retryMessages.length) {
      setTimeout(() => {
        $retryError.classList.remove('visible');
      }, 2000);
    }
  }

  /* ============================================
     ORCHESTRATION
     ============================================ */

  /**
   * Main entry point. Called on DOMContentLoaded.
   * Sets up initial state and event listeners.
   */
  function init() {
    // Lock body scroll initially
    document.body.style.overflow = 'hidden';

    // Start starfield
    const cleanupStarfield = initStarfield();

    // Animate terminal text
    animateTerminal();

    // "Begin Transmission" button click
    $btnBegin.addEventListener('click', async () => {
      $btnBegin.style.pointerEvents = 'none';
      $btnBegin.style.opacity = '0';
      $btnBegin.style.transition = 'opacity 0.5s ease';

      // Clean up starfield
      if (cleanupStarfield) cleanupStarfield();

      // Transition to globe
      transitionToGlobe();

      // Initialize globe and wait for arc to complete
      await initGlobe();

      // Transition to letter
      transitionToLetter();
    });

    // Button event listeners
    $btnAccept.addEventListener('click', handleAccept);
    $btnRetry.addEventListener('click', handleRetry);
  }

  // Launch when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
