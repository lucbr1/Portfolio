// Features for individual screens (portfolio pages inside the console iframe)
function getPageSteps() {
    const inlineJson = document.querySelector('script[type="application/json"][data-role="steps"]');

    if (inlineJson) {
        try {
            const parsed = JSON.parse(inlineJson.textContent || '');
            if (Array.isArray(parsed)) return parsed;
        } catch (err) {
            console.warn('Impossible de parser les steps de la page', err);
        }
    }

    if (Array.isArray(window.pageSteps)) {
        return window.pageSteps;
    }

    return null;
}

const headerTemplate = document.createElement('template');
headerTemplate.innerHTML = `
<header class="site-header">
    <nav>
        <img src="../Resources/Name.webp" alt="Photo profil" class="describe-image" data-description="" />
        <div class="nav-links">
            <button class="nav-btn" type="button" data-url="profile.html">Profile</button>
            <button class="nav-btn nav-btn-secondary" type="button" data-url="log.html">Logout</button>
        </div>
    </nav>
</header>`;

function initStepSlider() {
    const steps = getPageSteps();
    const slider = document.querySelector('.step-slider');

    if (!steps || !steps.length || !slider) return;

    const titleEl = document.querySelector('.step-title');
    const descriptionEl = document.querySelector('.step-description');
    const imgEl = document.querySelector('.step-img');
    const prevBtn = document.querySelector('.step-arrow-left');
    const nextBtn = document.querySelector('.step-arrow-right');

    if (!titleEl || !descriptionEl || !prevBtn || !nextBtn || !imgEl) return;

    let currentStep = 0;

    function renderStep() {
        const current = steps[currentStep];
        // Allow inline HTML (e.g. <strong>) in step content controlled by the page JSON
        titleEl.innerHTML = current.title || '';
        descriptionEl.innerHTML = current.description || '';

        if (current.img) {
            imgEl.style.backgroundImage = `url(${current.img})`;
            imgEl.setAttribute('aria-label', current.imgDescription || `Illustration ${current.title || ''}`);

            // Adapt container ratio to the image natural size to avoid forced square crops
            const probe = new Image();
            probe.onload = function() {
                if (this.naturalWidth && this.naturalHeight) {
                    const maxW = window.innerWidth * 0.95;
                    const maxH = window.innerHeight * 0.92;
                    const scale = Math.min(maxW / this.naturalWidth, maxH / this.naturalHeight, 1);
                    imgEl.style.aspectRatio = `${this.naturalWidth} / ${this.naturalHeight}`;
                    imgEl.style.setProperty('--zoom-width', `${this.naturalWidth * scale}px`);
                    imgEl.style.setProperty('--zoom-height', `${this.naturalHeight * scale}px`);
                }
            };
            probe.src = current.img;
        } else {
            imgEl.style.backgroundImage = '';
            imgEl.removeAttribute('aria-label');
            imgEl.style.removeProperty('aspect-ratio');
            imgEl.style.removeProperty('--zoom-width');
            imgEl.style.removeProperty('--zoom-height');
        }

        imgEl.dataset.description = current.imgDescription || '';
    }

    prevBtn.addEventListener('click', function() {
        currentStep = (currentStep - 1 + steps.length) % steps.length;
        renderStep();
    });

    nextBtn.addEventListener('click', function() {
        currentStep = (currentStep + 1) % steps.length;
        renderStep();
    });

    renderStep();
}

