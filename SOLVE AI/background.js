// Background Service Worker for Solve AI

console.log(
  "%c🚀 Solve AI%c - Upgraded Extension Active\nDeveloper Mode",
  "color: #10b981; font-weight: bold; font-size: 14px;",
  "color: #64748b; font-size: 12px;"
);

// API Keys (Enter your keys here as plain text)
const GEMINI_KEYS = [
  ""
];
const GROQ_KEY = "";

function getBuiltInGeminiKeys() {
  return GEMINI_KEYS.join(",");
}

function getBuiltInGroqKey() {
  return GROQ_KEY;
}

// Setup Context Menus on Installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "solve-mcq",
    title: "Solve MCQ with Solve AI",
    contexts: ["selection", "page"]
  });

  chrome.contextMenus.create({
    id: "send-to-chat",
    title: "Send to Solve AI Chat",
    contexts: ["selection"]
  });
});

// Handle Context Menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "solve-mcq") {
    triggerSolveOnTab(tab.id, null);
  } else if (info.menuItemId === "send-to-chat") {
    const selectedText = info.selectionText || "";
    // Save to storage temporary context so the popup can retrieve it
    chrome.storage.local.set({ pendingChatInput: selectedText }, () => {
      // Programmatically open the extension popup if possible
      // In MV3, chrome.action.openPopup() is supported in Edge and Chrome (version 99+)
      if (chrome.action && typeof chrome.action.openPopup === 'function') {
        chrome.action.openPopup();
      } else {
        console.log("openPopup not supported or requires user gesture. Saved to pendingChatInput.");
      }
    });
  }
});

// Handle Keyboard Shortcuts
chrome.commands.onCommand.addListener((command) => {
  if (command === "solve_mcq") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0) return;
      const tab = tabs[0];
      
      // Try to capture screenshot and trigger solve
      try {
        chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 80 }, (dataUrl) => {
          const screenshot = chrome.runtime.lastError ? null : dataUrl;
          triggerSolveOnTab(tab.id, screenshot);
        });
      } catch (e) {
        console.warn("Screenshot capture failed:", e.message);
        triggerSolveOnTab(tab.id, null);
      }
    });
  }
});

// Helper: send solve message to content script, with dynamic injection if not loaded
async function triggerSolveOnTab(tabId, screenshot) {
  function sendMessagePromise() {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, { action: "TRIGGER_SOLVE", screenshot }, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }

  try {
    await sendMessagePromise();
  } catch (e) {
    console.log("Content script not active. Dynamically injecting content.js...");
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      });
      // Wait for content script to mount
      await new Promise(r => setTimeout(r, 200));
      await sendMessagePromise();
    } catch (injectErr) {
      console.error("Failed to inject content script:", injectErr.message);
    }
  }
}

// Timeout helper for fetches
async function fetchWithTimeout(url, options, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') throw new Error(`Request timed out after ${timeoutMs}ms`);
    throw e;
  }
}

