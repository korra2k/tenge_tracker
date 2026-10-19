import './translations.js';
import './module-translations.js';
import {
  loadUserData,
  loadAdminData,
  loginWithEmail,
  logout,
  loadModuleItems,
  observeAuth,
  removeAccount,
  removeAdminItem,
  removeModuleItem,
  registerWithEmail,
  removeTransaction,
  resetPassword,
  saveOnboarding,
  saveModuleItem,
  saveAdminItem,
  saveTransaction,
  saveUserSettings,
  updateAdminUser,
  updateDisplayName,
  toFirebaseErrorKey
} from './firebase.js';
import { moduleTitles, renderWorkspaceScreen } from './workspace.js?v=4';

(() => {
  const storageKey = 'tenge-tracker-v1';
  const localDate = (offset) => {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const seed = {
    balance: 428500,
    language: 'ru',
    transactions: [
      { id: 'seed-1', title: 'Продукты на неделю', category: 'groceries', account: 'card', amount: 18450, type: 'expense', date: localDate(0) },
      { id: 'seed-2', title: 'Кофе и завтрак', category: 'leisure', account: 'cash', amount: 3250, type: 'expense', date: localDate(1) },
      { id: 'seed-3', title: 'Такси', category: 'transport', account: 'card', amount: 2800, type: 'expense', date: localDate(1) },
      { id: 'seed-4', title: 'Зарплата', category: 'salary', account: 'card', amount: 385000, type: 'income', date: localDate(3) },
      { id: 'seed-5', title: 'Коммунальные услуги', category: 'home', account: 'card', amount: 24600, type: 'expense', date: localDate(4) }
    ]
  };
  let state;
  try {
    state = JSON.parse(localStorage.getItem(storageKey)) || seed;
  } catch {
    state = seed;
  }
  state = { ...seed, ...state, transactions: Array.isArray(state.transactions) ? state.transactions : seed.transactions };
  state.profile = state.profile || null;
  state.onboardingStep = Number.isInteger(state.onboardingStep) ? state.onboardingStep : 0;
  state.defaultCurrency = state.defaultCurrency || 'KZT';
  state.firstAccount = state.firstAccount || 'card';
  state.categoryTemplate = state.categoryTemplate || 'default';
  state.profile = null;
  state.accounts = [];
  state.transactions = [];
  state.balance = 0;
  state.budgets = [];
  state.goals = [];
  state.categories = [];
  state.adminUsers = [];
  state.adminData = { users: [], categories: [], plans: [], logs: [] };
  state.isAdmin = false;
  let currentScreen = 'overview';
  let reportPeriod = 'month';
  let adminSection = 'overview';
  let currentUser = null;
  const t = (key) => window.TENGE_TRANSLATIONS[state.language]?.[key] || window.TENGE_TRANSLATIONS.ru[key] || key;
  const firebaseStatusCopy = {
    ru: { dashboard: 'Данные аккаунта синхронизируются с Firestore', onboarding: 'Профиль и счёт будут сохранены в Firestore' },
    kz: { dashboard: 'Аккаунт деректері Firestore жүйесімен синхрондалады', onboarding: 'Профиль мен шот Firestore жүйесінде сақталады' },
    en: { dashboard: 'Account data syncs with Firestore', onboarding: 'Your profile and account will be saved to Firestore' }
  };
  function setFirebaseStatusCopy() {
    const copy = firebaseStatusCopy[state.language] || firebaseStatusCopy.ru;
    $('[data-i18n="localPreview"]').textContent = copy.dashboard;
    $('[data-i18n="localPrototypeNote"]').textContent = copy.onboarding;
    $('.auth-demo-note').textContent = ({
      ru: 'Пароль проверяет Firebase Authentication; приложение его не сохраняет.',
      kz: 'Құпиясөзді Firebase Authentication тексереді; қолданба оны сақтамайды.',
      en: 'Firebase Authentication checks your password; the app never stores it.'
    })[state.language] || 'Firebase Authentication checks your password; the app never stores it.';
  }
  const $ = (selector) => document.querySelector(selector);
  const locale = () => ({ ru: 'ru-KZ', kz: 'kk-KZ', en: 'en-US' })[state.language];
  const money = (value, currency = state.defaultCurrency) => new Intl.NumberFormat(locale(), { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
  const categoryKeys = ['groceries', 'transport', 'home', 'health', 'leisure', 'salary', 'freelance', 'other'];
  const filters = { from: '', to: '', min: '', max: '', category: '', account: '' };
  let editingTransactionId = null;
  let deletingTransactionId = null;
  let pendingModuleDelete = null;
  const thisMonth = () => state.transactions.filter((item) => {
    const date = new Date(`${item.date}T00:00:00`);
    const now = new Date();
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  });
  const save = () => localStorage.setItem(storageKey, JSON.stringify({
    language: state.language,
    defaultCurrency: state.defaultCurrency,
    firstAccount: state.firstAccount,
    firstAccountName: state.firstAccountName,
    categoryTemplate: state.categoryTemplate,
    onboardingStep: state.onboardingStep
  }));

  function translatePage() {
    document.documentElement.lang = state.language === 'kz' ? 'kk' : state.language;
    document.querySelectorAll('[data-i18n]').forEach((element) => {
      element.textContent = t(element.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
      element.placeholder = t(element.dataset.i18nPlaceholder);
    });
    $('#language-select').value = state.language;
    $('#public-language-select').value = state.language;
    const select = $('#transaction-category');
    const current = select.value;
    select.innerHTML = `<option value="">${t('selectCategory')}</option>` + categoryKeys.map((key) => `<option value="${key}">${t(key)}</option>`).join('') + state.categories.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');
    if (categoryKeys.includes(current)) select.value = current;
    const filterCategory = $('#filter-category');
    const filterCategoryValue = filterCategory.value;
    filterCategory.innerHTML = `<option value="">${t('anyCategory')}</option>` + categoryKeys.map((key) => `<option value="${key}">${t(key)}</option>`).join('') + state.categories.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');
    filterCategory.value = filterCategoryValue;
    renderAccountOptions();
  }

  function renderAccountOptions(selectedAccount = $('#transaction-account').value) {
    $('#transaction-account').innerHTML = state.accounts.map((account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)} · ${account.currency || state.defaultCurrency}</option>`).join('');
    if (state.accounts.some((account) => account.id === selectedAccount)) $('#transaction-account').value = selectedAccount;
    const filterSelected = $('#filter-account').value;
    $('#filter-account').innerHTML = `<option value="">${t('anyAccount')}</option>${state.accounts.map((account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)}</option>`).join('')}`;
    if (state.accounts.some((account) => account.id === filterSelected)) $('#filter-account').value = filterSelected;
    updateAmountCurrency();
    setFirebaseStatusCopy();
  }

  function updateAmountCurrency() {
    const account = state.accounts.find((item) => item.id === $('#transaction-account').value);
    const currency = account?.currency || state.defaultCurrency;
    $('#transaction-currency').textContent = new Intl.NumberFormat(locale(), { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find((part) => part.type === 'currency')?.value || currency;
  }

  function accountName(key) {
    return state.accounts.find((account) => account.id === key)?.name || t(({ card: 'mainCardAccount', cash: 'cashAccount', savings: 'savingsAccount' })[key] || 'mainCardAccount');
  }

  function categoryName(key) {
    return state.categories.find((item) => item.id === key)?.name || t(key);
  }

  async function applyUserData(user, data) {
    currentUser = user;
    const token = await user.getIdTokenResult();
    state.isAdmin = token.claims.admin === true || user.email?.trim().toLowerCase() === 'admin123@gmail.com';
    state.profile = {
      name: data.profile.displayName || user.displayName || user.email?.split('@')[0] || '',
      email: user.email || data.profile.email,
      phone: data.profile.phone || '',
      onboardingCompleted: data.profile.onboardingCompleted === true,
      ...data.profile
    };
    document.documentElement.dataset.theme = data.profile.theme === 'dark' ? 'dark' : 'light';
    state.language = ['ru', 'kz', 'en'].includes(data.profile.language) ? data.profile.language : 'ru';
    state.defaultCurrency = data.profile.defaultCurrency || 'KZT';
    state.categoryTemplate = data.profile.categoryTemplate || 'default';
    state.accounts = data.accounts;
    state.transactions = data.transactions;
    state.budgets = data.budgets;
    state.goals = data.goals;
    state.categories = data.categories;
    state.adminData = state.isAdmin ? await loadAdminData() : { users: [], categories: [], plans: [], logs: [] };
    state.adminUsers = state.adminData.users;
    $('#admin-nav').hidden = !state.isAdmin;
    state.balance = Number(data.profile.totalBalance || 0);
    save();
    render();
    if (state.profile.onboardingCompleted) {
      showView('dashboard');
      await navigateToScreen(currentScreen, false);
    }
    else {
      state.onboardingStep = 0;
      showView('onboarding');
      renderOnboarding();
    }
  }

  async function handleAuthChange(user) {
    currentUser = user;
    if (!user) {
      document.documentElement.dataset.theme = 'light';
      state.profile = null;
      state.accounts = [];
      state.transactions = [];
      state.balance = 0;
      state.budgets = [];
      state.goals = [];
      state.categories = [];
      state.adminUsers = [];
      state.adminData = { users: [], categories: [], plans: [], logs: [] };
      state.isAdmin = false;
      $('#admin-nav').hidden = true;
      showView('public');
      render();
      return;
    }
    try {
      const data = await loadUserData(user);
      if (data.profile.status === 'blocked') {
        showToast(t('accountBlocked'));
        await logout();
        return;
      }
      await applyUserData(user, data);
    } catch (error) {
      showView('public');
      showToast(t(toFirebaseErrorKey(error)));
    }
  }

  function formatDate(value) {
    if (value === localDate(0)) return t('today');
    if (value === localDate(1)) return t('yesterday');
    return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(new Date(`${value}T00:00:00`));
  }

  function renderSummary() {
    const entries = thisMonth().filter((item) => (item.currency || state.defaultCurrency) === state.defaultCurrency);
    const income = entries.filter((item) => item.type === 'income').reduce((sum, item) => sum + item.amount, 0);
    const expense = entries.filter((item) => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0);
    $('#balance-value').textContent = money(state.balance);
    $('#income-value').textContent = money(income);
    $('#expense-value').textContent = money(expense);
    $('#nav-count').textContent = state.transactions.length;
  }

  function renderTransactions() {
    const query = $('#transaction-search').value.trim().toLocaleLowerCase(locale());
    const filtered = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date)).filter((item) => {
      const matchesQuery = `${item.title} ${item.comment || ''} ${(item.tags || []).join(' ')} ${categoryName(item.category)} ${accountName(item.account)}`.toLocaleLowerCase(locale()).includes(query);
      return matchesQuery
        && (!filters.from || item.date >= filters.from)
        && (!filters.to || item.date <= filters.to)
        && (!filters.min || item.amount >= Number(filters.min))
        && (!filters.max || item.amount <= Number(filters.max))
        && (!filters.category || item.category === filters.category)
        && (!filters.account || item.account === filters.account);
    });
    $('#transaction-rows').innerHTML = filtered.map((item) => {
      const icon = item.type === 'income' ? '↙' : ({ groceries: '✳', transport: '↗', home: '⌂', health: '＋', leisure: '◌' })[item.category] || '·';
      const sign = item.type === 'income' ? '+' : '−';
      const tags = Array.isArray(item.tags) ? item.tags : [];
      const repeat = item.repeat && item.repeat !== 'none' ? ` · ${t(item.repeat)}` : '';
      const metadata = `${t(item.type)}${repeat}${item.comment ? ` · ${escapeHtml(item.comment)}` : ''}`;
      return `<tr><td><span class="transaction-name"><span class="transaction-icon ${item.category}">${icon}</span><span><strong>${escapeHtml(item.title)}</strong><small>${metadata}</small></span></span></td><td><span class="category-stack"><span class="category-label"><i class="category-dot ${item.category}"></i>${escapeHtml(categoryName(item.category))}</span>${tags.length ? `<small class="transaction-tags">${tags.map((tag) => `#${escapeHtml(tag)}`).join(' ')}</small>` : ''}</span></td><td class="date-cell">${formatDate(item.date)}</td><td><span class="account-label"><i></i>${accountName(item.account)}</span></td><td class="amount-cell ${item.type === 'income' ? 'transaction-income' : ''}">${sign}${money(item.amount, item.currency || state.defaultCurrency)}</td><td class="row-actions"><button type="button" data-action="edit" data-id="${item.id}" aria-label="${t('editTransaction')}" title="${t('editTransaction')}">✎</button><button type="button" data-action="delete" data-id="${item.id}" aria-label="${t('deleteTransaction')}" title="${t('deleteTransaction')}">×</button></td></tr>`;
    }).join('');
    $('#empty-state').hidden = state.transactions.length > 0;
    $('#no-matches').hidden = state.transactions.length === 0 || filtered.length > 0;
    $('.transactions-table').hidden = state.transactions.length === 0;
    const activeFilters = Object.values(filters).filter(Boolean).length;
    $('#filter-count').textContent = activeFilters || '';
    $('#filter-count').hidden = activeFilters === 0;
    $('#clear-filters').hidden = activeFilters === 0 && !query;
  }

  function renderBudgets() {
    const budgets = state.budgets.slice(0, 4);
    $('#budget-list').innerHTML = budgets.length ? budgets.map((budget) => {
      const expenses = state.transactions.filter((item) => item.type === 'expense' && item.category === budget.category && (budget.period === 'week' ? item.date >= localDate(6) : item.date.slice(0, 7) === localDate(0).slice(0, 7)) && (item.currency || state.defaultCurrency) === budget.currency);
      const spent = expenses.reduce((sum, item) => sum + item.amount, 0);
      const limit = Number(budget.limit || 0);
      const percent = limit ? Math.min(100, Math.round(spent / limit * 100)) : 0;
      const remaining = limit - spent;
      return `<div class="budget-item"><div class="budget-title-row"><span class="budget-category"><i class="budget-dot blue"></i>${escapeHtml(categoryName(budget.category))}</span><span class="budget-percent">${percent}%</span></div><div class="progress-track"><span class="progress-fill ${percent > 90 ? 'orange' : 'blue'}" style="width:${percent}%"></span></div><div class="budget-meta"><span>${money(spent, budget.currency, locale())} <i>/ ${money(limit, budget.currency, locale())}</i></span><span class="remaining ${remaining < 0 ? 'over' : ''}">${remaining < 0 ? `${money(Math.abs(remaining), budget.currency, locale())} ${t('budgetOver')}` : `${money(remaining, budget.currency, locale())} ${t('budgetRemaining')}`}</span></div></div>`;
    }).join('') : `<div class="module-empty">${t('noBudgets')}</div>`;
  }

  function renderChart() {
    const count = $('#chart-period').value === 'week' ? 7 : new Date().getDate();
    const dates = Array.from({ length: count }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - count + index + 1);
      return date;
    });
    const values = dates.map((date) => {
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      return state.transactions.filter((item) => item.date === key && item.type === 'expense' && (item.currency || state.defaultCurrency) === state.defaultCurrency).reduce((sum, item) => sum + item.amount, 0);
    });
    const max = Math.max(15000, ...values);
    const labels = dates.map((date) => $('#chart-period').value === 'week' ? new Intl.DateTimeFormat(locale(), { weekday: 'short' }).format(date).slice(0, 2) : date.getDate());
    $('#chart-total').textContent = money(values.reduce((sum, value) => sum + value, 0));
    $('#chart-area').innerHTML = `<div class="chart-grid-lines"><i></i><i></i><i></i><i></i></div><div class="chart-bars" style="--chart-count:${count}">${values.map((value, index) => `<div class="bar-slot"><div class="bar-track"><span class="chart-bar ${index === values.length - 1 ? 'current' : ''}" style="height:${Math.max(4, Math.round(value / max * 100))}%" title="${money(value)}"></span></div><span class="bar-label">${labels[index]}</span></div>`).join('')}</div>`;
  }

  function renderDate() {
    const date = new Date();
    const profileName = state.profile?.name || 'Айдана';
    $('#profile-name').textContent = profileName;
    $('#profile-avatar').textContent = profileName.slice(0, 1).toLocaleUpperCase(locale());
    $('#top-avatar').textContent = profileName.slice(0, 1).toLocaleUpperCase(locale());
    $('.name-accent').textContent = profileName;
    $('#today-label').textContent = new Intl.DateTimeFormat(state.language === 'kz' ? 'kk-KZ' : state.language === 'en' ? 'en-US' : 'ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
    const greeting = date.getHours() < 12 ? 'morning' : date.getHours() < 18 ? 'afternoon' : 'evening';
    $('[data-i18n="hello"]').textContent = t(greeting);
  }

  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  function render() {
    translatePage();
    renderDate();
    renderSummary();
    renderTransactions();
    renderBudgets();
    renderChart();
  }

  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('visible');
    window.setTimeout(() => toast.classList.remove('visible'), 2400);
  }

  async function navigateToScreen(screen, updateUrl = true) {
    if (screen === 'admin' && !state.isAdmin) {
      showToast(t('adminForbidden'));
      screen = 'overview';
    }
    if (screen !== 'overview' && !moduleTitles[screen]) screen = 'overview';
    currentScreen = screen;
    document.querySelectorAll('[data-screen-link]').forEach((link) => link.classList.toggle('active', link.dataset.screenLink === screen));
    if (updateUrl) history.replaceState(null, '', `#${screen}`);
    if (screen === 'overview') {
      $('#overview-screen').hidden = false;
      $('#module-screen').hidden = true;
      $('#screen-title').textContent = t('dashboard');
      return;
    }
    $('#overview-screen').hidden = true;
    $('#module-screen').hidden = false;
    $('#screen-title').textContent = t(moduleTitles[screen]);
    if (screen === 'admin' && state.isAdmin) {
      try {
        state.adminData = await loadAdminData();
        state.adminUsers = state.adminData.users;
      } catch (error) {
        showToast(t(toFirebaseErrorKey(error)));
        return;
      }
    }
    $('#module-content').innerHTML = renderWorkspaceScreen(screen, {
      t,
      profile: state.profile,
      accounts: state.accounts,
      transactions: state.transactions,
      budgets: state.budgets,
      goals: state.goals,
      categories: state.categories,
      adminUsers: state.adminUsers,
      adminData: state.adminData,
      locale: locale(),
      isAdmin: state.isAdmin,
      reportPeriod,
      adminSection
    });
  }

  async function refreshUserData() {
    if (!currentUser) return;
    await applyUserData(currentUser, await loadUserData(currentUser));
    if (currentScreen !== 'overview') await navigateToScreen(currentScreen, false);
  }

  async function createExcelCompatibleExport() {
    const headings = [t('transaction'), t('category'), t('date'), t('account'), t('amount'), t('currency'), t('comment'), t('tags')];
    const rows = state.transactions.map((item) => [item.title, t(item.category), item.date, accountName(item.account), item.amount, item.currency || state.defaultCurrency, item.comment || '', (item.tags || []).join(', ')]);
    const csv = [headings, ...rows].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `tenge-tracker-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function showView(view) {
    $('#public-view').hidden = view !== 'public';
    $('#onboarding-view').hidden = view !== 'onboarding';
    $('#dashboard-view').hidden = view !== 'dashboard';
  }

  function showDashboard() {
    showView('dashboard');
    render();
  }

  function setAuthMode(mode) {
    const registering = mode === 'register';
    $('#auth-title').textContent = t(registering ? 'createAccount' : 'signIn');
    $('#auth-submit-label').textContent = t(registering ? 'createAccount' : 'signIn');
    document.querySelectorAll('.auth-mode-button').forEach((button) => button.classList.toggle('selected', button.dataset.mode === mode));
    document.querySelectorAll('.register-only').forEach((element) => { element.hidden = !registering; });
    $('#auth-name').required = registering;
    $('#auth-phone').required = false;
    $('#auth-confirm').required = registering;
    $('#auth-consent').required = registering;
    $('#auth-password').autocomplete = registering ? 'new-password' : 'current-password';
    $('#forgot-password').hidden = registering;
    $('#auth-feedback').textContent = '';
  }

  function renderOnboarding() {
    const step = Math.max(0, Math.min(4, state.onboardingStep));
    const steps = ['stepLanguage', 'stepCurrency', 'stepAccount', 'stepCategories', 'stepDone'];
    translatePage();
    $('#onboarding-step-label').textContent = `${t('step')} ${step + 1} / 5 · ${t(steps[step])}`;
    $('#onboarding-progress-fill').style.width = `${(step + 1) * 20}%`;
    $('#onboarding-step-list').innerHTML = steps.map((key, index) => `<div class="onboarding-step ${index === step ? 'current' : ''} ${index < step ? 'complete' : ''}"><span>${index < step ? '✓' : `0${index + 1}`}</span>${t(key)}</div>`).join('');
    $('#onboarding-back').hidden = step === 0 || step === 4;
    $('#onboarding-next').querySelector('span').textContent = t(step === 4 ? 'finishSetup' : 'continue');
    $('#onboarding-next').querySelectorAll('span')[1].textContent = step === 4 ? '✓' : '↗';
    const content = $('#onboarding-content');
    if (step === 0) {
      content.innerHTML = `<h2>${t('chooseLanguage')}</h2><p class="onboarding-description">${t('chooseLanguageText')}</p><div class="choice-grid language-choices">${[['ru', 'Русский', 'RU'], ['kz', 'Қазақша', 'KZ'], ['en', 'English', 'EN']].map(([value, label, code]) => `<button type="button" class="choice-card ${state.language === value ? 'selected' : ''}" data-choice="language" data-value="${value}"><span class="choice-code">${code}</span><strong>${label}</strong><span class="choice-check">✓</span></button>`).join('')}</div>`;
    } else if (step === 1) {
      content.innerHTML = `<h2>${t('chooseCurrency')}</h2><p class="onboarding-description">${t('chooseCurrencyText')}</p><div class="choice-grid currency-choices">${[['KZT', '₸', 'Kazakhstani tenge'], ['RUB', '₽', 'Russian ruble'], ['USD', '$', 'US dollar'], ['EUR', '€', 'Euro']].map(([value, mark, label]) => `<button type="button" class="choice-card ${state.defaultCurrency === value ? 'selected' : ''}" data-choice="currency" data-value="${value}"><span class="currency-mark">${mark}</span><strong>${value}</strong><small>${t(({ KZT: 'currencyKZT', RUB: 'currencyRUB', USD: 'currencyUSD', EUR: 'currencyEUR' })[value]) || label}</small><span class="choice-check">✓</span></button>`).join('')}</div><p class="onboarding-hint">${t('currencyNote')}</p>`;
    } else if (step === 2) {
      content.innerHTML = `<h2>${t('firstAccount')}</h2><p class="onboarding-description">${t('firstAccountText')}</p><div class="choice-grid account-choices">${[['card', 'accountCard', '▣'], ['cash', 'accountCash', '◉'], ['wallet', 'accountWallet', '▤'], ['savings', 'accountSavings', '◷']].map(([value, key, icon]) => `<button type="button" class="choice-card ${state.firstAccount === value ? 'selected' : ''}" data-choice="account" data-value="${value}"><span class="account-choice-icon">${icon}</span><strong>${t(key)}</strong><span class="choice-check">✓</span></button>`).join('')}</div><label class="field-label" for="first-account-name">${t('accountName')}</label><input class="form-input" id="first-account-name" maxlength="40" value="${escapeHtml(state.firstAccountName || t(({ card: 'accountCard', cash: 'accountCash', wallet: 'accountWallet', savings: 'accountSavings' })[state.firstAccount]))}">`;
    } else if (step === 3) {
      content.innerHTML = `<h2>${t('categoryTemplate')}</h2><p class="onboarding-description">${t('categoryTemplateText')}</p><div class="template-options"><button class="template-card ${state.categoryTemplate === 'default' ? 'selected' : ''}" type="button" data-choice="template" data-value="default"><span class="template-mark">✳</span><span><strong>${t('standardCategories')}</strong><small>${t('standardCategoriesText')}</small></span><span class="choice-check">✓</span></button><button class="template-card ${state.categoryTemplate === 'custom' ? 'selected' : ''}" type="button" data-choice="template" data-value="custom"><span class="template-mark custom-mark">＋</span><span><strong>${t('customCategories')}</strong><small>${t('customCategoriesText')}</small></span><span class="choice-check">✓</span></button></div>`;
    } else {
      content.innerHTML = `<div class="setup-complete-mark">✓</div><h2>${t('setupReady').replace('{name}', escapeHtml(state.profile?.name || ''))}</h2><p class="onboarding-description">${t('setupReadyText')}</p><div class="setup-summary"><span>${t('language')}</span><strong>${t(({ ru: 'russian', kz: 'kazakh', en: 'english' })[state.language])}</strong><span>${t('defaultCurrency')}</span><strong>${state.defaultCurrency}</strong><span>${t('firstAccount')}</span><strong>${t(({ card: 'accountCard', cash: 'accountCash', wallet: 'accountWallet', savings: 'accountSavings' })[state.firstAccount])}</strong><span>${t('categoryTemplate')}</span><strong>${t(state.categoryTemplate === 'default' ? 'standardCategories' : 'customCategories')}</strong></div>`;
    }
  }

  function startOnboarding() {
    state.onboardingStep = 0;
    save();
    showView('onboarding');
    renderOnboarding();
  }

  function openAuth(mode) {
    setAuthMode(mode);
    $('#auth-dialog').showModal();
    $('#auth-email').focus();
  }

  function updateLanguage(language) {
    state.language = language;
    save();
    render();
    if (!$('#onboarding-view').hidden) renderOnboarding();
    else if (currentUser && currentScreen !== 'overview') void navigateToScreen(currentScreen, false);
  }

  function openTransactionEditor(transactionId = null) {
    editingTransactionId = transactionId;
    const existing = state.transactions.find((item) => item.id === transactionId);
    $('#transaction-date').value = localDate(0);
    $('#transaction-form').reset();
    $('#transaction-type').value = existing?.type || 'expense';
    $('#transaction-title').value = existing?.title || '';
    $('#transaction-amount').value = existing?.amount || '';
    $('#transaction-date').value = existing?.date || localDate(0);
    $('#transaction-category').value = existing?.category || '';
    $('#transaction-account').value = existing?.account || state.accounts[0]?.id || '';
    $('#transaction-repeat').value = existing?.repeat || 'none';
    $('#transaction-tags').value = Array.isArray(existing?.tags) ? existing.tags.join(', ') : '';
    $('#transaction-comment').value = existing?.comment || '';
    $('#transaction-dialog-title').textContent = t(existing ? 'editTransaction' : 'newTransaction');
    document.querySelectorAll('.type-option').forEach((option) => option.classList.toggle('selected', option.dataset.type === (existing?.type || 'expense')));
    $('#transaction-dialog').showModal();
    $('#transaction-title').focus();
  }

  $('#open-transaction').addEventListener('click', () => openTransactionEditor());
  $('#close-dialog').addEventListener('click', () => $('#transaction-dialog').close());
  $('#transaction-account').addEventListener('change', updateAmountCurrency);
  $('#transaction-dialog').addEventListener('click', (event) => {
    if (event.target === $('#transaction-dialog')) $('#transaction-dialog').close();
  });
  document.querySelectorAll('.type-option').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.type-option').forEach((option) => option.classList.toggle('selected', option === button));
    $('#transaction-type').value = button.dataset.type;
  }));
  $('#transaction-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get('amount'));
    const category = form.get('category');
    if (!amount || !category) return;
    const type = $('#transaction-type').value;
    const tags = String(form.get('tags') || '').split(',').map((tag) => tag.trim().slice(0, 24)).filter(Boolean).slice(0, 8);
    const existingIndex = state.transactions.findIndex((item) => item.id === editingTransactionId);
    const accountId = String(form.get('account') || '');
    if (!currentUser || !state.accounts.some((account) => account.id === accountId)) {
      showToast(t('authErrorAccountMissing'));
      return;
    }
    const transaction = {
      id: editingTransactionId || crypto.randomUUID(),
      title: String(form.get('title')).trim(),
      category,
      account: accountId,
      currency: state.accounts.find((account) => account.id === accountId)?.currency || state.defaultCurrency,
      amount,
      type,
      date: form.get('date'),
      comment: String(form.get('comment') || '').trim(),
      tags,
      repeat: form.get('repeat') || 'none',
      isNew: existingIndex < 0
    };
    editingTransactionId = null;
    const submitButton = event.currentTarget.querySelector('[type="submit"]');
    submitButton.disabled = true;
    saveTransaction(currentUser.uid, transaction).then(async () => {
      const data = await loadUserData(currentUser);
      $('#transaction-form').reset();
      $('#transaction-type').value = 'expense';
      document.querySelectorAll('.type-option').forEach((option) => option.classList.toggle('selected', option.dataset.type === 'expense'));
      $('#transaction-dialog').close();
      await applyUserData(currentUser, data);
      showToast(t('saved'));
    }).catch((error) => showToast(t(toFirebaseErrorKey(error)))).finally(() => { submitButton.disabled = false; });
  });
  $('#language-select').addEventListener('change', (event) => {
    updateLanguage(event.target.value);
  });
  $('#public-language-select').addEventListener('change', (event) => updateLanguage(event.target.value));
  $('#transaction-search').addEventListener('input', renderTransactions);
  $('#chart-period').addEventListener('change', renderChart);
  $('#add-budget').addEventListener('click', () => showToast(t('budgetSoon')));
  $('#open-filters').addEventListener('click', () => {
    Object.entries(filters).forEach(([key, value]) => {
      const field = $(`#filter-${key}`);
      if (field) field.value = value;
    });
    $('#filter-dialog').showModal();
  });
  $('#close-filters').addEventListener('click', () => $('#filter-dialog').close());
  $('#filter-dialog').addEventListener('click', (event) => {
    if (event.target === $('#filter-dialog')) $('#filter-dialog').close();
  });
  $('#filter-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const from = String(values.get('from') || '');
    const to = String(values.get('to') || '');
    const min = String(values.get('min') || '');
    const max = String(values.get('max') || '');
    if ((from && to && from > to) || (min && max && Number(min) > Number(max))) {
      $('#filter-feedback').textContent = t('invalidFilterRange');
      return;
    }
    Object.assign(filters, { from, to, min, max, category: String(values.get('category') || ''), account: String(values.get('account') || '') });
    $('#filter-feedback').textContent = '';
    $('#filter-dialog').close();
    renderTransactions();
  });
  $('#reset-filter-form').addEventListener('click', () => {
    $('#filter-form').reset();
    $('#filter-feedback').textContent = '';
    Object.keys(filters).forEach((key) => { filters[key] = ''; });
    renderTransactions();
  });
  $('#clear-filters').addEventListener('click', () => {
    Object.keys(filters).forEach((key) => { filters[key] = ''; });
    $('#transaction-search').value = '';
    $('#filter-form').reset();
    renderTransactions();
  });
  $('#transaction-rows').addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const item = state.transactions.find((transaction) => transaction.id === button.dataset.id);
    if (!item) return;
    if (button.dataset.action === 'edit') openTransactionEditor(item.id);
    if (button.dataset.action === 'delete') {
      deletingTransactionId = item.id;
      $('#delete-description').textContent = `${item.title} · ${money(item.amount)}`;
      $('#delete-dialog').showModal();
    }
  });
  $('#confirm-delete').addEventListener('click', async () => {
    if (pendingModuleDelete && currentUser) {
      const button = $('#confirm-delete');
      button.disabled = true;
      try {
        if (pendingModuleDelete.collection === 'accounts') await removeAccount(currentUser.uid, pendingModuleDelete.item);
        else if (['globalCategories', 'plans'].includes(pendingModuleDelete.collection)) await removeAdminItem(pendingModuleDelete.collection, pendingModuleDelete.id);
        else await removeModuleItem(currentUser.uid, pendingModuleDelete.collection, pendingModuleDelete.id);
        pendingModuleDelete = null;
        $('#delete-dialog').close();
        await refreshUserData();
      } catch (error) {
        showToast(t(toFirebaseErrorKey(error)));
      } finally {
        button.disabled = false;
      }
      return;
    }
    const transaction = state.transactions.find((item) => item.id === deletingTransactionId);
    if (!transaction || !currentUser) return;
    const button = $('#confirm-delete');
    button.disabled = true;
    try {
      await removeTransaction(currentUser.uid, transaction);
      await applyUserData(currentUser, await loadUserData(currentUser));
      deletingTransactionId = null;
      $('#delete-dialog').close();
      showToast(t('transactionDeleted'));
    } catch (error) {
      showToast(t(toFirebaseErrorKey(error)));
    } finally {
      button.disabled = false;
    }
  });
  document.querySelectorAll('[data-screen-link]').forEach((link) => link.addEventListener('click', (event) => {
    event.preventDefault();
    void navigateToScreen(link.dataset.screenLink);
  }));
  window.addEventListener('hashchange', () => {
    if (currentUser && location.hash.length > 1) void navigateToScreen(location.hash.slice(1), false);
  });
  $('#module-content').addEventListener('input', (event) => {
    if (event.target.id !== 'module-transaction-search') return;
    const query = event.target.value.toLocaleLowerCase(locale());
    $('#module-transaction-rows').querySelectorAll('tr').forEach((row) => { row.hidden = !row.textContent.toLocaleLowerCase(locale()).includes(query); });
  });
  $('#module-content').addEventListener('change', (event) => {
    if (event.target.id === 'reports-period') {
      reportPeriod = event.target.value;
      void navigateToScreen('reports', false);
      return;
    }
    if (event.target.dataset.adminField) {
      const button = event.target.closest('tr')?.querySelector('[data-action="save-admin-user"]');
      if (button) button.disabled = false;
    }
  });
  $('#module-content').addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-module-form]');
    if (!form) return;
    event.preventDefault();
    const values = new FormData(form);
    const formData = Object.fromEntries(values.entries());
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      if (form.dataset.moduleForm === 'account') {
        await saveModuleItem(currentUser.uid, 'accounts', { id: crypto.randomUUID(), name: formData.name.trim(), type: formData.type, currency: formData.currency, balance: 0 });
      } else if (form.dataset.moduleForm === 'budget') {
        await saveModuleItem(currentUser.uid, 'budgets', { id: crypto.randomUUID(), category: formData.category, limit: Number(formData.limit), currency: formData.currency, period: formData.period, alertsEnabled: form.elements.alertsEnabled.checked, status: 'active' });
      } else if (form.dataset.moduleForm === 'goal') {
        await saveModuleItem(currentUser.uid, 'goals', { id: crypto.randomUUID(), name: formData.name.trim(), targetAmount: Number(formData.targetAmount), savedAmount: 0, currency: formData.currency, dueDate: formData.dueDate, status: 'active' });
      } else if (form.dataset.moduleForm === 'contribution') {
        const goal = state.goals.find((item) => item.id === form.dataset.id);
        if (!goal) return;
        await saveModuleItem(currentUser.uid, 'goals', { ...goal, savedAmount: Number(goal.savedAmount || 0) + Number(formData.amount) });
      } else if (form.dataset.moduleForm === 'category') {
        await saveModuleItem(currentUser.uid, 'categories', { id: crypto.randomUUID(), name: formData.name.trim(), type: formData.type, icon: formData.icon, color: formData.color });
      } else if (form.dataset.moduleForm === 'admin-category') {
        await saveAdminItem('globalCategories', { id: crypto.randomUUID(), name: formData.name.trim(), type: formData.type, icon: formData.icon, color: formData.color });
      } else if (form.dataset.moduleForm === 'admin-plan') {
        await saveAdminItem('plans', { id: crypto.randomUUID(), name: formData.name.trim(), price: Number(formData.price), currency: formData.currency, description: formData.description.trim() });
      } else if (form.dataset.moduleForm === 'profile') {
        await updateDisplayName(currentUser, formData.displayName.trim(), formData.photoURL.trim());
        await saveUserSettings(currentUser, { phone: formData.phone.trim() });
      } else if (form.dataset.moduleForm === 'settings') {
        const settings = {
          phone: formData.phone.trim(), defaultCurrency: formData.defaultCurrency, theme: formData.theme,
          dateFormat: formData.dateFormat, firstDayOfWeek: formData.firstDayOfWeek,
          notifications: {
            budgetAlerts: form.elements.budgetAlerts.checked,
            goalReminders: form.elements.goalReminders.checked,
            weeklyReport: form.elements.weeklyReport.checked
          }
        };
        await updateDisplayName(currentUser, formData.displayName.trim());
        await saveUserSettings(currentUser, settings);
      }
      await refreshUserData();
      if (['settings', 'profile'].includes(form.dataset.moduleForm)) showToast(t('settingsSaved'));
    } catch (error) {
      showToast(t(toFirebaseErrorKey(error)));
    } finally {
      if (submit) submit.disabled = false;
    }
  });
  $('#module-content').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button || !currentUser) return;
    const { action, id } = button.dataset;
    if (action === 'open-profile') { await navigateToScreen('profile'); return; }
    if (action === 'profile-sign-out') {
      try { await logout(); }
      catch (error) { showToast(t(toFirebaseErrorKey(error))); }
      return;
    }
    if (action === 'new-transaction') { openTransactionEditor(); return; }
    if (action === 'admin-section') {
      adminSection = button.dataset.section;
      await navigateToScreen('admin', false);
      return;
    }
    if (action === 'open-filters') { $('#filter-dialog').showModal(); return; }
    if (action === 'focus-account-form') { $('#account-form-panel').scrollIntoView({ behavior: 'smooth' }); return; }
    if (action === 'export-transactions') { createExcelCompatibleExport(); return; }
    if (action === 'settings-reset-password') {
      try { await resetPassword(state.profile.email); showToast(t('resetEmailSent')); }
      catch (error) { showToast(t(toFirebaseErrorKey(error))); }
      return;
    }
    if (action === 'edit-transaction') { openTransactionEditor(id); return; }
    if (action === 'delete-transaction') {
      deletingTransactionId = id;
      const transaction = state.transactions.find((item) => item.id === id);
      $('#delete-description').textContent = `${transaction.title} · ${money(transaction.amount, transaction.currency, locale())}`;
      $('#delete-dialog').showModal();
      return;
    }
    const deleteCollection = { 'delete-account': 'accounts', 'delete-budget': 'budgets', 'delete-goal': 'goals', 'delete-category': 'categories', 'delete-admin-category': 'globalCategories', 'delete-admin-plan': 'plans' }[action];
    if (deleteCollection) {
      const source = { accounts: state.accounts, budgets: state.budgets, goals: state.goals, categories: state.categories, globalCategories: state.adminData.categories, plans: state.adminData.plans }[deleteCollection];
      const item = source.find((entry) => entry.id === id);
      pendingModuleDelete = { collection: deleteCollection, id, item };
      $('#delete-description').textContent = item?.name || item?.category || t(deleteCollection);
      $('#delete-dialog').showModal();
      return;
    }
    if (action === 'save-admin-user') {
      const row = button.closest('tr');
      const updates = { status: row.querySelector('[data-admin-field="status"]').value, plan: row.querySelector('[data-admin-field="plan"]').value };
      button.disabled = true;
      try { await updateAdminUser(id, updates); state.adminData = await loadAdminData(); state.adminUsers = state.adminData.users; await navigateToScreen('admin', false); }
      catch (error) { showToast(t(toFirebaseErrorKey(error))); }
      finally { button.disabled = false; }
    }
  });
  $('#top-avatar').addEventListener('click', () => { void navigateToScreen('profile'); });
  $('#open-register').addEventListener('click', () => openAuth('register'));
  $('#open-login').addEventListener('click', () => openAuth('login'));
  $('#close-auth').addEventListener('click', () => $('#auth-dialog').close());
  $('#auth-dialog').addEventListener('click', (event) => {
    if (event.target === $('#auth-dialog')) $('#auth-dialog').close();
  });
  document.querySelectorAll('.auth-mode-button').forEach((button) => button.addEventListener('click', () => setAuthMode(button.dataset.mode)));
  $('#forgot-password').addEventListener('click', async () => {
    const email = $('#auth-email').value.trim();
    if (!email) {
      $('#auth-feedback').textContent = t('enterEmailForReset');
      return;
    }
    try {
      await resetPassword(email);
      $('#auth-feedback').textContent = t('resetEmailSent');
    } catch (error) {
      $('#auth-feedback').textContent = t(toFirebaseErrorKey(error));
    }
  });
  $('#auth-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const registering = !$('.auth-mode-button[data-mode="register"]').classList.contains('selected') ? false : true;
    if (!form.checkValidity()) { form.reportValidity(); return; }
    if (registering && $('#auth-password').value !== $('#auth-confirm').value) {
      $('#auth-feedback').textContent = t('passwordMismatch');
      return;
    }
    if (registering && !$('#auth-consent').checked) {
      $('#auth-feedback').textContent = t('consentRequired');
      return;
    }
    const email = $('#auth-email').value.trim();
    const submitButton = event.currentTarget.querySelector('[type="submit"]');
    submitButton.disabled = true;
    $('#auth-feedback').textContent = '';
    try {
      const user = registering
        ? await registerWithEmail({ email, password: $('#auth-password').value, name: $('#auth-name').value.trim(), phone: $('#auth-phone').value.trim() })
        : await loginWithEmail(email, $('#auth-password').value);
      await handleAuthChange(user);
      $('#auth-form').reset();
      $('#auth-dialog').close();
      if (registering) showToast(t('verificationEmailSent'));
    } catch (error) {
      $('#auth-feedback').textContent = t(toFirebaseErrorKey(error));
    } finally {
      submitButton.disabled = false;
    }
  });
  $('#onboarding-content').addEventListener('click', (event) => {
    const choice = event.target.closest('[data-choice]');
    if (!choice) return;
    const value = choice.dataset.value;
    if (choice.dataset.choice === 'language') state.language = value;
    if (choice.dataset.choice === 'currency') state.defaultCurrency = value;
    if (choice.dataset.choice === 'account') state.firstAccount = value;
    if (choice.dataset.choice === 'template') state.categoryTemplate = value;
    if (choice.dataset.choice === 'account') state.firstAccountName = $('#first-account-name')?.value || '';
    save();
    renderOnboarding();
  });
  $('#onboarding-back').addEventListener('click', () => {
    if (state.onboardingStep > 0) state.onboardingStep -= 1;
    save();
    renderOnboarding();
  });
  async function finishOnboarding() {
    if (!currentUser) throw new Error('auth/no-current-user');
    const accountKeys = { card: 'accountCard', cash: 'accountCash', wallet: 'accountWallet', savings: 'accountSavings' };
    await saveOnboarding(currentUser, {
      language: state.language,
      currency: state.defaultCurrency,
      accountType: state.firstAccount,
      accountName: state.firstAccountName || t(accountKeys[state.firstAccount] || 'accountCard'),
      categoryTemplate: state.categoryTemplate
    });
    await applyUserData(currentUser, await loadUserData(currentUser));
  }

  $('#onboarding-next').addEventListener('click', async () => {
    if (state.onboardingStep === 2) state.firstAccountName = $('#first-account-name').value.trim();
    if (state.onboardingStep < 4) {
      state.onboardingStep += 1;
      save();
      renderOnboarding();
      return;
    }
    try {
      await finishOnboarding();
    } catch (error) {
      showToast(t(toFirebaseErrorKey(error)));
    }
  });
  $('#skip-onboarding').addEventListener('click', async () => {
    try {
      await finishOnboarding();
    } catch (error) {
      showToast(t(toFirebaseErrorKey(error)));
    }
  });
  const signOutUser = () => {
    logout().catch((error) => showToast(t(toFirebaseErrorKey(error))));
  };
  $('#logout-button').addEventListener('click', signOutUser);
  $('#onboarding-logout').addEventListener('click', signOutUser);
  showView('public');
  render();
  observeAuth((user) => { void handleAuthChange(user); }, (error) => showToast(t(toFirebaseErrorKey(error))));

  function signedAmount(transaction) {
    return transaction.type === 'income' ? transaction.amount : -transaction.amount;
  }
})();