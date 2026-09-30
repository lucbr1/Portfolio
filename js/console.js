// Console shell interactions (outside the iframe)
function initConsoleShell() {
    const consoleRoot = document.querySelector('.console');
    if (!consoleRoot) return;

    // Orientation locking is available only in specific browser contexts.
    try {
        if (screen.orientation?.lock) {
            screen.orientation.lock('landscape').catch(() => {});
        }
    } catch (err) {
        // CSS portrait guidance remains the fallback.
    }

    // Pages dézoomées dans l'écran en paysage mobile : l'iframe garde une taille
    // "virtuelle" (ex. 1024px de large) puis est réduite pour tenir dans l'écran.
    const compactMode = window.matchMedia('(max-width: 1100px) and (orientation: landscape)');

    function fitScreenContent() {
        const frame = consoleRoot.querySelector('.screen iframe');
        const box = consoleRoot.querySelector('.screen');
        if (!frame || !box) return;

        if (!compactMode.matches) {
            frame.classList.remove('is-scaled');
            frame.style.width = '';
            frame.style.height = '';
            frame.style.transform = '';
            return;
        }

        const virtualWidth = parseFloat(getComputedStyle(box).getPropertyValue('--screen-virtual-width')) || 1024;
        const availW = box.clientWidth;
        const availH = box.clientHeight;
        if (!availW || !availH) return;

        const scale = availW / virtualWidth;
        frame.classList.add('is-scaled');
        frame.style.width = virtualWidth + 'px';
        frame.style.height = (availH / scale) + 'px';
        frame.style.transform = `scale(${scale})`;
    }

    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(fitScreenContent).observe(consoleRoot.querySelector('.screen'));
    }
    window.addEventListener('resize', fitScreenContent);
    window.addEventListener('orientationchange', fitScreenContent);
    fitScreenContent();

    // Aide des touches (bouton "?" visible en paysage mobile)
    const helpToggle = consoleRoot.querySelector('.help-toggle');
    const helpPanel = consoleRoot.querySelector('.help-panel');
    const helpClose = consoleRoot.querySelector('.help-close');

    function setHelpOpen(open) {
        if (!helpPanel || !helpToggle) return;
        helpPanel.classList.toggle('is-open', open);
        helpToggle.setAttribute('aria-expanded', String(open));
        helpToggle.setAttribute('aria-label', open ? "Masquer l'aide des touches" : "Afficher l'aide des touches");
    }

    helpToggle?.addEventListener('click', () => {
        setHelpOpen(!helpPanel.classList.contains('is-open'));
    });
    helpClose?.addEventListener('click', () => setHelpOpen(false));
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') setHelpOpen(false);
    });
    // Un appui sur la coque de la console (hors panneau et bouton) referme aussi l'aide
    consoleRoot.addEventListener('pointerdown', event => {
        if (!helpPanel?.classList.contains('is-open')) return;
        if (event.target.closest('.help-panel, .help-toggle')) return;
        setHelpOpen(false);
    });

    const powerBtn = consoleRoot.querySelector('.power-btn');
    const screen = consoleRoot.querySelector('.screen');
    const homeBtn = consoleRoot.querySelector('.home-btn');
    const dpadUp = consoleRoot.querySelector('.dpad .up');
    const dpadRight = consoleRoot.querySelector('.dpad .right');
    const dpadDown = consoleRoot.querySelector('.dpad .down');
    const dpadLeft = consoleRoot.querySelector('.dpad .left');
    const screenFrame = screen?.querySelector('iframe');
    const btnA = consoleRoot.querySelector('.abxy .a');
    const btnB = consoleRoot.querySelector('.abxy .b');
    const btnX = consoleRoot.querySelector('.abxy .x');
    const btnY = consoleRoot.querySelector('.abxy .y');
    const sticks = consoleRoot.querySelectorAll('.stick');
    const leftStick = sticks[0];
    const rightStick = sticks[1];
    let isPoweredOn = false;
    let fadeTimer = null;
    let fadeStartedAt = 0;
    const MIN_FADE_MS = 600;

    function startFade() {
        if (!screenFrame || !isPoweredOn) return;
        if (fadeTimer) {
            clearTimeout(fadeTimer);
            fadeTimer = null;
        }
        fadeStartedAt = performance.now();
        const prevTransition = screenFrame.style.transition;
        screenFrame.style.transition = 'none';
        screenFrame.classList.add('is-loading');
        screenFrame.getBoundingClientRect();
        screenFrame.style.transition = prevTransition || 'opacity 0.35s ease';
    }

    function endFade() {
        if (!screenFrame) return;
        const elapsed = performance.now() - fadeStartedAt;
        const remaining = Math.max(0, MIN_FADE_MS - elapsed);
        if (fadeTimer) {
            clearTimeout(fadeTimer);
        }
        fadeTimer = setTimeout(() => {
            screenFrame.classList.remove('is-loading');
            fadeTimer = null;
        }, remaining);
    }

    function updateScreenState() {
        if (!screen || !powerBtn) return;
        if (isPoweredOn) {
            screen.classList.remove('screen-off');
            powerBtn.classList.remove('off');
            powerBtn.setAttribute('aria-pressed', 'false');
        } else {
            screen.classList.add('screen-off');
            powerBtn.classList.add('off');
            powerBtn.setAttribute('aria-pressed', 'true');
            cleanupFade();
        }
    }

    powerBtn?.addEventListener('click', function() {
        isPoweredOn = !isPoweredOn;
        updateScreenState();
    });

    homeBtn?.addEventListener('click', function() {
        const target = homeBtn.getAttribute('data-url');
        if (!screenFrame || !target || !isPoweredOn) return;
        startFade();
        screenFrame.setAttribute('src', target);
    });

    function postToScreen(payload) {
        if (!isPoweredOn || !screenFrame?.contentWindow) return;
        screenFrame.contentWindow.postMessage(payload, '*');
    }

    function scrollScreen(direction) {
        postToScreen({ type: 'dpad-scroll', direction });
    }

    function triggerSlider(direction) {
        postToScreen({ type: 'dpad-step', direction });
    }

    function attachPadInteraction(element, handler) {
        if (!element) return;
        element.addEventListener('pointerdown', () => {
            element.classList.add('pressed');
        });
        element.addEventListener('pointerup', () => {
            element.classList.remove('pressed');
        });
        element.addEventListener('pointerleave', () => {
            element.classList.remove('pressed');
        });
        element.addEventListener('click', handler);
    }

    function attachAnalogStick(element, onDirection) {
        if (!element || typeof onDirection !== 'function') return;

        // Build a thumb element so we can show the tilt
        let thumb = element.querySelector('.stick-thumb');
        if (!thumb) {
            thumb = document.createElement('span');
            thumb.className = 'stick-thumb';
            element.appendChild(thumb);
        }

        // Seuils proportionnels à la taille réelle du stick (qui varie selon l'écran)
        const DEADZONE_RATIO = 0.14;
        const MAX_OFFSET_RATIO = 0.3;
        const REPEAT_MS = 260;    // how often we repeat while held

        let pointerId = null;
        let activeDir = null;
        let repeatTimer = null;

        function resetThumb() {
            thumb.style.transform = 'translate(-50%, -50%)';
            element.classList.remove('is-active');
            activeDir = null;
            if (repeatTimer) {
                clearInterval(repeatTimer);
                repeatTimer = null;
            }
        }

        function setDirection(direction) {
            if (direction === activeDir) return;
            activeDir = direction;
            if (repeatTimer) {
                clearInterval(repeatTimer);
                repeatTimer = null;
            }
            if (direction) {
                onDirection(direction);
                repeatTimer = setInterval(() => onDirection(direction), REPEAT_MS);
            }
        }

        function updateFromPointer(event) {
            const rect = element.getBoundingClientRect();
            let dx = event.clientX - (rect.left + rect.width / 2);
            let dy = event.clientY - (rect.top + rect.height / 2);
            const distance = Math.hypot(dx, dy);
            const MAX_OFFSET = rect.width * MAX_OFFSET_RATIO;
            const DEADZONE = rect.width * DEADZONE_RATIO;
            const capped = Math.min(distance, MAX_OFFSET);

            if (distance > 0) {
                const ratio = capped / distance;
                dx *= ratio;
                dy *= ratio;
            }

            thumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

            let direction = null;
            if (capped > DEADZONE) {
                if (Math.abs(dx) > Math.abs(dy)) {
                    direction = dx > 0 ? 'right' : 'left';
                } else {
                    direction = dy > 0 ? 'down' : 'up';
                }
            }

            setDirection(direction);
        }

        function release(event) {
            if (event && pointerId !== null && event.pointerId !== pointerId) return;
            if (pointerId !== null) {
                try {
                    element.releasePointerCapture(pointerId);
                } catch (err) {
                    // ignore if capture was already lost
                }
            }
            pointerId = null;
            resetThumb();
        }

        element.addEventListener('pointerdown', event => {
            pointerId = event.pointerId;
            element.classList.add('is-active');
            element.setPointerCapture(pointerId);
            updateFromPointer(event);
        });

        element.addEventListener('pointermove', event => {
            if (event.pointerId !== pointerId) return;
            updateFromPointer(event);
        });

        element.addEventListener('pointerup', release);
        element.addEventListener('pointercancel', release);
        element.addEventListener('lostpointercapture', release);

        resetThumb();
    }

    attachPadInteraction(dpadUp, () => scrollScreen('up'));
    attachPadInteraction(dpadDown, () => scrollScreen('down'));
    attachPadInteraction(dpadLeft, () => triggerSlider('prev'));
    attachPadInteraction(dpadRight, () => triggerSlider('next'));

    // Left stick: only vertical scroll
    attachAnalogStick(leftStick, direction => {
        if (direction === 'up' || direction === 'down') {
            scrollScreen(direction);
        }
    });

    // Right stick: only horizontal slider step
    attachAnalogStick(rightStick, direction => {
        if (direction === 'left') {
            triggerSlider('prev');
        } else if (direction === 'right') {
            triggerSlider('next');
        }
    });

    function navigateToSection(selector) {
        postToScreen({ type: 'abxy-nav', selector });
    }

    attachPadInteraction(btnA, () => navigateToSection('#section-demo'));
    attachPadInteraction(btnB, () => navigateToSection('#section-contexte'));
    attachPadInteraction(btnX, () => navigateToSection('#section-missions'));
    attachPadInteraction(btnY, () => navigateToSection('#section-conclusion'));

    window.addEventListener('message', function(event) {
        const data = event?.data;
        if (!data || typeof data !== 'object') return;

        if (data.type === 'screen-loading-start') {
            startFade();
        }

        if (data.type === 'screen-loading-end') {
            endFade();
        }
    });

    screenFrame?.addEventListener('load', endFade);

    function cleanupFade() {
        if (fadeTimer) {
            clearTimeout(fadeTimer);
            fadeTimer = null;
        }
        screenFrame?.classList.remove('is-loading');
    }

    updateScreenState();
}

document.addEventListener('DOMContentLoaded', initConsoleShell);