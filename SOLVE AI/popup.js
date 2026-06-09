// Solve AI Popup JavaScript

document.addEventListener('DOMContentLoaded', () => {
  // Navigation elements
  const tabs = document.querySelectorAll('.nav-tab');
  const tabContents = document.querySelectorAll('.tab-content');

  // Main controls
  const extensionToggle = document.getElementById('extensionToggle');
  const quickSolveBtn = document.getElementById('quickSolveBtn');
  const solverResultView = document.getElementById('solverResultView');

  // Chat elements
  const chatInput = document.getElementById('chatInput');
  const sendChatBtn = document.getElementById('sendChatBtn');
  const chatMessages = document.getElementById('chatMessages');

  // History elements
  const historyListContainer = document.getElementById('historyListContainer');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');

  // Settings elements
  const aiProviderSelect = document.getElementById('aiProviderSelect');
  const geminiConfigGroup = document.getElementById('geminiConfigGroup');
  const openaiConfigGroup = document.getElementById('openaiConfigGroup');
  
  const geminiKeyInput = document.getElementById('geminiKeyInput');
  const geminiModelSelect = document.getElementById('geminiModelSelect');
  const openaiKeyInput = document.getElementById('openaiKeyInput');
  const openaiModelSelect = document.getElementById('openaiModelSelect');
  
  const stealthModeCheckbox = document.getElementById('stealthModeCheckbox');
  const bypassCheckbox = document.getElementById('bypassCheckbox');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const saveStatusMsg = document.getElementById('saveStatusMsg');

  // Stateful variables
  let chatThread = [
    { role: "assistant", content: "Hi! I am your Solve AI assistant. How can I help you today? Feel free to ask programming questions, fix errors, or request text rewrites." }
  ];

  // 1. Tab Navigation Logic
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');
      
      // Deactivate all tabs & contents
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      // Activate clicked
      tab.classList.add('active');
      document.getElementById(targetTab).classList.add('active');
      
      // Special focus/loading if needed
      if (targetTab === 'tabChat') {
        chatInput.focus();
        scrollChatToBottom();
      } else if (targetTab === 'tabHistory') {
        loadHistoryList();
      }
    });
  });

  // 2. Load Initial Configuration Settings
  chrome.storage.local.get({
    isActive: true,
    aiProvider: "gemini",
    geminiKey: "",
    openaiKey: "",
    geminiModel: "gemini-2.5-flash",
    openaiModel: "gpt-4o-mini",
    stealthMode: true,
    antiCheatBypass: true
  }, (config) => {
    // Set Toggle state
    extensionToggle.checked = config.isActive;
    updateSolveButtonState(config.isActive);

    // Set settings inputs
    aiProviderSelect.value = config.aiProvider;
    toggleProviderGroups(config.aiProvider);
    
    geminiKeyInput.value = config.geminiKey;
    geminiModelSelect.value = config.geminiModel;
    openaiKeyInput.value = config.openaiKey;
    openaiModelSelect.value = config.openaiModel;
    
    stealthModeCheckbox.checked = config.stealthMode;
    bypassCheckbox.checked = config.antiCheatBypass;

    // Load last result on solver view
    loadLastSolvedMCQ();
    
    // Check for pending chat input (sent via Context Menu)
    checkForPendingChatInput();
  });

  // Toggle settings providers group on select change
  aiProviderSelect.addEventListener('change', (e) => {
    toggleProviderGroups(e.target.value);
  });

  function toggleProviderGroups(provider) {
    if (provider === 'gemini') {
      geminiConfigGroup.classList.remove('hidden');
      openaiConfigGroup.classList.add('hidden');
    } else {
      geminiConfigGroup.classList.add('hidden');
      openaiConfigGroup.classList.remove('hidden');
    }
  }

  // 3. Save Configuration Settings
  saveSettingsBtn.addEventListener('click', () => {
    const aiProvider = aiProviderSelect.value;
    const geminiKey = geminiKeyInput.value.trim();
    const geminiModel = geminiModelSelect.value;
    const openaiKey = openaiKeyInput.value.trim();
    const openaiModel = openaiModelSelect.value;
    const stealthMode = stealthModeCheckbox.checked;
    const antiCheatBypass = bypassCheckbox.checked;

    chrome.storage.local.set({
      aiProvider,
      geminiKey,
      geminiModel,
      openaiKey,
      openaiModel,
      stealthMode,
      antiCheatBypass
    }, () => {
      saveStatusMsg.classList.remove('hidden');
      setTimeout(() => {
        saveStatusMsg.classList.add('hidden');
      }, 2000);
    });
  });

  // 4. Handle Extension Activation Toggle
  extensionToggle.addEventListener('change', (e) => {
    const isActive = e.target.checked;
    chrome.storage.local.set({ isActive }, () => {
      updateSolveButtonState(isActive);
    });
  });

  function updateSolveButtonState(isActive) {
    quickSolveBtn.disabled = !isActive;
    if (isActive) {
      quickSolveBtn.textContent = "Solve Current Page Question";
    } else {
      quickSolveBtn.textContent = "Extension is OFF";
    }
  }

  // 5. Trigger Page MCQ Solving
  quickSolveBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabsList) => {
      if (!tabsList || tabsList.length === 0) return;
      const activeTab = tabsList[0];
      const tabId = activeTab.id;

      function sendMessage() {
        return new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(tabId, { action: "TRIGGER_SOLVE" }, (res) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(res);
            }
          });
        });
      }

      try {
        await sendMessage();
      } catch (err) {
        console.warn("Content script missing. Injecting dynamic content.js...");
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
          });
          // Wait briefly
          await new Promise(r => setTimeout(r, 250));
          await sendMessage();
        } catch (injectErr) {
          alert("⚠️ Restricted URL. Cannot run extension on this page.");
          return;
        }
      }

      // Close popup only after initiating the process successfully
      window.close();
    });
  });

  // 6. Renders Last Solved Question
  function loadLastSolvedMCQ() {
    chrome.storage.local.get({ history: [] }, (res) => {
      const hist = res.history;
      if (hist && hist.length > 0) {
        // Fetch full cached details of first item
        const lastItem = hist[0];
        chrome.storage.local.get([lastItem.id], (detailsRes) => {
          const details = detailsRes[lastItem.id];
          if (details) {
            renderLastResult(details);
          }
        });
      }
    });
  }

  function renderLastResult(data) {
    const confidence = Number(data.confidence) || 0;
    
    solverResultView.innerHTML = `
      <div class="active-result-card">
        <div class="result-option-bubble">
          Option ${data.correctOption}
        </div>
        ${data.correctOptionText ? `<div class="result-text-match">${escapeHtml(data.correctOptionText)}</div>` : ''}
        <div class="result-meta-row">
          <span class="result-confidence-badge">Confidence: ${confidence}%</span>
          <span class="result-model-badge">Question ${data.qNumber || 1}</span>
        </div>
        <div class="result-explanation-box">
          <strong>Explanation:</strong><br/>
          ${escapeHtml(data.justification || 'No justification offered.')}
        </div>
      </div>
    `;
  }

  // 7. Chat Assistant Logic
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      triggerChatSendMessage();
    }
  });

  // Textarea auto-grow
  chatInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
  });

  sendChatBtn.addEventListener('click', triggerChatSendMessage);

  function triggerChatSendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    // Reset height
    chatInput.value = '';
    chatInput.style.height = 'auto';

    // Add User Bubble
    appendChatBubble("user", text);
    chatThread.push({ role: "user", content: text });

    // Enable typing indicator / disable inputs
    setChatLoading(true);
    scrollChatToBottom();

    // Call background
    chrome.runtime.sendMessage({
      action: "CHAT_WITH_AI",
      messages: chatThread.slice(-15) // Keep last 15 messages context limit
    }, (res) => {
      setChatLoading(false);
      if (chrome.runtime.lastError || !res || !res.success) {
        const errorMsg = res?.error || "Unable to reach the AI server. Check your network or API keys.";
        appendChatBubble("assistant error-bubble", "⚠️ Error: " + errorMsg);
        // Remove last user request from thread history so they can retry
        chatThread.pop();
      } else {
        appendChatBubble("assistant", res.text);
        chatThread.push({ role: "assistant", content: res.text });
      }
      scrollChatToBottom();
    });
  }

  function appendChatBubble(role, content) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${role}`;
    
    // Simple formatter for markdown code blocks in assistant response
    if (role === 'assistant') {
      bubble.innerHTML = formatMarkdown(content);
    } else {
      bubble.textContent = content;
    }
    
    chatMessages.appendChild(bubble);
  }

  function setChatLoading(loading) {
    if (loading) {
      chatInput.disabled = true;
      sendChatBtn.disabled = true;
      
      const typingIndicator = document.createElement('div');
      typingIndicator.id = 'typingIndicator';
      typingIndicator.className = 'chat-bubble assistant typing';
      typingIndicator.innerHTML = '<span style="opacity:0.6">Solve AI is typing...</span>';
      chatMessages.appendChild(typingIndicator);
    } else {
      chatInput.disabled = false;
      sendChatBtn.disabled = false;
      const indicator = document.getElementById('typingIndicator');
      if (indicator) indicator.remove();
      chatInput.focus();
    }
  }

  function scrollChatToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Check context-menu pending input
  function checkForPendingChatInput() {
    chrome.storage.local.get(['pendingChatInput'], (res) => {
      if (res.pendingChatInput) {
        // Move to Assistant Tab
        tabSolverBtn.classList.remove('active');
        document.getElementById('tabSolver').classList.remove('active');
        
        tabChatBtn.classList.add('active');
        document.getElementById('tabChat').classList.add('active');
        
        // Populate and clear
        chatInput.value = res.pendingChatInput;
        chatInput.focus();
        chatInput.style.height = (chatInput.scrollHeight) + 'px';
        chrome.storage.local.remove('pendingChatInput');
      }
    });
  }

  // 8. History Tab Logic
  function loadHistoryList() {
    chrome.storage.local.get({ history: [] }, (res) => {
      const hist = res.history;
      if (!hist || hist.length === 0) {
        historyListContainer.innerHTML = `
          <div class="empty-history">No history found yet. Solve some questions to build log!</div>
        `;
        return;
      }

      historyListContainer.innerHTML = hist.map(item => `
        <div class="history-item">
          <div class="history-time">${new Date(item.time).toLocaleTimeString()} - ${new Date(item.time).toLocaleDateString()}</div>
          <div class="history-question" title="${escapeHtml(item.question)}">${escapeHtml(item.question)}</div>
          <div class="history-answer">Solved: ${escapeHtml(item.answer)}</div>
        </div>
      `).join('');
    });
  }

  clearHistoryBtn.addEventListener('click', () => {
    if (confirm("Clear all solved question records & history logs?")) {
      chrome.storage.local.set({ history: [], sessionCounter: 1 }, () => {
        loadHistoryList();
        // Reset default solver view
        solverResultView.innerHTML = `
          <div class="welcome-guide">
            <h3>👋 Getting Started with Solve AI</h3>
            <ul class="guide-steps">
              <li>Make sure the main extension toggle is <strong>ON</strong> (green).</li>
              <li>Go to the <strong>Settings tab ⚙️</strong> and add your <strong>API Key</strong>.</li>
              <li>Open your test or study page, and click <strong>Solve</strong> above or press <strong>Ctrl+Shift+Q</strong>.</li>
            </ul>
          </div>
        `;
      });
    }
  });

  // Markdown block formatting helper
  function formatMarkdown(text) {
    let formatted = escapeHtml(text);
    
    // Match code blocks: ```lang ... ```
    const codeBlockRegex = /```(?:[a-zA-Z0-9]+)?\n([\s\S]*?)```/g;
    formatted = formatted.replace(codeBlockRegex, (match, code) => {
      return `<pre><code>${code.trim()}</code></pre>`;
    });

    // Inline code blocks: `code`
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Replace linebreaks with <br/> (except inside pre blocks which is handled by pre tag formatting)
    // We do simple line breaks formatting
    return formatted.replace(/\n/g, '<br/>');
  }

  // HTML escape helper
  function escapeHtml(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

});
