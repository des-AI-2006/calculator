/**
 * Nexus Calc - Modern Glassmorphic Calculator Engine
 * Handles arithmetic logic, history, keyboard shortcuts, themes, and audio synthesis.
 */

class NexusCalculator {
  constructor() {
    // Calculator State
    this.previousOperand = '';
    this.currentOperand = '0';
    this.operation = undefined;
    this.shouldResetScreen = false;
    this.history = JSON.parse(localStorage.getItem('nexus_calc_history') || '[]');
    this.soundEnabled = localStorage.getItem('nexus_calc_sound') !== 'false';
    this.theme = localStorage.getItem('nexus_calc_theme') || 'dark';

    // Audio Context for tactile feedback
    this.audioCtx = null;

    // DOM Elements
    this.initDOMElements();

    // Initialize Systems
    this.applyTheme(this.theme);
    this.updateSoundIcon();
    this.renderHistory();
    this.updateDisplay();
    this.bindEvents();
  }

  initDOMElements() {
    this.prevOperandText = document.getElementById('previousOperand');
    this.currOperandText = document.getElementById('currentOperand');
    this.themeToggleBtn = document.getElementById('themeToggleBtn');
    this.soundToggleBtn = document.getElementById('soundToggleBtn');
    this.historyToggleBtn = document.getElementById('historyToggleBtn');
    this.historyDrawer = document.getElementById('historyDrawer');
    this.closeHistoryBtn = document.getElementById('closeHistoryBtn');
    this.clearHistoryBtn = document.getElementById('clearHistoryBtn');
    this.historyList = document.getElementById('historyList');
    this.historyEmpty = document.getElementById('historyEmpty');
    this.historyBadge = document.getElementById('historyBadge');
    this.copyResultBtn = document.getElementById('copyResultBtn');
    this.toastContainer = document.getElementById('toastContainer');
    this.keypad = document.querySelector('.keypad-grid');
    this.sunIcon = document.querySelector('.sun-icon');
    this.moonIcon = document.querySelector('.moon-icon');
    this.soundOnIcon = document.querySelector('.sound-on-icon');
    this.soundOffIcon = document.querySelector('.sound-off-icon');
  }

  /* ==========================================================================
     Arithmetic & State Operations
     ========================================================================== */

  clear() {
    this.currentOperand = '0';
    this.previousOperand = '';
    this.operation = undefined;
    this.shouldResetScreen = false;
    this.clearActiveOperatorHighlight();
    this.playTone('clear');
  }

  delete() {
    if (this.shouldResetScreen) {
      this.currentOperand = '0';
      this.shouldResetScreen = false;
      return;
    }
    if (this.currentOperand === 'Error' || this.currentOperand === 'Cannot divide by 0') {
      this.clear();
      return;
    }
    if (this.currentOperand.length <= 1 || (this.currentOperand.length === 2 && this.currentOperand.startsWith('-'))) {
      this.currentOperand = '0';
    } else {
      this.currentOperand = this.currentOperand.toString().slice(0, -1);
    }
    this.playTone('click');
  }

  appendNumber(number) {
    if (this.currentOperand === 'Error' || this.currentOperand === 'Cannot divide by 0') {
      this.currentOperand = '0';
      this.shouldResetScreen = false;
    }

    if (this.shouldResetScreen) {
      this.currentOperand = '';
      this.shouldResetScreen = false;
    }

    if (number === '.' && this.currentOperand.includes('.')) return;
    if (number === '.' && this.currentOperand === '') {
      this.currentOperand = '0.';
      this.playTone('click');
      return;
    }

    // Limit maximum input characters to prevent overflow
    if (this.currentOperand.replace(/[^0-9]/g, '').length >= 15) return;

    if (this.currentOperand === '0' && number !== '.') {
      this.currentOperand = number.toString();
    } else {
      this.currentOperand = this.currentOperand.toString() + number.toString();
    }
    this.playTone('click');
  }

  chooseOperation(operator) {
    if (this.currentOperand === 'Error' || this.currentOperand === 'Cannot divide by 0') {
      return;
    }

    if (this.currentOperand === '' && this.previousOperand !== '') {
      // Just changing the operator
      this.operation = operator;
      this.highlightActiveOperator(operator);
      this.playTone('operator');
      return;
    }

    if (this.previousOperand !== '') {
      this.compute(false);
    }

    this.operation = operator;
    this.previousOperand = this.currentOperand;
    this.currentOperand = '';
    this.highlightActiveOperator(operator);
    this.playTone('operator');
  }