// Handle Messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "CAPTURE_SCREENSHOT") {
    const windowId = sender.tab ? sender.tab.windowId : null;
    chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 80 }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ dataUrl: null });
      } else {
        sendResponse({ dataUrl: dataUrl });
      }
    });
    return true; // Keep message channel open
  }

  if (request.action === "OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
    return false;
  }

  if (request.action === "PROCESS_QUESTION") {
    // Process MCQ using AI provider config
    handleMCQSolve(request.payload, request.forceRecheck)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === "CHAT_WITH_AI") {
    // General chat messaging
    handleChat(request.messages)
      .then(result => sendResponse({ success: true, text: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// Cache & History Processing for MCQ
function payloadToHash(payload) {
  let textPart = "";
  let imagePart = "";

  if (payload.text) {
    textPart = payload.text.trim().substring(0, 300).replace(/[^a-zA-Z0-9]/g, '').substring(0, 100);
  }

  if (payload.image && payload.image.length > 500) {
    const len = payload.image.length;
    const mid = Math.floor(len / 2);
    const slice = payload.image.substring(mid, mid + 120).replace(/[^a-zA-Z0-9]/g, '').substring(0, 50);
    imagePart = `img_${len}_${slice}`;
  }

  if (payload.type === "multimodal" && textPart && imagePart) {
    return "mm_" + textPart.substring(0, 60) + "_" + imagePart;
  }
  if (payload.type === "text" && textPart) {
    return "txt_" + textPart;
  }
  if (imagePart) {
    return "img_" + imagePart;
  }
  return "unknown_" + Date.now();
}

async function handleMCQSolve(payload, forceRecheck) {
  const cacheKey = payloadToHash(payload);

  if (!forceRecheck) {
    const cached = await new Promise(r => chrome.storage.local.get([cacheKey], r));
    if (cached && cached[cacheKey]) {
      console.log("Returning cached MCQ result.");
      return cached[cacheKey];
    }
  }

  // Load provider configurations
  const config = await new Promise(r => chrome.storage.local.get({
    aiProvider: "gemini", // "gemini" or "openai"
    geminiKey: "",
    openaiKey: "",
    geminiModel: "gemini-2.5-flash",
    openaiModel: "gpt-4o-mini"
  }, r));

  const systemPrompt = `You are an expert MCQ solver AI with deep knowledge across all academic subjects.
Your task: Analyze the question, options, and any attached images/diagrams carefully, then select the single BEST correct answer.

Rules for high accuracy:
1. Identify the core query. Watch out for negative words (e.g., "NOT", "EXCEPT", "FALSE") and double negatives.
2. Read and analyze ALL options before making any decision.
3. For math, physics, chemistry, or logic: perform step-by-step calculations/reasoning internally before choosing.
4. If the input is a screenshot (image): focus only on the main, prominent MCQ question. Ignore headers, sidebars, ads, and unrelated questions on the screen.
5. Identify the exact question number (e.g., "3" or "Q12") from the text or the screenshot if visible.
6. The "correctOptionText" must be the exact text of the correct option as it appears in the question options.
7. Return ONLY a valid JSON object matching the schema below. No markdown formatting, no preambles.

Required JSON format:
{
  "questionNumber": "3",
  "correctOption": "B",
  "correctOptionText": "except",
  "confidence": 95,
  "title": "5-word topic title",
  "justification": "A concise explanation (50-80 words) showing the exact step-by-step logic, why the correct option is correct, and why other key options are incorrect."
}`;

  let aiResponse = null;

  if (config.aiProvider === "gemini") {
    const geminiKey = config.geminiKey ? config.geminiKey : getBuiltInGeminiKeys();
    try {
      aiResponse = await callGeminiAPI(systemPrompt, payload, config.geminiModel, geminiKey);
    } catch (geminiError) {
      console.warn("Solve AI: Gemini call failed. Trying Groq fallback...", geminiError.message);
      const groqKey = getBuiltInGroqKey();
      aiResponse = await callGroqAPI(systemPrompt, payload, "llama-3.3-70b-versatile", groqKey);
    }
  } else {
    let apiKey = config.openaiKey ? config.openaiKey : getBuiltInGroqKey();
    let model = config.openaiModel;
    if (!config.openaiKey) {
      model = "llama-3.3-70b-versatile";
      aiResponse = await callGroqAPI(systemPrompt, payload, model, apiKey);
    } else if (model.includes("llama") || apiKey.startsWith("gsk_")) {
      aiResponse = await callGroqAPI(systemPrompt, payload, model, apiKey);
    } else {
      aiResponse = await callOpenAIAPI(systemPrompt, payload, model, apiKey);
    }
  }

  // Save to Cache & History
  await saveMCQToHistory(payload, aiResponse, cacheKey);

  return aiResponse;
}

async function saveMCQToHistory(payload, data, cacheKey) {
  const res = await new Promise(r => chrome.storage.local.get({ history: [], sessionCounter: 1 }, r));
  let hist = res.history;
  let counter = res.sessionCounter;

  let existingItem = hist.find(item => item.id === cacheKey);
  let assignedQNumber = existingItem ? existingItem.qNumber : null;

  if (assignedQNumber === null) {
    if (data.questionNumber && !isNaN(parseInt(data.questionNumber))) {
      assignedQNumber = parseInt(data.questionNumber);
    } else {
      let parsedQNumber = null;
      if (payload.text) {
        const match = payload.text.trim().match(/^(?:question\s+|q|q\.)?\s*(\d+)\s*[\.\):-]/i);
        if (match) parsedQNumber = parseInt(match[1], 10);
      }
      assignedQNumber = parsedQNumber !== null ? parsedQNumber : counter;
    }
  }

  if (!existingItem) {
    counter++;
  }

  data.qNumber = assignedQNumber;

  let baseText = "";
  if (data.title) {
    baseText = data.title;
  } else if (payload.text) {
    baseText = payload.text.substring(0, 50).replace(/\n/g, ' ').trim() + "...";
  } else {
    baseText = payload.pageTitle ? `📸 ${payload.pageTitle}` : '📸 Image MCQ';
  }

  const qText = `Q${assignedQNumber} - ${baseText}`;

  // Update history
  hist = hist.filter(item => item.id !== cacheKey);
  hist.unshift({
    id: cacheKey,
    qNumber: assignedQNumber,
    question: qText,
    answer: data.correctOption + (data.correctOptionText ? `: ${data.correctOptionText}` : ''),
    time: Date.now()
  });

  if (hist.length > 30) hist.pop(); // keep last 30

  // Save to storage
  await new Promise(r => chrome.storage.local.set({
    [cacheKey]: data,
    history: hist,
    sessionCounter: counter
  }, r));
}

// Chat integration
async function handleChat(messages) {
  const config = await new Promise(r => chrome.storage.local.get({
    aiProvider: "gemini",
    geminiKey: "",
    openaiKey: "",
    geminiModel: "gemini-2.5-flash",
    openaiModel: "gpt-4o-mini"
  }, r));

  const systemPrompt = `You are Solve AI, a friendly, high-performance programming and academic helper.
You are running in a Chrome/Edge browser extension. Answer the user's questions concisely and with clear code examples where applicable.
Use clean formatting. For code, always use Markdown code blocks and specify the programming language (e.g. \`\`\`javascript ... \`\`\`).`;

  if (config.aiProvider === "gemini") {
    const geminiKey = config.geminiKey ? config.geminiKey : getBuiltInGeminiKeys();
    try {
      return await callGeminiChat(systemPrompt, messages, config.geminiModel, geminiKey);
    } catch (geminiError) {
      console.warn("Solve AI: Gemini chat failed. Trying Groq fallback...", geminiError.message);
      const groqKey = getBuiltInGroqKey();
      return await callGroqChat(systemPrompt, messages, "llama-3.3-70b-versatile", groqKey);
    }
  } else {
    let apiKey = config.openaiKey ? config.openaiKey : getBuiltInGroqKey();
    let model = config.openaiModel;
    if (!config.openaiKey) {
      model = "llama-3.3-70b-versatile";
      return await callGroqChat(systemPrompt, messages, model, apiKey);
    }
    return await callOpenAIChat(systemPrompt, messages, model, apiKey);
  }
}

// Keep track of sequential key rotation indices
let geminiKeyIndex = 0;
let openaiKeyIndex = 0;

// Gemini API Wrapper
async function callGeminiAPI(systemPrompt, payload, modelName, apiKey) {
  const keys = apiKey.split(',').map(k => k.trim()).filter(k => k.length > 0);
  if (keys.length === 0) {
    throw new Error("Google Gemini API key is empty or invalid.");
  }

  const numKeys = keys.length;
  let lastError = null;

  for (let attempt = 0; attempt < numKeys; attempt++) {
    const idx = (geminiKeyIndex + attempt) % numKeys;
    const keyToUse = keys[idx];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${keyToUse}`;

    let parts = [];
    if (payload.type === "text") {
      parts.push({ text: `Question:\n${payload.text}` });
    } else if (payload.type === "image") {
      const base64Image = payload.image.split(',')[1];
      parts.push({ inlineData: { mimeType: "image/jpeg", data: base64Image } });
      parts.push({ text: "Solve the MCQ shown in this image." });
    } else if (payload.type === "multimodal") {
      const base64Image = payload.image.split(',')[1];
      parts.push({ inlineData: { mimeType: "image/jpeg", data: base64Image } });
      parts.push({ text: `Question Context:\n${payload.text}\n\nSolve the MCQ using both the text context and the image.` });
    }

    const body = {
      systemInstruction: { role: "user", parts: [{ text: systemPrompt }] },
      contents: [{ parts: parts }],
      generationConfig: { responseMimeType: "application/json" }
    };

    try {
      console.log(`Solve AI: Trying Gemini key index ${idx + 1} of ${numKeys}...`);
      const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }, 25000);

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }

      const data = await response.json();
      const rawText = data.candidates[0].content.parts[0].text;
      const cleanedText = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsedData = JSON.parse(cleanedText);

      // Save the next index sequentially
      geminiKeyIndex = (idx + 1) % numKeys;
      return parsedData;

    } catch (e) {
      console.warn(`Solve AI: Gemini key ${idx + 1} failed:`, e.message);
      lastError = e;
    }
  }

  throw new Error(`All ${numKeys} Gemini API key(s) failed. Last Error: ${lastError.message}`);
}

// OpenAI API Wrapper
async function callOpenAIAPI(systemPrompt, payload, modelName, apiKey) {
  const keys = apiKey.split(',').map(k => k.trim()).filter(k => k.length > 0);
  if (keys.length === 0) {
    throw new Error("OpenAI API key is empty or invalid.");
  }

  const numKeys = keys.length;
  let lastError = null;

  for (let attempt = 0; attempt < numKeys; attempt++) {
    const idx = (openaiKeyIndex + attempt) % numKeys;
    const keyToUse = keys[idx];
    const url = `https://api.openai.com/v1/chat/completions`;

    let content = [];
    if (payload.type === "text") {
      content.push({ type: "text", text: `Question:\n${payload.text}` });
    } else if (payload.type === "image") {
      content.push({ type: "image_url", image_url: { url: payload.image } });
      content.push({ type: "text", text: "Solve the MCQ shown in this image." });
    } else if (payload.type === "multimodal") {
      content.push({ type: "image_url", image_url: { url: payload.image } });
      content.push({ type: "text", text: `Question Context:\n${payload.text}\n\nSolve the MCQ using both the text context and the image.` });
    }

    const body = {
      model: modelName,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: content }
      ]
    };

    try {
      console.log(`Solve AI: Trying OpenAI key index ${idx + 1} of ${numKeys}...`);
      const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${keyToUse}`
        },
        body: JSON.stringify(body)
      }, 25000);

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }

      const data = await response.json();
      const rawText = data.choices[0].message.content;
      const cleanedText = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsedData = JSON.parse(cleanedText);

      // Save the next index sequentially
      openaiKeyIndex = (idx + 1) % numKeys;
      return parsedData;

    } catch (e) {
      console.warn(`Solve AI: OpenAI key ${idx + 1} failed:`, e.message);
      lastError = e;
    }
  }

  throw new Error(`All ${numKeys} OpenAI API key(s) failed. Last Error: ${lastError.message}`);
}

// Gemini Chat Handler
async function callGeminiChat(systemPrompt, messages, modelName, apiKey) {
  const keys = apiKey.split(',').map(k => k.trim()).filter(k => k.length > 0);
  if (keys.length === 0) {
    throw new Error("Google Gemini API key is empty or invalid.");
  }

  const numKeys = keys.length;
  let lastError = null;

  for (let attempt = 0; attempt < numKeys; attempt++) {
    const idx = (geminiKeyIndex + attempt) % numKeys;
    const keyToUse = keys[idx];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${keyToUse}`;

    const contents = messages.map(msg => {
      return {
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }]
      };
    });

    const body = {
      systemInstruction: { role: "user", parts: [{ text: systemPrompt }] },
      contents: contents
    };

    try {
      console.log(`Solve AI: Chatting with Gemini key index ${idx + 1} of ${numKeys}...`);
      const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }, 25000);

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }

      const data = await response.json();
      const rawText = data.candidates[0].content.parts[0].text;
      
      geminiKeyIndex = (idx + 1) % numKeys;
      return rawText;

    } catch (e) {
      console.warn(`Solve AI: Gemini chat key ${idx + 1} failed:`, e.message);
      lastError = e;
    }
  }

  throw new Error(`All ${numKeys} Gemini API key(s) failed in Chat. Last Error: ${lastError.message}`);
}

