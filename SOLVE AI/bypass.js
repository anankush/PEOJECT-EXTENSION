(function() {
  // Prevent multiple injections
  if (window.__solveAiBypassActive) return;
  window.__solveAiBypassActive = true;

  console.log("Solve AI: Neutralizing anti-cheat scripts (MAIN World active)...");

  // 1. Override visibilityState and hidden properties on Document prototype
  const mockVisibility = {
    get() { return 'visible'; },
    set(val) {}
  };
  const mockHidden = {
    get() { return false; },
    set(val) {}
  };

  try {
    Object.defineProperty(Document.prototype, 'visibilityState', mockVisibility);
    Object.defineProperty(Document.prototype, 'hidden', mockHidden);
  } catch (e) {}

  try {
    Object.defineProperty(HTMLDocument.prototype, 'visibilityState', mockVisibility);
    Object.defineProperty(HTMLDocument.prototype, 'hidden', mockHidden);
  } catch (e) {}

  // 2. Mock hasFocus to always return true
  const origHasFocus = Document.prototype.hasFocus;
  Document.prototype.hasFocus = function() { return true; };
  try {
    Object.defineProperty(Document.prototype.hasFocus, 'name', { value: 'hasFocus' });
  } catch(e) {}
  
  const hasFocusToString = origHasFocus ? origHasFocus.toString() : 'function hasFocus() { [native code] }';
  Document.prototype.hasFocus.toString = function() { return hasFocusToString; };

  // 3. Override EventTarget.prototype.addEventListener to block tracking event listeners
  const origAddEventListener = EventTarget.prototype.addEventListener;
  const newAddEventListener = function(type, listener, options) {
    const lowerType = String(type).toLowerCase();
    const isWindowOrDoc = (this === window || this === document || this === document.documentElement || this === document.body);
    if (lowerType === 'visibilitychange' || lowerType === 'webkitvisibilitychange' || 
        (isWindowOrDoc && (lowerType === 'blur' || lowerType === 'focus' || lowerType === 'mouseleave'))) {
      // Silently block the registration of these events
      return;
    }
    return origAddEventListener.apply(this, arguments);
  };
  
  const addEventListenerToString = origAddEventListener.toString();
  newAddEventListener.toString = function() { return addEventListenerToString; };
  EventTarget.prototype.addEventListener = newAddEventListener;

  // 4. Block onblur, onfocus, onvisibilitychange and onmouseleave property assignments
  const nullSetter = {
    get() { return null; },
    set(val) {}
  };

  try {
    Object.defineProperty(window, 'onblur', nullSetter);
    Object.defineProperty(window, 'onfocus', nullSetter);
    Object.defineProperty(document, 'onvisibilitychange', nullSetter);
    Object.defineProperty(document, 'onmouseleave', nullSetter);
  } catch(e) {}
  
})();
