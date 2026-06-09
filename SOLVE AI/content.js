// Isolated Content Script for Solve AI

if (typeof window.solveAiInitialized === 'undefined') {
  window.solveAiInitialized = true;
  console.log("Solve AI: Content script active.");

  // Listener for messages from background
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "TRIGGER_SOLVE") {
      chrome.storage.local.get({ isActive: true }, (res) => {
        if (!res.isActive) {
          console.log("Solve AI is OFF. Ignoring trigger.");
          sendResponse({ success: false });
          return;
        }
        extractAndSolve(false, false, request.screenshot || null);
        sendResponse({ success: true });
      });
      return true;
    }
  });

  // Clean up overlays when extension is toggled OFF
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.isActive && changes.isActive.newValue === false) {
      const container = document.getElementById('solve-ai-overlay-container');
      if (container) container.remove();
      const loader = document.getElementById('solve-ai-loader');
      if (loader) loader.remove();
    }
  });

  // Check context validity
  function isContextValid() {
    try {
      if (chrome && chrome.runtime && chrome.runtime.id) return true;
    } catch (e) {}
    console.warn("Solve AI: Extension context invalid.");
    return false;
  }

  // Active anti-cheat bypass in isolated world
  chrome.storage.local.get({ isActive: true, antiCheatBypass: true }, (res) => {
    if (res.isActive && res.antiCheatBypass) {
      enableIsolatedBypass();
    }
  });

  let lastPayload = null;
  let lastObservedQuestionText = null;

  // Auto-hiding popup when DOM changes and question changes
  function startQuestionObserver() {
    let debounceTimeout = null;
    const observer = new MutationObserver(() => {
      if (debounceTimeout) clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        if (!lastObservedQuestionText) return;
        const currentDomText = parseDOMForMCQ();
        if (!currentDomText) return;

        if (currentDomText.trim() !== lastObservedQuestionText.trim()) {
          console.log("Solve AI: Question text change detected! Auto-hiding popup.");
          const container = document.getElementById('solve-ai-overlay-container');
          if (container) container.remove();
          lastObservedQuestionText = null;
        }
      }, 500);
    });

    const targetNode = document.body || document.documentElement;
    if (targetNode) {
      observer.observe(targetNode, { childList: true, subtree: true, characterData: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startQuestionObserver);
  } else {
    startQuestionObserver();
  }

  // Extract page content and request AI resolution
  async function extractAndSolve(forceRecheck = false, silentIfFail = false, providedScreenshot = null) {
    if (!isContextValid()) return;

    // Load settings
    const settings = await new Promise(resolve => {
      chrome.storage.local.get({
        disclaimerShown: false,
        stealthMode: false
      }, resolve);
    });

    if (!settings.disclaimerShown) {
      showDisclaimer(settings.stealthMode, () => {
        extractAndSolve(forceRecheck, silentIfFail, providedScreenshot);
      });
      return;
    }

    const oldContainer = document.getElementById('solve-ai-overlay-container');
    if (oldContainer) oldContainer.remove();

    showLoader(settings.stealthMode);

    // Get selected text or parse DOM
    let selectedText = window.getSelection().toString().trim();
    let domText = null;

    if (selectedText.length > 8) {
      console.log("Solve AI: Using user selected text.");
      domText = selectedText;
    } else {
      const extracted = parseDOMForMCQ();
      if (extracted) {
        console.log("Solve AI: Extracted question from page DOM.");
        domText = extracted;
      }
    }

    // Capture screenshot if needed (only fallback if screenshot not pre-provided)
    let screenshotData = providedScreenshot;
    if (!screenshotData) {
      screenshotData = await captureScreenshot();
    }

    let payload = null;
    const pageTitle = document.title.substring(0, 50) || "Exam Page";
    const pageUrl = window.location.href;

    if (domText && screenshotData) {
      payload = { text: domText, image: screenshotData, type: "multimodal", pageTitle, pageUrl };
    } else if (domText) {
      payload = { text: domText, type: "text", pageTitle, pageUrl };
    } else if (screenshotData) {
      payload = { image: screenshotData, type: "image", pageTitle, pageUrl };
    }

    if (payload) {
      lastPayload = payload;
      await processPayload(payload, settings.stealthMode, forceRecheck);
    } else {
      removeLoader();
      if (!silentIfFail) {
        showError("Could not extract any question from this page. Try selecting the question text manually first.", settings.stealthMode);
      }
    }
  }

  async function processPayload(payload, isStealth, forceRecheck) {
    if (!isContextValid()) return;
    showLoader(isStealth);

    try {
      chrome.runtime.sendMessage({
        action: "PROCESS_QUESTION",
        payload: payload,
        forceRecheck: forceRecheck
      }, (response) => {
        removeLoader();
        if (chrome.runtime.lastError) {
          showError("Connection to extension lost. Please refresh the page.", isStealth);
          return;
        }

        if (response && response.success) {
          lastObservedQuestionText = payload.text || parseDOMForMCQ() || "";
          showResultOverlay(response.data, isStealth);
        } else {
          showError(response?.error || "AI failed to process the question.", isStealth);
        }
      });
    } catch (e) {
      removeLoader();
      showError("Solve AI encountered a runtime error. Refresh page to fix.", isStealth);
    }
  }

  // Isolated event listener bypass to ensure right click / select / copy-paste is always enabled
  function enableIsolatedBypass() {
    const stopper = (e) => e.stopPropagation();
    document.addEventListener('contextmenu', stopper, true);
    document.addEventListener('copy', stopper, true);
    document.addEventListener('cut', stopper, true);
    document.addEventListener('paste', stopper, true);
    document.addEventListener('keydown', stopper, true);
    document.addEventListener('selectstart', stopper, true);

    // Append stylesheet to force allow user selection
    if (!document.getElementById('solve-ai-selection-style')) {
      const style = document.createElement('style');
      style.id = 'solve-ai-selection-style';
      style.innerHTML = `
        * {
          user-select: auto !important;
          -webkit-user-select: auto !important;
          -moz-user-select: auto !important;
          -ms-user-select: auto !important;
        }
      `;
      (document.head || document.documentElement).appendChild(style);
    }
  }

  // Parse page structure for MCQs
  function parseDOMForMCQ() {
    function isElementVisible(el) {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0;
    }

    const questionSelectors = [
      '.question', '.qtext', '.QuestionText', '.quiz-question', '.test-question',
      '[class*="question" i]', '[id*="question" i]', 'h1', 'h2', 'h3'
    ];
    let questionEl = null;
    for (let sel of questionSelectors) {
      try {
        const elements = document.querySelectorAll(sel);
        questionEl = Array.from(elements).find(el => {
          const text = (el.innerText || el.textContent || '').trim();
          return isElementVisible(el) && text.length > 8 && !/question\s+\d+\s+of/i.test(text) && !/^\d+$/.test(text);
        });
        if (questionEl) break;
      } catch (e) {}
    }

    const optionSelectors = [
      '.options', '.answers', '.mcq-options', '.choices', '.answers-container',
      '[class*="option" i]', '[class*="answer" i]', '[id*="option" i]', '[id*="answer" i]'
    ];
    let optionsEl = null;
    for (let sel of optionSelectors) {
      try {
        const elements = document.querySelectorAll(sel);
        optionsEl = Array.from(elements).find(el => isElementVisible(el) && el !== questionEl && (el.innerText || el.textContent || '').trim().length > 4);
        if (optionsEl) break;
      } catch (e) {}
    }

    const qText = questionEl ? (questionEl.innerText || questionEl.textContent || '').trim() : '';
    if (qText.length > 5) {
      const optText = optionsEl ? (optionsEl.innerText || optionsEl.textContent || '').trim() : '';
      return qText + "\n\n" + optText;
    }

    // Heuristic: Search for elements with radio / checkboxes
    const inputs = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"]')).filter(isElementVisible);
    if (inputs.length > 0) {
      let container = null;
      for (let input of inputs) {
        const parent = input.closest('fieldset') || input.closest('form') || input.closest('.question-container') || input.parentElement.parentElement;
        if (parent && isElementVisible(parent)) {
          container = parent;
          break;
        }
      }
      if (container) {
        const clone = container.cloneNode(true);
        const trash = clone.querySelectorAll('.warning, .alert, button, header, script, style');
        trash.forEach(t => t.remove());
        return clone.innerText.replace(/\n+/g, '\n').trim();
      }
    }
    return null;
  }

  function captureScreenshot() {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ action: "CAPTURE_SCREENSHOT" }, (response) => {
          if (chrome.runtime.lastError || !response || !response.dataUrl) {
            resolve(null);
          } else {
            resolve(response.dataUrl);
          }
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  // Loader overlay
  function showLoader(isStealth) {
    let loader = document.getElementById('solve-ai-loader');
    if (!loader) {
      loader = document.createElement('div');
      loader.id = 'solve-ai-loader';

      // Inject keyframes
      if (!document.getElementById('solve-ai-anim-style')) {
        const style = document.createElement('style');
        style.id = 'solve-ai-anim-style';
        style.innerText = `
          @keyframes sa-pulse {
            0% { transform: scale(1); opacity: 0.8; }
            50% { transform: scale(1.15); opacity: 0.4; }
            100% { transform: scale(1); opacity: 0.8; }
          }
          @keyframes sa-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `;
        document.head.appendChild(style);
      }

      if (isStealth) {
        // Stealth loader: tiny status dot on bottom-right
        loader.style.cssText = `
          position: fixed; bottom: 12px; right: 12px;
          width: 10px; height: 10px;
          background-color: #10b981;
          border-radius: 50%;
          z-index: 2147483647;
          animation: sa-pulse 1s infinite;
          pointer-events: none;
        `;
      } else {
        // Premium loader ring
        loader.style.cssText = `
          position: fixed; bottom: 24px; right: 24px;
          width: 44px; height: 44px;
          border-radius: 50%;
          border: 3px solid rgba(16, 185, 129, 0.2);
          border-top-color: #10b981;
          z-index: 2147483647;
          animation: sa-spin 0.8s linear infinite;
        `;
      }
      document.body.appendChild(loader);
    }
  }

  function removeLoader() {
    const loader = document.getElementById('solve-ai-loader');
    if (loader) loader.remove();
  }

  // Floating Result Overlay
  function showResultOverlay(data, isStealth) {
    let container = document.getElementById('solve-ai-overlay-container');
    if (container) container.remove();

    container = document.createElement('div');
    container.id = 'solve-ai-overlay-container';
    container.style.cssText = 'position:fixed; top:24px; right:24px; z-index:2147483647; transition: opacity 0.2s;';

    const shadow = container.attachShadow({ mode: 'closed' });

    const confidence = Number(data.confidence) || 0;
    let badgeColor = '#ef4444'; // Red
    if (confidence >= 80) badgeColor = '#10b981'; // Emerald Green
    else if (confidence >= 60) badgeColor = '#f59e0b'; // Amber

    const popupWidth = isStealth ? '210px' : '270px';
    const popupOpacity = isStealth ? '0.25' : '1';

    const css = `
      :host {
        /* Default Light/White Mode */
        --sa-bg: ${isStealth ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.98)'};
        --sa-border: rgba(0, 0, 0, 0.08);
        --sa-color: #1e293b;
        --sa-title-color: #64748b;
        --sa-btn-sec-border: rgba(0, 0, 0, 0.08);
        --sa-btn-sec-hover: rgba(0, 0, 0, 0.04);
        --sa-explain-bg: rgba(0, 0, 0, 0.03);
        --sa-explain-color: #334155;
        --sa-explain-border: rgba(0, 0, 0, 0.04);
        --sa-shadow: 0 10px 25px rgba(0, 0, 0, 0.12);
        --sa-link-color: #0284c7;
      }


      .sa-card {
        font-family: 'Inter', system-ui, sans-serif;
        width: ${popupWidth};
        background: var(--sa-bg);
        backdrop-filter: blur(12px);
        border: 1px solid var(--sa-border);
        border-radius: 12px;
        box-shadow: var(--sa-shadow);
        color: var(--sa-color);
        overflow: hidden;
        font-size: 12px;
        transition: opacity 0.2s, background-color 0.2s;
        opacity: ${popupOpacity};
      }
      .sa-card:hover {
        opacity: 1;
        background: var(--sa-bg);
      }
      .sa-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        border-bottom: 1px solid var(--sa-border);
        cursor: grab;
        user-select: none;
      }
      .sa-header:active {
        cursor: grabbing;
      }
      .sa-title {
        font-weight: 600;
        font-size: 12px;
        color: var(--sa-title-color);
        display: flex;
        align-items: center;
        gap: 5px;
      }
      .sa-btn-close {
        background: none;
        border: none;
        color: var(--sa-title-color);
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
        padding: 2px;
      }
      .sa-btn-close:hover {
        color: var(--sa-color);
      }
      .sa-body {
        padding: 12px;
      }
      .sa-answer {
        font-size: 16px;
        font-weight: 700;
        color: #10b981;
        text-align: center;
        margin-bottom: 4px;
        word-wrap: break-word;
      }
      .sa-option-text {
        font-size: 11.5px;
        font-weight: 500;
        color: var(--sa-link-color);
        margin-top: 3px;
        text-align: center;
      }
      .sa-meta {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 6px;
        margin-bottom: 10px;
      }
      .sa-badge {
        font-size: 10px;
        font-weight: 600;
        padding: 2px 6px;
        border-radius: 12px;
        background: ${badgeColor}15;
        color: ${badgeColor};
      }
      .sa-qnum {
        font-size: 10px;
        color: var(--sa-title-color);
        font-weight: 500;
      }
      .sa-btn-action {
        width: 100%;
        padding: 6px 10px;
        background: linear-gradient(135deg, #10b981, #059669);
        border: none;
        border-radius: 6px;
        color: white;
        font-weight: 600;
        font-size: 11px;
        cursor: pointer;
        margin-top: 8px;
        transition: transform 0.1s;
      }
      .sa-btn-action:hover {
        filter: brightness(1.1);
      }
      .sa-btn-action:active {
        transform: scale(0.98);
      }
      .sa-btn-secondary {
        background: none;
        border: 1px solid var(--sa-btn-sec-border);
        color: var(--sa-title-color);
        padding: 2px 6px;
        border-radius: 5px;
        font-size: 9.5px;
        cursor: pointer;
      }
      .sa-btn-secondary:hover {
        background: var(--sa-btn-sec-hover);
        color: var(--sa-color);
      }
      .sa-details {
        margin-top: 8px;
      }
      .sa-details summary {
        font-size: 11px;
        font-weight: 500;
        color: var(--sa-link-color);
        cursor: pointer;
        outline: none;
      }
      .sa-explanation {
        margin-top: 4px;
        font-size: 11px;
        line-height: 1.45;
        color: var(--sa-explain-color);
        background: var(--sa-explain-bg);
        padding: 6px 8px;
        border-radius: 5px;
        max-height: 110px;
        overflow-y: auto;
        border: 1px solid var(--sa-explain-border);
      }
      .sa-link-settings {
        display: block;
        text-align: center;
        font-size: 9.5px;
        color: var(--sa-title-color);
        margin-top: 8px;
        text-decoration: underline;
        cursor: pointer;
      }
      .sa-link-settings:hover {
        color: var(--sa-link-color);
      }
    `;

    const html = `
      <style>${css}</style>
      <div class="sa-card">
        <div class="sa-header" id="sa-drag">
          <div class="sa-title">${isStealth ? '≡' : '✨ Solve AI'}</div>
          <button class="sa-btn-close" id="sa-close">×</button>
        </div>
        <div class="sa-body">
          <div class="sa-answer">
            Option ${data.correctOption}
            ${data.correctOptionText ? `<div class="sa-option-text">${data.correctOptionText}</div>` : ''}
          </div>
          <div class="sa-meta">
            <span class="sa-badge">Confidence: ${confidence}%</span>
            ${data.qNumber ? `<span class="sa-qnum">Question ${data.qNumber}</span>` : ''}
            <button class="sa-btn-secondary" id="sa-recheck">Recheck</button>
          </div>
          <button class="sa-btn-action" id="sa-new">🔍 Check Current Question</button>
          
          <details class="sa-details">
            <summary>Explanation</summary>
            <div class="sa-explanation">
              ${data.justification || 'No explanation provided.'}
            </div>
          </details>

          <a class="sa-link-settings" id="sa-settings">Settings</a>
        </div>
      </div>
    `;

    shadow.innerHTML = html;
    document.body.appendChild(container);

    // Draggable Implementation
    const dragHandle = shadow.getElementById('sa-drag');
    let isDragging = false;
    let startX, startY, origX, origY;

    dragHandle.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = container.getBoundingClientRect();
      origX = rect.left;
      origY = rect.top;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      container.style.left = `${origX + dx}px`;
      container.style.top = `${origY + dy}px`;
      container.style.right = 'auto';
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });

    // Button interactions
    shadow.getElementById('sa-close').addEventListener('click', () => container.remove());
    shadow.getElementById('sa-recheck').addEventListener('click', () => {
      container.remove();
      if (lastPayload) {
        processPayload(lastPayload, isStealth, true);
      } else {
        extractAndSolve(true);
      }
    });
    shadow.getElementById('sa-new').addEventListener('click', () => {
      container.remove();
      extractAndSolve(false);
    });
    shadow.getElementById('sa-settings').addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: "OPEN_OPTIONS" });
    });
  }

  // Disclaimer popup for first-time use
  function showDisclaimer(isStealth, onAgree) {
    let container = document.getElementById('solve-ai-overlay-container');
    if (container) container.remove();

    container = document.createElement('div');
    container.id = 'solve-ai-overlay-container';
    container.style.cssText = 'position:fixed; top:24px; right:24px; z-index:2147483647;';

    const shadow = container.attachShadow({ mode: 'closed' });

    const css = `
      .sa-card {
        font-family: 'Inter', system-ui, sans-serif;
        width: 300px;
        background: #1c1c23;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.4);
        color: #e2e8f0;
        padding: 16px;
        font-size: 13px;
      }
      .sa-title {
        font-weight: 700;
        font-size: 15px;
        margin-bottom: 8px;
        color: #f1f5f9;
      }
      .sa-desc {
        line-height: 1.5;
        color: #94a3b8;
        margin-bottom: 14px;
      }
      .sa-btn {
        width: 100%;
        padding: 8px 12px;
        background: #10b981;
        border: none;
        border-radius: 6px;
        color: white;
        font-weight: 600;
        cursor: pointer;
      }
      .sa-btn:hover {
        background: #059669;
      }
    `;

    const html = `
      <style>${css}</style>
      <div class="sa-card">
        <div class="sa-title">Educational Disclaimer</div>
        <div class="sa-desc">
          Solve AI offers learning explanations for educational purposes. Please use it responsibly to verify concepts. By clicking agree, you acknowledge these conditions.
        </div>
        <button class="sa-btn" id="sa-agree">I Agree & Continue</button>
      </div>
    `;

    shadow.innerHTML = html;
    document.body.appendChild(container);

    shadow.getElementById('sa-agree').addEventListener('click', () => {
      chrome.storage.local.set({ disclaimerShown: true }, () => {
        container.remove();
        onAgree();
      });
    });
  }

  // Harmless error indicators
  function showError(msg, isStealth) {
    let container = document.getElementById('solve-ai-overlay-container');
    if (container) container.remove();

    container = document.createElement('div');
    container.id = 'solve-ai-overlay-container';
    container.style.cssText = isStealth
      ? 'position:fixed; bottom:12px; right:12px; z-index:2147483647;'
      : 'position:fixed; top:24px; right:24px; z-index:2147483647;';

    const shadow = container.attachShadow({ mode: 'closed' });

    const displayTitle = isStealth
      ? "Network Latency Alert"
      : "⚠️ Solve AI Error";

    const displayMsg = isStealth
      ? "Connection response delayed. Try checking connection or click retry."
      : msg;

    const css = `
      :host {
        /* Default Light/White Mode */
        --sa-err-bg: ${isStealth ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.98)'};
        --sa-err-border: ${isStealth ? 'rgba(0, 0, 0, 0.04)' : 'rgba(239, 68, 68, 0.2)'};
        --sa-err-color: ${isStealth ? '#475569' : '#1e293b'};
        --sa-err-title: ${isStealth ? '#64748b' : '#ef4444'};
        --sa-err-btn-bg: ${isStealth ? 'rgba(0, 0, 0, 0.04)' : '#f1f5f9'};
        --sa-err-btn-color: ${isStealth ? '#475569' : '#475569'};
        --sa-err-btn-primary: ${isStealth ? 'rgba(0, 0, 0, 0.06)' : '#ef4444'};
        --sa-err-btn-primary-color: ${isStealth ? '#475569' : 'white'};
      }

      @media (prefers-color-scheme: dark) {
        :host {
          /* Dark Mode Override */
          --sa-err-bg: ${isStealth ? 'rgba(28, 28, 35, 0.25)' : 'rgba(28, 28, 35, 0.96)'};
          --sa-err-border: ${isStealth ? 'rgba(255, 255, 255, 0.04)' : 'rgba(239, 68, 68, 0.2)'};
          --sa-err-color: ${isStealth ? '#94a3b8' : '#e2e8f0'};
          --sa-err-title: ${isStealth ? '#64748b' : '#ef4444'};
          --sa-err-btn-bg: ${isStealth ? 'rgba(255, 255, 255, 0.05)' : '#334155'};
          --sa-err-btn-color: ${isStealth ? '#cbd5e1' : '#cbd5e1'};
          --sa-err-btn-primary: ${isStealth ? 'rgba(255, 255, 255, 0.08)' : '#ef4444'};
          --sa-err-btn-primary-color: ${isStealth ? '#cbd5e1' : 'white'};
        }
      }

      .sa-err {
        font-family: 'Inter', system-ui, sans-serif;
        width: ${isStealth ? '165px' : '300px'};
        background: var(--sa-err-bg);
        backdrop-filter: blur(8px);
        border: 1px solid var(--sa-err-border);
        border-radius: 10px;
        padding: ${isStealth ? '8px 10px' : '14px'};
        color: var(--sa-err-color);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
        transition: opacity 0.2s;
        opacity: ${isStealth ? '0.22' : '1'};
      }
      .sa-err:hover {
        opacity: 1;
        background: var(--sa-err-bg);
      }
      .sa-title {
        font-weight: 700;
        color: var(--sa-err-title);
        margin-bottom: 4px;
        font-size: ${isStealth ? '10px' : '13px'};
      }
      .sa-msg {
        font-size: ${isStealth ? '9.5px' : '11.5px'};
        line-height: 1.4;
        color: var(--sa-err-color);
        margin-bottom: ${isStealth ? '6px' : '10px'};
      }
      .sa-row {
        display: flex;
        gap: 6px;
      }
      .sa-btn {
        flex: 1;
        padding: ${isStealth ? '3px' : '5px'};
        font-size: ${isStealth ? '9px' : '11px'};
        font-weight: 600;
        border-radius: 4px;
        cursor: pointer;
        border: none;
        background: var(--sa-err-btn-bg);
        color: var(--sa-err-btn-color);
        text-align: center;
      }
      .sa-btn-primary {
        background: var(--sa-err-btn-primary);
        color: var(--sa-err-btn-primary-color);
      }
      .sa-btn:hover {
        filter: brightness(1.1);
      }
    `;

    const html = `
      <style>${css}</style>
      <div class="sa-err">
        <div class="sa-title">${displayTitle}</div>
        <div class="sa-msg">${displayMsg}</div>
        <div class="sa-row">
          <button class="sa-btn" id="sa-err-close">Close</button>
          <button class="sa-btn sa-btn-primary" id="sa-err-retry">Retry</button>
        </div>
      </div>
    `;

    shadow.innerHTML = html;
    document.body.appendChild(container);

    shadow.getElementById('sa-err-close').addEventListener('click', () => container.remove());
    shadow.getElementById('sa-err-retry').addEventListener('click', () => {
      container.remove();
      if (lastPayload) {
        processPayload(lastPayload, isStealth, true);
      } else {
        extractAndSolve(true);
      }
    });
  }
}
