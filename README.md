# Solve AI - Browser Extension

**Solve AI** is a premium, feature-rich browser extension engineered to assist students, researchers, and developers. It provides intelligent MCQ extraction, step-by-step reasoning solutions, a built-in assistant chat panel, and tab stability controls.

---

## 🚀 Core Features


### 1. Heuristic MCQ & Context Parser

* **Smart DOM Extraction**: Analyzes page elements, fieldsets, and forms to detect question text and options dynamically using visual structure heuristics.

* **Form Radio/Checkbox Mapping**: Follows radio button and checkbox positioning to accurately group option labels with their corresponding questions.

* **Multimodal Visual Fallback**: If text extraction is disabled or fails, the extension automatically captures a secure screenshot of the active tab region to parse the question visually.


### 2. Multi-Provider AI Engine with Smart Rotation

* **Provider Support**: Seamlessly switch between Google Gemini, OpenAI, and Groq.

* **Key Rotation**: Enter multiple API keys separated by commas. The background service worker sequentially rotates through the keys to distribute traffic and bypass rate-limiting constraints.

* **Automated Fallback**: If Gemini fails (due to quota limits or service issues), the engine automatically falls back to Groq / Llama models to return an answer without interruption.


### 3. Stealth UI & Floating Overlay

* **Minimalist Loader**: A non-intrusive bottom-right status pulse indicating background processing.

* **Draggable Overlay Card**: Displays correct options, confidence level, and dropdown justifications. It can be dragged anywhere on the screen.

* **Smart Opacity & Mouse Hover Control**: Stealth mode drops the overlay opacity to 25% to blend into the webpage. Hovering over it restores full visibility. It auto-closes after 3 seconds of inactivity but pauses the countdown when the cursor is hovered.


### 4. Tab Focus & Page Visibility Stabilizer

* **Visibility State Neutralizer**: Overrides `Document.prototype.visibilityState` and `document.hidden` to always report the page as active and visible.

* **Focus Stabilization**: Intercepts `Document.prototype.hasFocus` to return `true` to the page at all times.

* **Event Tracker Neutralizer**: Blocks document and window-level listener registrations for `blur`, `focus`, `visibilitychange`, and `mouseleave` events, keeping background execution stable without tracking interference.


### 5. Built-in Study Assistant Chat Panel

* **Context-Aware Side Chat**: Open the extension popup to ask general questions, seek coding help, or request detailed explanations.

* **Quick Send**: Highlight text on any website, right-click, and select "Send to Solve AI Chat" to automatically feed the text into the chat panel.


### 6. Local Storage Caching & History

* **Automatic Caching**: Stores parsed question structures and resolved solutions to prevent double-charging API tokens on identical questions.

* **History Log**: Keeps a running log of the last 30 solved questions for quick lookup and revision.

---

## 🛠️ Configuration & Installation


### Installation Steps

1. Open your browser and go to the extension management panel:
   - **Chrome**: `chrome://extensions/`
   - **Edge**: `edge://extensions/`

2. Enable **Developer Mode** (toggle on).

3. Click **Load unpacked** and select the `SOLVE AI` directory from this repository.

4. Pin **Solve AI** to your browser toolbar.


### API Key Configuration

API keys are configured safely via the Options UI:

1. Right-click the **Solve AI** extension icon on your browser toolbar and click **Options** (or click the Settings gear icon inside the popup).

2. Select your AI Provider (Gemini, OpenAI, or Groq).

3. Input your API keys:
   - **Single Key**: Paste your key directly.
   - **Multiple Keys (Load Balancing)**: Enter multiple keys separated by commas (e.g., `key_1, key_2, key_3`). The system will automatically rotate them.

4. Click **Save Configuration**.

---

## ⌨️ Keyboard Shortcuts

* **Solve Active MCQ**: Press `Ctrl + Shift + Q` (or `Cmd + Shift + Q` on macOS) to instantly capture the tab context and trigger the AI solver.

---

## 🔒 Security & Privacy

* **Secure Direct Connections**: The extension makes HTTPS calls directly to official API servers (Google Gemini, OpenAI, and Groq). No intermediary third-party servers are used.

* **Local Storage Isolation**: Keys and history are stored locally in the browser sandbox (`chrome.storage.local`), keeping your credentials secure.

---

## 🏷️ Credits

### **POWERED BY PROJECT EXTENSION DEVELOPED BY ANKUSH**