  compute(isEqualsAction = true) {
    let computation;
    const prev = parseFloat(this.previousOperand);
    const current = parseFloat(this.currentOperand);

    if (isNaN(prev) || isNaN(current)) return;

    switch (this.operation) {
      case '+':
        computation = prev + current;
        break;
      case '−':
      case '-':
        computation = prev - current;
        break;
      case '×':
      case '*':
        computation = prev * current;
        break;
      case '÷':
      case '/':
        if (current === 0) {
          this.currentOperand = 'Cannot divide by 0';
          this.previousOperand = '';
          this.operation = undefined;
          this.shouldResetScreen = true;
          this.clearActiveOperatorHighlight();
          this.playTone('error');
          return;
        }
        computation = prev / current;
        break;
      default:
        return;
    }

    // Fix floating point precision (e.g., 0.1 + 0.2)
    computation = this.sanitizePrecision(computation);

    if (isEqualsAction) {
      const expression = `${this.formatDisplayNumber(this.previousOperand)} ${this.operation} ${this.formatDisplayNumber(this.currentOperand)}`;
      this.saveHistory(expression, computation.toString());
      this.previousOperand = `${expression} =`;
      this.currentOperand = computation.toString();
      this.operation = undefined;
      this.shouldResetScreen = true;
      this.clearActiveOperatorHighlight();
      this.playTone('equals');
    } else {
      this.currentOperand = computation.toString();
      this.previousOperand = computation.toString();
    }
  }

  percentage() {
    if (this.currentOperand === 'Error' || this.currentOperand === 'Cannot divide by 0') return;
    const current = parseFloat(this.currentOperand);
    if (isNaN(current)) return;

    if (this.previousOperand !== '' && this.operation) {
      const prev = parseFloat(this.previousOperand);
      if (!isNaN(prev)) {
        // e.g. 200 + 10% = 200 + 20
        const percentVal = (prev * current) / 100;
        this.currentOperand = this.sanitizePrecision(percentVal).toString();
      }
    } else {
      // Standalone %: 50% = 0.5
      this.currentOperand = this.sanitizePrecision(current / 100).toString();
    }
    this.playTone('click');
  }

  toggleSign() {
    if (this.currentOperand === '0' || this.currentOperand === '' || this.currentOperand === 'Error' || this.currentOperand === 'Cannot divide by 0') return;
    if (this.currentOperand.startsWith('-')) {
      this.currentOperand = this.currentOperand.slice(1);
    } else {
      this.currentOperand = '-' + this.currentOperand;
    }
    this.playTone('click');
  }

  sanitizePrecision(num) {
    if (isNaN(num) || !isFinite(num)) return num;
    // Format to max 12 significant figures and eliminate trailing precision errors
    return parseFloat(Number(num).toPrecision(12));
  }

  /* ==========================================================================
     Display & Formatting
     ========================================================================== */

  formatDisplayNumber(numberStr) {
    if (!numberStr) return '';
    if (numberStr === 'Cannot divide by 0' || numberStr === 'Error') return numberStr;

    const stringNumber = numberStr.toString();
    const parts = stringNumber.split('.');
    const integerDigits = parseFloat(parts[0]);
    const decimalDigits = parts[1];

    let integerDisplay;
    if (isNaN(integerDigits)) {
      integerDisplay = '';
    } else {
      integerDisplay = integerDigits.toLocaleString('en', { maximumFractionDigits: 0 });
    }

    if (decimalDigits != null) {
      return `${integerDisplay}.${decimalDigits}`;
    } else {
      return integerDisplay;
    }
  }

  updateDisplay() {
    if (this.currentOperand === 'Cannot divide by 0' || this.currentOperand === 'Error') {
      this.currOperandText.innerText = this.currentOperand;
      this.currOperandText.className = 'current-line text-sm';
    } else {
      const formatted = this.formatDisplayNumber(this.currentOperand);
      this.currOperandText.innerText = formatted || '0';

      // Dynamic font size scaling
      const length = (formatted || '0').length;
      if (length > 12) {
        this.currOperandText.className = 'current-line text-sm';
      } else if (length > 8) {
        this.currOperandText.className = 'current-line text-md';
      } else if (length > 6) {
        this.currOperandText.className = 'current-line text-lg';
      } else {
        this.currOperandText.className = 'current-line';
      }
    }

    if (this.operation != null && !this.previousOperand.includes('=')) {
      this.prevOperandText.innerText = `${this.formatDisplayNumber(this.previousOperand)} ${this.operation}`;
    } else {
      this.prevOperandText.innerText = this.previousOperand;
    }
  }

  highlightActiveOperator(op) {
    this.clearActiveOperatorHighlight();
    const opMap = { '+': 'key-add', '−': 'key-subtract', '-': 'key-subtract', '×': 'key-multiply', '*': 'key-multiply', '÷': 'key-divide', '/': 'key-divide' };
    const btnId = opMap[op];
    if (btnId) {
      const btn = document.getElementById(btnId);
      if (btn) btn.classList.add('active-op');
    }
  }