// OpenAI Chat Handler
async function callOpenAIChat(systemPrompt, messages, modelName, apiKey) {
  const keys = apiKey.split(',').map(k => k.trim()).filter(k => k.length > 0);
  if (keys.length === 0) {
    throw new Error("OpenAI API key is empty or invalid.");
  }

  const numKeys = keys.length;
  let lastError = null;

  for (let attempt = 0; attempt < numKeys; attempt++) {
    const idx = (openaiKeyIndex + attempt) % numKeys;
    const keyToUse = keys[idx];
    const url = `https://api.openai.com/v1/chat/completions`;

    const formattedMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map(msg => ({ role: msg.role, content: msg.content }))
    ];

    const body = {
      model: modelName,
      messages: formattedMessages
    };

    try {
      console.log(`Solve AI: Chatting with OpenAI key index ${idx + 1} of ${numKeys}...`);
      const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${keyToUse}`
        },
        body: JSON.stringify(body)
      }, 25000);

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }

      const data = await response.json();
      const rawText = data.choices[0].message.content;

      openaiKeyIndex = (idx + 1) % numKeys;
      return rawText;

    } catch (e) {
      console.warn(`Solve AI: OpenAI chat key ${idx + 1} failed:`, e.message);
      lastError = e;
    }
  }

  throw new Error(`All ${numKeys} OpenAI API key(s) failed in Chat. Last Error: ${lastError.message}`);
}

// Groq API Wrapper
async function callGroqAPI(systemPrompt, payload, modelName, apiKey) {
  const url = "https://api.groq.com/openai/v1/chat/completions";
  
  let content = [];
  if (payload.type === "text") {
    content.push({ type: "text", text: `Question:\n${payload.text}` });
  } else if (payload.type === "image") {
    content.push({ type: "image_url", image_url: { url: payload.image } });
    content.push({ type: "text", text: "Solve the MCQ shown in this image." });
  } else if (payload.type === "multimodal") {
    content.push({ type: "image_url", image_url: { url: payload.image } });
    content.push({ type: "text", text: `Question Context:\n${payload.text}\n\nSolve the MCQ using both the text context and the image.` });
  }

  const body = {
    model: modelName || "llama-3.3-70b-versatile",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: content }
    ]
  };

  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  }, 25000);

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error HTTP ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const rawText = data.choices[0].message.content;
  const cleanedText = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleanedText);
}

// Groq Chat Handler
async function callGroqChat(systemPrompt, messages, modelName, apiKey) {
  const url = "https://api.groq.com/openai/v1/chat/completions";

  const formattedMessages = [
    { role: "system", content: systemPrompt },
    ...messages.map(msg => ({ role: msg.role, content: msg.content }))
  ];

  const body = {
    model: modelName || "llama-3.3-70b-versatile",
    messages: formattedMessages
  };

  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  }, 25000);

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq Chat error HTTP ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}