function injectHeaderTemplate() {
    const placeholders = document.querySelectorAll('[data-include="site-header"]');
    if (!placeholders.length) return;

    placeholders.forEach(placeholder => {
        const clone = headerTemplate.content.cloneNode(true);
        const img = clone.querySelector('img');
        if (img) {
            // Resolve profile image relative to project root, not the current page depth
            const path = window.location.pathname;
            const idx = path.toLowerCase().lastIndexOf('/screens/');
            const root = idx >= 0 ? path.slice(0, idx) : path.slice(0, path.lastIndexOf('/'));
            img.src = `${root}/Resources/Name.webp`;

            const navButtons = clone.querySelectorAll('.nav-btn[data-url]');
            navButtons.forEach(btn => {
                const target = btn.getAttribute('data-url');
                if (!target) return;

                const normalized = target.replace(/^\/?screens\//i, '');
                btn.setAttribute('data-url', `${root}/Screens/${normalized}`);
            });
        }
        placeholder.replaceWith(clone);
    });
}

function initializeNavButtons(scope = document) {
    const buttons = scope.querySelectorAll('.nav-btn[data-url]');
    buttons.forEach(button => {
        if (button.dataset.navBound === 'true') return;
        button.dataset.navBound = 'true';

        button.addEventListener('click', () => {
            const target = button.getAttribute('data-url');
            if (target) {
                notifyParentLoading('screen-loading-start');
                window.location.href = target;
            }
        });
    });
}

function initCard() {
    const cards = document.querySelectorAll('.card[data-target]');
    if (!cards.length) return;

    cards.forEach(card => {
        const go = () => {
            const target = card.dataset.target;
            if (target) {
                notifyParentLoading('screen-loading-start');
                window.location.href = target;
            }
        };

        card.addEventListener('click', go);
    });
}

function initZoomables() {
    const zoomables = document.querySelectorAll('.step-img, .zoomable');
    if (!zoomables.length) return;

    const originalPlacement = new Map();

    function extractBackgroundUrl(el) {
        const bg = window.getComputedStyle(el).backgroundImage;
        const match = bg && bg.match(/url\(["']?(.*?)["']?\)/i);
        return match ? match[1] : null;
    }

    function setZoomDimensions(el) {
        const url = extractBackgroundUrl(el);
        if (!url) return;

        const probe = new Image();
        probe.onload = function() {
            if (!this.naturalWidth || !this.naturalHeight) return;
            const maxW = window.innerWidth * 0.95;
            const maxH = window.innerHeight * 0.92;
            const scale = Math.min(maxW / this.naturalWidth, maxH / this.naturalHeight, 1);
            el.style.setProperty('--zoom-width', `${this.naturalWidth * scale}px`);
            el.style.setProperty('--zoom-height', `${this.naturalHeight * scale}px`);
            el.style.aspectRatio = `${this.naturalWidth} / ${this.naturalHeight}`;
        };
        probe.src = url;
    }

    function activateZoom(img) {
        if (originalPlacement.has(img)) return;

        const placeholder = document.createElement('div');
        const rect = img.getBoundingClientRect();
        placeholder.className = 'zoom-placeholder';
        placeholder.style.height = `${rect.height}px`;
        placeholder.style.width = `${rect.width}px`;
        placeholder.setAttribute('aria-hidden', 'true');

        originalPlacement.set(img, {
            parent: img.parentNode,
            nextSibling: img.nextElementSibling,
            placeholder
        });

        img.parentNode.replaceChild(placeholder, img);
        document.body.appendChild(img);
        img.classList.add('zoomed');
        document.body.classList.add('zoom-active');
    }

    function restoreImage(img) {
        const placement = originalPlacement.get(img);
        if (placement && placement.parent) {
            if (placement.placeholder && placement.placeholder.parentNode) {
                placement.placeholder.replaceWith(img);
            } else if (placement.nextSibling && placement.nextSibling.parentNode === placement.parent) {
                placement.parent.insertBefore(img, placement.nextSibling);
            } else {
                placement.parent.appendChild(img);
            }
        }
        img.classList.remove('zoomed');
        if (placement?.placeholder && placement.placeholder.parentNode) {
            placement.placeholder.remove();
        }
        originalPlacement.delete(img);
        if (!document.querySelector('.zoomed')) {
            document.body.classList.remove('zoom-active');
        }
    }

    function closeAllZooms() {
        const zoomed = document.querySelectorAll('.zoomed');
        zoomed.forEach(el => restoreImage(el));
    }

    zoomables.forEach(img => {
        setZoomDimensions(img);

        img.addEventListener('click', function(e) {
            e.stopPropagation();
            if (this.classList.contains('zoomed')) {
                restoreImage(this);
            } else {
                activateZoom(this);
            }
        });
    });

    document.addEventListener('click', function(e) {
        if (!e.target.closest('.step-img')) {
            closeAllZooms();
        }
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeAllZooms();
        }
    });
}

function initConsoleMessageBridge() {
    window.addEventListener('message', function(event) {
        const data = event?.data;
        if (!data || typeof data !== 'object') return;

        if (data.type === 'dpad-scroll') {
            const amount = 280;
            const delta = data.direction === 'up' ? -amount : amount;
            window.scrollBy({ top: delta, left: 0, behavior: 'smooth' });
        }

        if (data.type === 'dpad-step') {
            if (data.direction === 'prev') {
                document.querySelector('.step-arrow-left')?.click();
            } else if (data.direction === 'next') {
                document.querySelector('.step-arrow-right')?.click();
            }
        }

        if (data.type === 'abxy-nav') {
            const target = document.querySelector(data.selector);
            if (!target) return;
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
}

function initScreenFeatures() {
    injectHeaderTemplate();
    initializeNavButtons();
    initStepSlider();
    initZoomables();
    initConsoleMessageBridge();
    initCard();
}

document.addEventListener('DOMContentLoaded', () => {
    initScreenFeatures();
    notifyParentLoading('screen-loading-end');
});

function notifyParentLoading(type) {
    if (!type) return;
    try {
        window.parent?.postMessage({ type }, '*');
    } catch (err) {
        console.warn('Impossible de notifier le parent', err);
    }
}