  clearActiveOperatorHighlight() {
    document.querySelectorAll('.key-operator').forEach(btn => btn.classList.remove('active-op'));
  }

  /* ==========================================================================
     History Management
     ========================================================================== */

  saveHistory(expression, result) {
    const entry = {
      id: Date.now(),
      expression,
      result: this.formatDisplayNumber(result),
      rawResult: result,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    this.history.unshift(entry);
    if (this.history.length > 30) this.history.pop();

    localStorage.setItem('nexus_calc_history', JSON.stringify(this.history));
    this.renderHistory();
  }

  renderHistory() {
    if (this.historyBadge) {
      if (this.history.length > 0) {
        this.historyBadge.innerText = this.history.length;
        this.historyBadge.classList.remove('hidden');
      } else {
        this.historyBadge.classList.add('hidden');
      }
    }

    if (this.history.length === 0) {
      this.historyEmpty.classList.remove('hidden');
      this.historyList.querySelectorAll('.history-item').forEach(el => el.remove());
      return;
    }

    this.historyEmpty.classList.add('hidden');
    this.historyList.querySelectorAll('.history-item').forEach(el => el.remove());

    this.history.forEach(item => {
      const el = document.createElement('div');
      el.className = 'history-item';
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', `Use result ${item.result}`);
      el.innerHTML = `
        <span class="history-item-calc">${item.expression} =</span>
        <span class="history-item-result">${item.result}</span>
      `;

      el.addEventListener('click', () => {
        this.currentOperand = item.rawResult;
        this.previousOperand = '';
        this.operation = undefined;
        this.shouldResetScreen = true;
        this.updateDisplay();
        this.toggleHistory(false);
        this.showToast(`Restored ${item.result}`);
        this.playTone('click');
      });

      this.historyList.appendChild(el);
    });
  }

  clearHistory() {
    this.history = [];
    localStorage.removeItem('nexus_calc_history');
    this.renderHistory();
    this.showToast('History cleared');
    this.playTone('clear');
  }

  toggleHistory(force) {
    const isOpen = this.historyDrawer.classList.contains('open');
    const newState = force !== undefined ? force : !isOpen;

    if (newState) {
      this.historyDrawer.classList.add('open');
      this.historyDrawer.setAttribute('aria-hidden', 'false');
    } else {
      this.historyDrawer.classList.remove('open');
      this.historyDrawer.setAttribute('aria-hidden', 'true');
    }
  }

  /* ==========================================================================
     Theme & Audio
     ========================================================================== */

  applyTheme(theme) {
    this.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('nexus_calc_theme', theme);

    if (theme === 'light') {
      this.sunIcon.classList.add('hidden');
      this.moonIcon.classList.remove('hidden');
    } else {
      this.sunIcon.classList.remove('hidden');
      this.moonIcon.classList.add('hidden');
    }
  }

  toggleTheme() {
    const newTheme = this.theme === 'dark' ? 'light' : 'dark';
    this.applyTheme(newTheme);
    this.playTone('click');
    this.showToast(`${newTheme.charAt(0).toUpperCase() + newTheme.slice(1)} Mode Enabled`);
  }

  toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    localStorage.setItem('nexus_calc_sound', this.soundEnabled);
    this.updateSoundIcon();
    this.showToast(this.soundEnabled ? 'Sound FX Enabled' : 'Sound FX Muted');
    if (this.soundEnabled) this.playTone('click');
  }

  updateSoundIcon() {
    if (this.soundEnabled) {
      this.soundOnIcon.classList.remove('hidden');
      this.soundOffIcon.classList.add('hidden');
    } else {
      this.soundOnIcon.classList.add('hidden');
      this.soundOffIcon.classList.remove('hidden');
    }
  }

