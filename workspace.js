const moduleTitles = {
  transactions: 'transactions', accounts: 'accounts', budgets: 'budgets', goals: 'goals',
  reports: 'reports', categories: 'categories', profile: 'profile', settings: 'settings', admin: 'adminPanel'
};

const categoryPresets = [
  ['groceries', 'expense'], ['transport', 'expense'], ['home', 'expense'],
  ['health', 'expense'], ['leisure', 'expense'], ['salary', 'income'], ['freelance', 'income']
];

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

const money = (value, currency, locale) => new Intl.NumberFormat(locale, {
  style: 'currency', currency: currency || 'KZT', maximumFractionDigits: 0
}).format(Number(value || 0));

function screenHeading(t, title, description, action = '') {
  return `<header class="module-heading"><div><div class="section-kicker">${t('workspaceSection')}</div><h1>${t(title)}</h1><p>${t(description)}</p></div>${action}</header>`;
}

function transactionRows(transactions, accounts, t, locale) {
  if (!transactions.length) return `<tr><td colspan="6" class="table-empty">${t('noTransactions')}</td></tr>`;
  return [...transactions].sort((a, b) => b.date.localeCompare(a.date)).map((item) => {
    const account = accounts.find((entry) => entry.id === item.account);
    const icon = item.type === 'income' ? '↙' : '↗';
    const sign = item.type === 'income' ? '+' : '−';
    const tags = Array.isArray(item.tags) ? item.tags : [];
    return `<tr><td><span class="transaction-name"><span class="transaction-icon ${escapeHtml(item.category)}">${icon}</span><span><strong>${escapeHtml(item.title)}</strong><small>${t(item.type)}${item.comment ? ` · ${escapeHtml(item.comment)}` : ''}</small></span></span></td><td>${t(item.category)}${tags.length ? `<small class="module-subline">${tags.map((tag) => `#${escapeHtml(tag)}`).join(' ')}</small>` : ''}</td><td>${new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(`${item.date}T00:00:00`))}</td><td>${escapeHtml(account?.name || t('accountUnavailable'))}</td><td class="amount-cell ${item.type === 'income' ? 'transaction-income' : ''}">${sign}${money(item.amount, item.currency, locale)}</td><td class="row-actions"><button type="button" data-action="edit-transaction" data-id="${escapeHtml(item.id)}" title="${t('editTransaction')}" aria-label="${t('editTransaction')}">✎</button><button type="button" data-action="delete-transaction" data-id="${escapeHtml(item.id)}" title="${t('deleteTransaction')}" aria-label="${t('deleteTransaction')}">×</button></td></tr>`;
  }).join('');
}