  initAudio() {
    if (!this.audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.audioCtx = new AudioCtx();
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  playTone(type) {
    if (!this.soundEnabled) return;
    try {
      this.initAudio();
      if (!this.audioCtx) return;

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      const now = this.audioCtx.currentTime;

      switch (type) {
        case 'click':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(600, now);
          osc.frequency.exponentialRampToValueAtTime(300, now + 0.04);
          gain.gain.setValueAtTime(0.08, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
          osc.start(now);
          osc.stop(now + 0.04);
          break;
        case 'operator':
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(450, now);
          osc.frequency.exponentialRampToValueAtTime(700, now + 0.06);
          gain.gain.setValueAtTime(0.09, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
          osc.start(now);
          osc.stop(now + 0.06);
          break;
        case 'equals':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(523.25, now); // C5
          osc.frequency.setValueAtTime(659.25, now + 0.05); // E5
          osc.frequency.setValueAtTime(783.99, now + 0.1); // G5
          gain.gain.setValueAtTime(0.12, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
          osc.start(now);
          osc.stop(now + 0.22);
          break;
        case 'clear':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(400, now);
          osc.frequency.exponentialRampToValueAtTime(150, now + 0.08);
          gain.gain.setValueAtTime(0.08, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
          osc.start(now);
          osc.stop(now + 0.08);
          break;
        case 'error':
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(180, now);
          osc.frequency.setValueAtTime(130, now + 0.08);
          gain.gain.setValueAtTime(0.12, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
          osc.start(now);
          osc.stop(now + 0.16);
          break;
      }
    } catch (e) {
      // Audio playback failed silently
    }
  }

  /* ==========================================================================
     Clipboard & Notifications
     ========================================================================== */

  copyResult() {
    const textToCopy = this.currentOperand;
    if (!textToCopy || textToCopy === '0' || textToCopy === 'Error' || textToCopy === 'Cannot divide by 0') {
      this.showToast('Nothing to copy');
      return;
    }

    navigator.clipboard.writeText(textToCopy).then(() => {
      this.showToast(`Copied ${textToCopy} to clipboard!`);
      this.playTone('click');
    }).catch(() => {
      // Fallback
      const textArea = document.createElement('textarea');
      textArea.value = textToCopy;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      this.showToast(`Copied ${textToCopy}`);
    });
  }

  showToast(message) {
    if (!this.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = message;
    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 2400);
  }

  /* ==========================================================================
     Event Listeners & Keypad Binding
     ========================================================================== */

  bindEvents() {
    // Keypad Click Events
    this.keypad.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;

      const number = btn.dataset.number;
      const operator = btn.dataset.operator;
      const action = btn.dataset.action;

      if (number !== undefined) {
        this.appendNumber(number);
      } else if (operator !== undefined) {
        this.chooseOperation(operator);
      } else if (action !== undefined) {
        switch (action) {
          case 'all-clear':
            this.clear();
            break;
          case 'delete':
            this.delete();
            break;
          case 'percent':
            this.percentage();
            break;
          case 'toggle-sign':
            this.toggleSign();
            break;
          case 'decimal':
            this.appendNumber('.');
            break;
          case 'equals':
            this.compute(true);
            break;
        }
      }
      this.updateDisplay();
    });

    // Control Button Handlers
    this.themeToggleBtn.addEventListener('click', () => this.toggleTheme());
    this.soundToggleBtn.addEventListener('click', () => this.toggleSound());
    this.historyToggleBtn.addEventListener('click', () => this.toggleHistory());
    this.closeHistoryBtn.addEventListener('click', () => this.toggleHistory(false));
    this.clearHistoryBtn.addEventListener('click', () => this.clearHistory());
    this.copyResultBtn.addEventListener('click', () => this.copyResult());

    // Physical Keyboard Support
    window.addEventListener('keydown', (e) => {
      this.handleKeyboard(e);
    });
  }

  handleKeyboard(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    let handled = false;
    let targetButtonId = null;

    if (e.key >= '0' && e.key <= '9') {
      this.appendNumber(e.key);
      targetButtonId = `key-${e.key}`;
      handled = true;
    } else if (e.key === '.' || e.key === ',') {
      this.appendNumber('.');
      targetButtonId = 'key-decimal';
      handled = true;
    } else if (e.key === '+' || e.key === '-' || e.key === '*' || e.key === '/') {
      const opMap = { '+': '+', '-': '−', '*': '×', '/': '÷' };
      const btnMap = { '+': 'key-add', '-': 'key-subtract', '*': 'key-multiply', '/': 'key-divide' };
      this.chooseOperation(opMap[e.key]);
      targetButtonId = btnMap[e.key];
      handled = true;
    } else if (e.key === 'Enter' || e.key === '=') {
      e.preventDefault();
      this.compute(true);
      targetButtonId = 'key-equals';
      handled = true;
    } else if (e.key === 'Backspace') {
      this.delete();
      targetButtonId = 'key-backspace';
      handled = true;
    } else if (e.key === 'Escape' || e.key.toLowerCase() === 'c') {
      this.clear();
      targetButtonId = 'key-ac';
      handled = true;
    } else if (e.key === '%') {
      this.percentage();
      targetButtonId = 'key-percent';
      handled = true;
    } else if (e.key.toLowerCase() === 'h') {
      this.toggleHistory();
      handled = true;
    }

    if (handled) {
      this.updateDisplay();
      if (targetButtonId) {
        const btn = document.getElementById(targetButtonId);
        if (btn) {
          btn.classList.add('pressed');
          setTimeout(() => btn.classList.remove('pressed'), 120);
        }
      }
    }
  }
}

// Instantiate Calculator on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  window.nexusCalculator = new NexusCalculator();
});