export function renderWorkspaceScreen(screen, data) {
  const { t, profile = {}, accounts = [], transactions = [], budgets = [], goals = [], categories = [], adminUsers = [], adminData = {}, locale = 'ru-KZ', isAdmin = false, reportPeriod = 'month', adminSection = 'overview' } = data;
  const currency = profile.defaultCurrency || 'KZT';
  const categoryText = (key) => categories.find((item) => item.id === key)?.name || t(key);
  const addButton = `<button class="primary-button" type="button" data-action="new-transaction"><span>+</span>${t('addTransaction')}</button>`;

  if (screen === 'transactions') {
    const income = transactions.filter((item) => item.type === 'income').reduce((sum, item) => sum + Number(item.amount), 0);
    const expense = transactions.filter((item) => item.type === 'expense').reduce((sum, item) => sum + Number(item.amount), 0);
    return `${screenHeading(t, 'transactions', 'transactionsScreenDescription', addButton)}
      <div class="module-metrics"><article><span>${t('transactionsCountLabel')}</span><strong>${transactions.length}</strong></article><article><span>${t('incomeThisMonth')}</span><strong>${money(income, currency, locale)}</strong></article><article><span>${t('expensesThisMonth')}</span><strong>${money(expense, currency, locale)}</strong></article></div>
      <section class="panel module-panel"><div class="module-toolbar"><label class="search-box"><span>⌕</span><input id="module-transaction-search" type="search" placeholder="${t('searchTransactions')}"></label><button class="filter-button" type="button" data-action="open-filters">☷ ${t('filter')}</button></div><div class="transactions-table-wrap"><table class="transactions-table"><thead><tr><th>${t('transaction')}</th><th>${t('category')}</th><th>${t('date')}</th><th>${t('account')}</th><th class="amount-heading">${t('amount')}</th><th></th></tr></thead><tbody id="module-transaction-rows">${transactionRows(transactions, accounts, t, locale)}</tbody></table></div></section>`;
  }

  if (screen === 'accounts') {
    const balancesByCurrency = new Map();
    accounts.forEach((account) => balancesByCurrency.set(account.currency || currency, (balancesByCurrency.get(account.currency || currency) || 0) + Number(account.balance || 0)));
    const balancesSummary = [...balancesByCurrency].map(([code, amount]) => money(amount, code, locale)).join(' · ') || money(0, currency, locale);
    const accountCards = accounts.length ? accounts.map((account) => `<article class="module-item account-card"><div class="module-item-top"><span class="account-type-mark">${({ cash: '◉', card: '▣', wallet: '▤', savings: '◷' })[account.type] || '▣'}</span><button class="row-icon-button" type="button" data-action="delete-account" data-id="${escapeHtml(account.id)}" title="${t('deleteAccount')}" aria-label="${t('deleteAccount')}">×</button></div><span class="module-subline">${t(({ cash: 'accountCash', card: 'accountCard', wallet: 'accountWallet', savings: 'accountSavings' })[account.type] || 'accountCard')}</span><h2>${escapeHtml(account.name)}</h2><strong class="account-balance">${money(account.balance, account.currency, locale)}</strong><span class="account-currency">${account.currency}</span></article>`).join('') : `<div class="module-empty">${t('noAccounts')}</div>`;
    return `${screenHeading(t, 'accounts', 'accountsScreenDescription', `<button class="primary-button" type="button" data-action="focus-account-form">+ ${t('addAccount')}</button>`)}
      <div class="module-metrics"><article><span>${t('accountCount')}</span><strong>${accounts.length}</strong></article><article><span>${t('balancesByCurrency')}</span><strong class="metric-multi-value">${balancesSummary}</strong></article><article><span>${t('defaultCurrency')}</span><strong>${currency}</strong></article></div>
      <section class="account-grid">${accountCards}</section>
      <section class="panel module-panel module-form-panel" id="account-form-panel"><div class="section-kicker">${t('newAccount')}</div><form class="module-form" data-module-form="account"><label>${t('accountName')}<input name="name" required maxlength="40" placeholder="${t('accountNameExample')}"></label><label>${t('accountType')}<select name="type"><option value="card">${t('accountCard')}</option><option value="cash">${t('accountCash')}</option><option value="wallet">${t('accountWallet')}</option><option value="savings">${t('accountSavings')}</option></select></label><label>${t('currency')}<select name="currency">${['KZT','RUB','USD','EUR'].map((value) => `<option value="${value}" ${value === currency ? 'selected' : ''}>${value}</option>`).join('')}</select></label><button class="primary-button" type="submit">${t('saveAccount')}</button></form></section>`;
  }

  if (screen === 'budgets') {
    const budgetItems = budgets.map((budget) => {
      const relevant = transactions.filter((item) => item.type === 'expense' && item.category === budget.category && (budget.period === 'week' ? item.date >= new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10) : item.date.slice(0, 7) === new Date().toISOString().slice(0, 7)) && (item.currency || currency) === budget.currency);
      const spent = relevant.reduce((sum, item) => sum + Number(item.amount), 0);
      const percent = Math.min(100, Math.round(spent / Number(budget.limit || 1) * 100));
      return `<article class="module-item budget-card"><div class="module-item-top"><span class="budget-category"><i class="budget-dot blue"></i>${escapeHtml(categoryText(budget.category))}</span><button class="row-icon-button" type="button" data-action="delete-budget" data-id="${escapeHtml(budget.id)}" aria-label="${t('deleteBudget')}">×</button></div><div class="progress-track"><span class="progress-fill ${percent > 90 ? 'orange' : 'blue'}" style="width:${percent}%"></span></div><div class="budget-meta"><span>${money(spent, budget.currency, locale)} / ${money(budget.limit, budget.currency, locale)}</span><strong>${percent}%</strong></div><small>${t(budget.period === 'week' ? 'weekly' : 'monthly')} · ${budget.alertsEnabled ? t('alertsEnabled') : t('alertsDisabled')}</small></article>`;
    }).join('');
    return `${screenHeading(t, 'budgets', 'budgetsScreenDescription')}
      <div class="module-metrics"><article><span>${t('activeBudgets')}</span><strong>${budgets.length}</strong></article><article><span>${t('monthlyBudgetSpend')}</span><strong>${money(transactions.filter((item) => item.type === 'expense').reduce((sum, item) => sum + Number(item.amount), 0), currency, locale)}</strong></article></div>
      <section class="budget-grid">${budgetItems || `<div class="module-empty">${t('noBudgets')}</div>`}</section>
      <section class="panel module-panel module-form-panel"><div class="section-kicker">${t('newBudget')}</div><form class="module-form" data-module-form="budget"><label>${t('category')}<select name="category" required>${categoryPresets.filter(([, type]) => type === 'expense').map(([key]) => `<option value="${key}">${t(key)}</option>`).join('')}</select></label><label>${t('budgetLimit')}<input name="limit" type="number" min="1" required></label><label>${t('period')}<select name="period"><option value="month">${t('monthly')}</option><option value="week">${t('weekly')}</option></select></label><label>${t('currency')}<select name="currency">${['KZT','RUB','USD','EUR'].map((value) => `<option value="${value}" ${value === currency ? 'selected' : ''}>${value}</option>`).join('')}</select></label><label class="toggle-field"><input name="alertsEnabled" type="checkbox" checked>${t('budgetAlerts')}</label><button class="primary-button" type="submit">${t('saveBudget')}</button></form></section>`;
  }

  if (screen === 'goals') {
    const goalItems = goals.map((goal) => {
      const saved = Number(goal.savedAmount || 0);
      const target = Number(goal.targetAmount || 1);
      const percent = Math.min(100, Math.round(saved / target * 100));
      const months = Math.max(1, Math.ceil((new Date(goal.dueDate) - new Date()) / (30 * 24 * 60 * 60 * 1000)));
      const suggested = Math.max(0, Math.ceil((target - saved) / months));
      return `<article class="module-item goal-card"><div class="module-item-top"><span class="goal-mark">◎</span><button class="row-icon-button" type="button" data-action="delete-goal" data-id="${escapeHtml(goal.id)}" aria-label="${t('deleteGoal')}">×</button></div><h2>${escapeHtml(goal.name)}</h2><div class="goal-progress-copy"><strong>${percent}%</strong><span>${t('targetDate')}: ${escapeHtml(goal.dueDate)}</span></div><div class="progress-track"><span class="progress-fill green" style="width:${percent}%"></span></div><div class="budget-meta"><span>${money(saved, goal.currency, locale)} / ${money(target, goal.currency, locale)}</span><small>${t('monthlySuggestion')}: ${money(suggested, goal.currency, locale)}</small></div><form class="inline-form" data-module-form="contribution" data-id="${escapeHtml(goal.id)}"><input name="amount" type="number" min="1" required placeholder="${t('contributionAmount')}"><button class="text-button" type="submit">+ ${t('addContribution')}</button></form></article>`;
    }).join('');
    const savedByCurrency = new Map();
    goals.forEach((goal) => savedByCurrency.set(goal.currency || currency, (savedByCurrency.get(goal.currency || currency) || 0) + Number(goal.savedAmount || 0)));
    const savingsSummary = [...savedByCurrency].map(([code, amount]) => money(amount, code, locale)).join(' · ') || money(0, currency, locale);
    return `${screenHeading(t, 'goals', 'goalsScreenDescription')}
      <div class="module-metrics"><article><span>${t('activeGoals')}</span><strong>${goals.length}</strong></article><article><span>${t('savingsTotal')}</span><strong class="metric-multi-value">${savingsSummary}</strong></article></div>
      <section class="goal-grid">${goalItems || `<div class="module-empty">${t('noGoals')}</div>`}</section>
      <section class="panel module-panel module-form-panel"><div class="section-kicker">${t('newGoal')}</div><form class="module-form" data-module-form="goal"><label>${t('goalName')}<input name="name" required maxlength="60"></label><label>${t('targetAmount')}<input name="targetAmount" type="number" min="1" required></label><label>${t('targetDate')}<input name="dueDate" type="date" required></label><label>${t('currency')}<select name="currency">${['KZT','RUB','USD','EUR'].map((value) => `<option value="${value}" ${value === currency ? 'selected' : ''}>${value}</option>`).join('')}</select></label><button class="primary-button" type="submit">${t('saveGoal')}</button></form></section>`;
  }

  if (screen === 'categories') {
    const defaults = categoryPresets.map(([key, type]) => `<div class="category-row"><span class="category-dot ${key}"></span><strong>${t(key)}</strong><span class="module-subline">${t(type)}</span><span class="category-preset-label">${t('presetCategory')}</span></div>`).join('');
    const custom = categories.map((category) => `<div class="category-row"><span class="category-dot" style="background:${escapeHtml(category.color)}"></span><strong>${escapeHtml(category.name)}</strong><span class="module-subline">${t(category.type)}</span><span>${escapeHtml(category.icon)}</span><button class="row-icon-button" type="button" data-action="delete-category" data-id="${escapeHtml(category.id)}" aria-label="${t('deleteCategory')}">×</button></div>`).join('');
    return `${screenHeading(t, 'categories', 'categoriesScreenDescription')}
      <section class="panel module-panel"><div class="section-kicker">${t('presetCategories')}</div>${defaults}</section>
      <section class="panel module-panel"><div class="section-kicker">${t('customCategories')}</div>${custom || `<div class="module-empty">${t('noCustomCategories')}</div>`}<form class="module-form" data-module-form="category"><label>${t('categoryName')}<input name="name" required maxlength="32"></label><label>${t('type')}<select name="type"><option value="expense">${t('expense')}</option><option value="income">${t('income')}</option></select></label><label>${t('icon')}<input name="icon" maxlength="4" value="◇"></label><label>${t('color')}<input name="color" type="color" value="#6f91bd"></label><button class="primary-button" type="submit">${t('saveCategory')}</button></form></section>`;
  }

  if (screen === 'reports') {
    const end = new Date();
    const start = new Date(end);
    if (reportPeriod === 'day') start.setHours(0, 0, 0, 0);
    if (reportPeriod === 'week') start.setDate(start.getDate() - 6);
    if (reportPeriod === 'month') start.setDate(1);
    if (reportPeriod === 'year') start.setMonth(0, 1);
    const days = Math.max(1, Math.floor((end - start) / 86400000) + 1);
    const previousEnd = new Date(start.getTime() - 86400000);
    const previousStart = new Date(previousEnd.getTime() - (days - 1) * 86400000);
    const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const currentStartKey = dateKey(start);
    const currentEndKey = dateKey(end);
    const previousStartKey = dateKey(previousStart);
    const previousEndKey = dateKey(previousEnd);
    const periodTransactions = transactions.filter((item) => (item.currency || currency) === currency && item.date >= currentStartKey && item.date <= currentEndKey);
    const previousTransactions = transactions.filter((item) => (item.currency || currency) === currency && item.date >= previousStartKey && item.date <= previousEndKey);
    const expenses = periodTransactions.filter((item) => item.type === 'expense');
    const totals = new Map();
    expenses.forEach((item) => totals.set(item.category, (totals.get(item.category) || 0) + Number(item.amount)));
    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const total = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
    const previousTotal = previousTransactions.filter((item) => item.type === 'expense').reduce((sum, item) => sum + Number(item.amount), 0);
    const comparison = previousTotal ? Math.round((total - previousTotal) / previousTotal * 100) : null;
    const bars = ranked.map(([category, value]) => `<div class="report-row"><span>${escapeHtml(categoryText(category))}</span><div class="progress-track"><span class="progress-fill blue" style="width:${total ? value / total * 100 : 0}%"></span></div><strong>${money(value, currency, locale)}</strong></div>`).join('');
    const exportButton = `<div class="report-actions"><label class="period-select"><span class="sr-only">${t('period')}</span><select id="reports-period">${['day','week','month','year'].map((period) => `<option value="${period}" ${reportPeriod === period ? 'selected' : ''}>${t(({ day: 'daily', week: 'weekly', month: 'monthly', year: 'yearly' })[period])}</option>`).join('')}</select></label><button class="filter-button" type="button" data-action="export-transactions">⇩ ${t('exportExcel')}</button></div>`;
    return `${screenHeading(t, 'reports', 'reportsScreenDescription', exportButton)}
      <div class="module-metrics"><article><span>${t('totalExpenses')}</span><strong>${money(total, currency, locale)}</strong><small class="module-subline">${comparison === null ? t('noPreviousPeriodData') : `${comparison > 0 ? '+' : ''}${comparison}% ${t('vsPreviousPeriod')}`}</small></article><article><span>${t('averageDailyExpense')}</span><strong>${money(total / days, currency, locale)}</strong></article><article><span>${t('topCategory')}</span><strong>${ranked[0] ? escapeHtml(categoryText(ranked[0][0])) : '—'}</strong></article></div>
      <section class="report-grid"><article class="panel module-panel"><div class="section-kicker">${t('categoryBreakdown')} · ${currency}</div>${bars || `<div class="module-empty">${t('noReportData')}</div>`}<small class="module-subline">${t('reportCurrencyNote')}</small></article><article class="panel module-panel"><div class="section-kicker">${t('periodSummary')} · ${currency}</div><div class="report-stat"><span>${t('incomeThisMonth')}</span><strong>${money(periodTransactions.filter((item) => item.type === 'income').reduce((sum, item) => sum + Number(item.amount), 0), currency, locale)}</strong></div><div class="report-stat"><span>${t('expensesThisMonth')}</span><strong>${money(total, currency, locale)}</strong></div><div class="report-stat"><span>${t('netBalance')}</span><strong>${money(periodTransactions.reduce((sum, item) => sum + (item.type === 'income' ? 1 : -1) * Number(item.amount), 0), currency, locale)}</strong></div></article></section>`;
  }

  if (screen === 'profile') {
    const createdAt = profile.createdAt?.toDate ? profile.createdAt.toDate() : null;
    const avatar = typeof profile.photoURL === 'string' && profile.photoURL.startsWith('https://')
      ? `<img src="${escapeHtml(profile.photoURL)}" alt="">`
      : escapeHtml((profile.name || 'U').slice(0, 1).toLocaleUpperCase(locale));
    return `${screenHeading(t, 'profile', 'profileScreenDescription')}
      <section class="panel module-panel profile-panel"><div class="profile-hero"><div class="profile-large-avatar">${avatar}</div><div><span class="section-kicker">${t('personalAccount')}</span><h2>${escapeHtml(profile.name || '')}</h2><span class="profile-email">${escapeHtml(profile.email || '')}</span></div><span class="profile-status ${profile.status === 'blocked' ? 'blocked' : ''}">${t(profile.status === 'blocked' ? 'statusBlocked' : 'statusActive')}</span></div><div class="profile-facts"><div><span>${t('emailVerified')}</span><strong>${profile.emailVerified ? t('yes') : t('no')}</strong></div><div><span>${t('phone')}</span><strong>${escapeHtml(profile.phone || '—')}</strong></div><div><span>${t('profileRole')}</span><strong>${t(profile.role === 'admin' ? 'adminRole' : 'userRole')}</strong></div><div><span>${t('plan')}</span><strong>${escapeHtml(profile.plan || 'free')}</strong></div><div><span>${t('defaultCurrency')}</span><strong>${escapeHtml(profile.defaultCurrency || currency)}</strong></div><div><span>${t('memberSince')}</span><strong>${createdAt ? new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric' }).format(createdAt) : '—'}</strong></div></div></section>
      <section class="panel module-panel settings-card"><div class="section-kicker">${t('editProfile')}</div><form class="module-form profile-form" data-module-form="profile"><label>${t('yourName')}<input name="displayName" value="${escapeHtml(profile.name || '')}" required maxlength="50"></label><label>${t('phone')}<input name="phone" value="${escapeHtml(profile.phone || '')}" maxlength="24"></label><label>${t('photoURL')}<input name="photoURL" type="url" value="${escapeHtml(profile.photoURL || '')}" placeholder="https://"></label><button class="primary-button" type="submit">${t('saveSettings')}</button></form><button class="profile-signout-button" type="button" data-action="profile-sign-out">${t('signOutAccount')}</button></section>`;
  }

  if (screen === 'settings') {
    const notifications = profile.notifications || {};
    return `${screenHeading(t, 'settings', 'settingsScreenDescription')}
      <section class="panel module-panel settings-card"><div class="section-kicker">${t('personalData')}</div><form class="module-form" data-module-form="settings"><label>${t('yourName')}<input name="displayName" value="${escapeHtml(profile.name)}" required maxlength="50"></label><label>${t('email')}<input value="${escapeHtml(profile.email)}" disabled></label><label>${t('phone')}<input name="phone" value="${escapeHtml(profile.phone || '')}" maxlength="24"></label><label>${t('defaultCurrency')}<select name="defaultCurrency">${['KZT','RUB','USD','EUR'].map((value) => `<option value="${value}" ${value === currency ? 'selected' : ''}>${value}</option>`).join('')}</select></label><label>${t('theme')}<select name="theme"><option value="light" ${profile.theme !== 'dark' ? 'selected' : ''}>${t('lightTheme')}</option><option value="dark" ${profile.theme === 'dark' ? 'selected' : ''}>${t('darkTheme')}</option></select></label><label>${t('dateFormat')}<select name="dateFormat"><option value="DD.MM.YYYY" ${profile.dateFormat !== 'MM/DD/YYYY' ? 'selected' : ''}>DD.MM.YYYY</option><option value="MM/DD/YYYY" ${profile.dateFormat === 'MM/DD/YYYY' ? 'selected' : ''}>MM/DD/YYYY</option></select></label><label>${t('firstDayOfWeek')}<select name="firstDayOfWeek"><option value="monday">${t('monday')}</option><option value="sunday" ${profile.firstDayOfWeek === 'sunday' ? 'selected' : ''}>${t('sunday')}</option></select></label><div class="notification-settings"><span class="section-kicker">${t('notifications')}</span>${[['budgetAlerts', 'budgetAlerts'], ['goalReminders', 'goalReminders'], ['weeklyReport', 'weeklyReport']].map(([field, label]) => `<label class="toggle-field"><input name="${field}" type="checkbox" ${notifications[field] ? 'checked' : ''}>${t(label)}</label>`).join('')}</div><button class="primary-button" type="submit">${t('saveSettings')}</button></form><button class="text-button reset-password-button" type="button" data-action="settings-reset-password">${t('changePassword')}</button></section>`;
  }

  if (screen === 'admin') {
    if (!isAdmin) return `${screenHeading(t, 'adminPanel', 'adminScreenDescription')}<section class="panel module-panel"><div class="module-empty">${t('adminForbidden')}</div></section>`;
    const sections = ['overview', 'users', 'categories', 'plans', 'logs'];
    const tabs = `<div class="admin-tabs" role="tablist">${sections.map((section) => `<button type="button" role="tab" aria-selected="${adminSection === section}" class="admin-tab ${adminSection === section ? 'active' : ''}" data-action="admin-section" data-section="${section}">${t(({ overview: 'adminStats', users: 'adminUsers', categories: 'adminGlobalCategories', plans: 'adminPlans', logs: 'adminLogs' })[section])}</button>`).join('')}</div>`;
    const rows = adminUsers.map((user) => `<tr><td>${escapeHtml(user.displayName || user.email || user.uid)}</td><td>${escapeHtml(user.email || '')}</td><td><select class="admin-table-select" data-admin-field="status" data-id="${escapeHtml(user.uid)}"><option value="active" ${user.status === 'active' ? 'selected' : ''}>active</option><option value="blocked" ${user.status === 'blocked' ? 'selected' : ''}>blocked</option></select></td><td><select class="admin-table-select" data-admin-field="plan" data-id="${escapeHtml(user.uid)}"><option value="free" ${user.plan === 'free' ? 'selected' : ''}>free</option><option value="premium" ${user.plan === 'premium' ? 'selected' : ''}>premium</option></select></td><td>${user.emailVerified ? '✓' : '—'}</td><td><button class="admin-save-button" type="button" data-action="save-admin-user" data-id="${escapeHtml(user.uid)}">${t('saveChanges')}</button></td></tr>`).join('');
    const operationsByCurrency = new Map();
    adminUsers.forEach((user) => {
      const code = user.defaultCurrency || currency;
      operationsByCurrency.set(code, (operationsByCurrency.get(code) || 0) + Number(user.monthlyIncome || 0) + Number(user.monthlyExpense || 0));
    });
    const operations = [...operationsByCurrency].map(([code, amount]) => money(amount, code, locale)).join(' · ') || money(0, currency, locale);
    const userCount = adminUsers.filter((user) => {
      const created = user.createdAt?.toDate ? user.createdAt.toDate() : user.createdAt ? new Date(user.createdAt) : null;
      return created && created.getFullYear() === new Date().getFullYear() && created.getMonth() === new Date().getMonth();
    }).length;
    const adminBody = adminSection === 'users' ? `<section class="panel module-panel"><div class="transactions-table-wrap"><table class="transactions-table"><thead><tr><th>${t('yourName')}</th><th>${t('email')}</th><th>${t('status')}</th><th>${t('plan')}</th><th>${t('emailVerified')}</th><th>${t('actions')}</th></tr></thead><tbody>${rows || `<tr><td colspan="6" class="table-empty">${t('noUsers')}</td></tr>`}</tbody></table></div></section>`
      : adminSection === 'categories' ? `<section class="panel module-panel"><div class="section-kicker">${t('adminGlobalCategories')}</div>${(adminData.categories || []).map((item) => `<div class="category-row"><span class="category-dot" style="background:${escapeHtml(item.color)}"></span><strong>${escapeHtml(item.name)}</strong><span>${t(item.type)}</span><span>${escapeHtml(item.icon)}</span><button type="button" class="row-icon-button admin-delete-button" data-action="delete-admin-category" data-id="${escapeHtml(item.id)}" aria-label="${t('deleteCategory')}">×</button></div>`).join('')}<form class="module-form" data-module-form="admin-category"><label>${t('categoryName')}<input name="name" required></label><label>${t('type')}<select name="type"><option value="expense">${t('expense')}</option><option value="income">${t('income')}</option></select></label><label>${t('icon')}<input name="icon" value="◇" maxlength="4"></label><label>${t('color')}<input name="color" value="#6f91bd" type="color"></label><button class="primary-button" type="submit">${t('saveCategory')}</button></form></section>`
      : adminSection === 'plans' ? `<section class="panel module-panel"><div class="section-kicker">${t('adminPlans')}</div>${(adminData.plans || []).map((plan) => `<div class="category-row"><strong>${escapeHtml(plan.name)}</strong><span>${money(plan.price, plan.currency, locale)}</span><span>${escapeHtml(plan.description || '')}</span><button type="button" class="row-icon-button admin-delete-button" data-action="delete-admin-plan" data-id="${escapeHtml(plan.id)}" aria-label="${t('deletePlan')}">×</button></div>`).join('')}<form class="module-form" data-module-form="admin-plan"><label>${t('planName')}<input name="name" required></label><label>${t('price')}<input name="price" type="number" min="0" required></label><label>${t('currency')}<select name="currency">${['KZT','RUB','USD','EUR'].map((value) => `<option value="${value}">${value}</option>`).join('')}</select></label><label>${t('description')}<input name="description"></label><button class="primary-button" type="submit">${t('savePlan')}</button></form></section>`
      : adminSection === 'logs' ? `<section class="panel module-panel"><div class="transactions-table-wrap"><table class="transactions-table"><thead><tr><th>${t('date')}</th><th>${t('adminAction')}</th><th>${t('adminActor')}</th><th>${t('adminTarget')}</th></tr></thead><tbody>${(adminData.logs || []).map((log) => `<tr><td>${log.createdAt?.toDate ? new Intl.DateTimeFormat(locale).format(log.createdAt.toDate()) : '—'}</td><td>${escapeHtml(log.action)}</td><td>${escapeHtml(log.actorUid)}</td><td>${escapeHtml(log.targetId)}</td></tr>`).join('') || `<tr><td colspan="4" class="table-empty">${t('noLogs')}</td></tr>`}</tbody></table></div></section>`
      : `<div class="module-metrics"><article><span>${t('usersTotal')}</span><strong>${adminUsers.length}</strong></article><article><span>${t('newUsersThisMonth')}</span><strong>${userCount}</strong></article><article><span>${t('operationsVolume')}</span><strong class="metric-multi-value">${operations}</strong></article></div><section class="panel module-panel"><div class="section-kicker">${t('adminAccess')}</div><p class="module-subline">${t('verifiedAdminClaim')}</p></section>`;
    return `${screenHeading(t, 'adminPanel', 'adminScreenDescription')}${tabs}${adminBody}`;
  }

  return `${screenHeading(t, moduleTitles[screen] || 'dashboard', 'moduleComingSoon')}<section class="panel module-panel"><div class="module-empty">${t('moduleComingSoon')}</div></section>`;
}

export { moduleTitles };
