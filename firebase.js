import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBJlUcfBck-YP6vXJ5Rld-lZlcXsCYPJFg',
  authDomain: 'tenge-tracker.firebaseapp.com',
  projectId: 'tenge-tracker',
  storageBucket: 'tenge-tracker.firebasestorage.app',
  messagingSenderId: '915669776723',
  appId: '1:915669776723:web:eb02cea1197abbbabfc9a6'
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const db = getFirestore(app);
const emulatorRequested = new URLSearchParams(window.location.search).get('emulator') === '1';
const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
if (emulatorRequested && !localHost) {
  throw new Error('Firebase Emulator mode is only available on localhost.');
}
if (emulatorRequested) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
const bootstrapAdminEmail = 'admin123@gmail.com';

async function hasAdminAccess(user = auth.currentUser) {
  if (!user) return false;
  if (user.email?.trim().toLowerCase() === bootstrapAdminEmail) return true;
  const token = await user.getIdTokenResult();
  return token.claims.admin === true;
}

async function requireAdmin() {
  if (!(await hasAdminAccess())) throw new Error('admin/forbidden');
}

const userRef = (uid) => doc(db, 'users', uid);
const accountsRef = (uid) => collection(db, 'users', uid, 'accounts');
const transactionsRef = (uid) => collection(db, 'users', uid, 'transactions');
const moduleCollectionRef = (uid, collectionName) => collection(db, 'users', uid, collectionName);
const transactionRef = (uid, id) => doc(db, 'users', uid, 'transactions', id);
const accountRef = (uid, id) => doc(db, 'users', uid, 'accounts', id);
const signedAmount = (item) => item.type === 'income' ? Number(item.amount) : -Number(item.amount);
const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};
const inCurrentMonth = (item) => item?.date?.slice(0, 7) === currentMonth();

function newUserDocument(user, name, phone = '') {
  const bootstrapAdmin = user.email?.trim().toLowerCase() === bootstrapAdminEmail;
  return {
    uid: user.uid,
    email: user.email || '',
    phone,
    displayName: name,
    photoURL: user.photoURL || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastLogin: serverTimestamp(),
    language: 'ru',
    defaultCurrency: 'KZT',
    theme: 'light',
    dateFormat: 'DD.MM.YYYY',
    firstDayOfWeek: 'monday',
    notifications: { budgetAlerts: true, goalReminders: true, weeklyReport: false },
    totalBalance: 0,
    monthlyIncome: 0,
    monthlyExpense: 0,
    savingsTotal: 0,
    activeGoalsCount: 0,
    activeBudgetsCount: 0,
    role: bootstrapAdmin ? 'admin' : 'user',
    status: 'active',
    plan: 'free',
    emailVerified: user.emailVerified,
    onboardingCompleted: false
  };
}

export async function registerWithEmail({ email, password, name, phone }) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName: name });
  await setDoc(userRef(credential.user.uid), newUserDocument(credential.user, name, phone));
  await sendEmailVerification(credential.user);
  return credential.user;
}

export async function loginWithEmail(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const reference = userRef(credential.user.uid);
  const profileSnapshot = await getDoc(reference);
  if (!profileSnapshot.exists()) {
    await setDoc(reference, newUserDocument(credential.user, credential.user.displayName || email.split('@')[0]));
  } else {
    const bootstrapAdmin = credential.user.email?.trim().toLowerCase() === bootstrapAdminEmail;
    await updateDoc(reference, { lastLogin: serverTimestamp(), emailVerified: credential.user.emailVerified, ...(bootstrapAdmin ? { role: 'admin' } : {}), updatedAt: serverTimestamp() });
  }
  return credential.user;
}

export async function loadUserData(user) {
  const reference = userRef(user.uid);
  let profileSnapshot = await getDoc(reference);
  if (!profileSnapshot.exists()) {
    await setDoc(reference, newUserDocument(user, user.displayName || user.email?.split('@')[0] || ''));
    profileSnapshot = await getDoc(reference);
  } else if (profileSnapshot.data().emailVerified !== user.emailVerified) {
    await updateDoc(reference, { emailVerified: user.emailVerified, updatedAt: serverTimestamp() });
    profileSnapshot = await getDoc(reference);
  }
  if (user.email?.trim().toLowerCase() === bootstrapAdminEmail && profileSnapshot.data().role !== 'admin') {
    await updateDoc(reference, { role: 'admin', updatedAt: serverTimestamp() });
    profileSnapshot = await getDoc(reference);
  }
  const [accountSnapshot, transactionSnapshot, budgetSnapshot, goalSnapshot, categorySnapshot] = await Promise.all([
    getDocs(accountsRef(user.uid)),
    getDocs(query(transactionsRef(user.uid), orderBy('date', 'desc'))),
    getDocs(moduleCollectionRef(user.uid, 'budgets')),
    getDocs(moduleCollectionRef(user.uid, 'goals')),
    getDocs(moduleCollectionRef(user.uid, 'categories'))
  ]);
  return {
    profile: profileSnapshot.data(),
    accounts: accountSnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })),
    transactions: transactionSnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })),
    budgets: budgetSnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })),
    goals: goalSnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })),
    categories: categorySnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))
  };
}

export async function saveOnboarding(user, values) {
  const primaryAccountRef = accountRef(user.uid, 'primary');
  const accountSnapshot = await getDoc(primaryAccountRef);
  if (!accountSnapshot.exists()) {
    await setDoc(primaryAccountRef, {
      name: values.accountName,
      type: values.accountType,
      currency: values.currency,
      balance: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }

  const profileReference = userRef(user.uid);
  const profileSnapshot = await getDoc(profileReference);
  const isDemoAccount = user.email?.trim().toLowerCase() === 'nurali@gmail.com';
  if (isDemoAccount && profileSnapshot.data()?.demoDataSeeded !== true) {
    await seedDemoData(user, values);
    return;
  }

  await updateDoc(profileReference, {
    language: values.language,
    defaultCurrency: values.currency,
    categoryTemplate: values.categoryTemplate,
    onboardingCompleted: true,
    updatedAt: serverTimestamp()
  });
}

async function seedDemoData(user, values) {
  const currency = values.currency;
  const now = new Date();
  const dateDaysAgo = (days) => {
    const date = new Date(now);
    date.setDate(date.getDate() - Math.min(days, now.getDate() - 1));
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const primaryAccount = { id: 'primary', name: values.accountName, type: values.accountType, currency, openingBalance: 180000 };
  const cashAccount = { id: 'demo-cash', name: 'Наличные', type: 'cash', currency, openingBalance: 27000 };
  const savingsAccount = { id: 'demo-savings', name: 'Накопления', type: 'savings', currency, openingBalance: 87000 };
  const transactions = [
    { id: 'demo-salary', title: 'Зарплата', category: 'salary', account: primaryAccount.id, amount: 320000, type: 'income', daysAgo: 6, comment: 'Демо-операция' },
    { id: 'demo-groceries-1', title: 'Продукты на неделю', category: 'groceries', account: primaryAccount.id, amount: 18500, type: 'expense', daysAgo: 5 },
    { id: 'demo-transport-1', title: 'Проездной', category: 'transport', account: primaryAccount.id, amount: 6500, type: 'expense', daysAgo: 4 },
    { id: 'demo-home', title: 'Покупки для дома', category: 'home', account: primaryAccount.id, amount: 12000, type: 'expense', daysAgo: 3 },
    { id: 'demo-freelance', title: 'Проект фриланс', category: 'freelance', account: primaryAccount.id, amount: 85000, type: 'income', daysAgo: 2 },
    { id: 'demo-health', title: 'Аптека', category: 'health', account: primaryAccount.id, amount: 7300, type: 'expense', daysAgo: 2 },
    { id: 'demo-groceries-2', title: 'Покупки в магазине', category: 'groceries', account: primaryAccount.id, amount: 21400, type: 'expense', daysAgo: 1 },
    { id: 'demo-leisure', title: 'Кино и кофе', category: 'leisure', account: primaryAccount.id, amount: 9800, type: 'expense', daysAgo: 1 },
    { id: 'demo-cash-expense', title: 'Такси', category: 'transport', account: cashAccount.id, amount: 3500, type: 'expense', daysAgo: 1 }
  ].map((transaction) => ({ ...transaction, date: dateDaysAgo(transaction.daysAgo), currency }));
  const primaryBalance = primaryAccount.openingBalance + transactions
    .filter((transaction) => transaction.account === primaryAccount.id)
    .reduce((balance, transaction) => balance + signedAmount(transaction), 0);
  const cashBalance = cashAccount.openingBalance + transactions
    .filter((transaction) => transaction.account === cashAccount.id)
    .reduce((balance, transaction) => balance + signedAmount(transaction), 0);
  const totalBalance = primaryBalance + cashBalance + savingsAccount.openingBalance;
  const monthlyIncome = transactions.filter((transaction) => transaction.type === 'income').reduce((sum, transaction) => sum + transaction.amount, 0);
  const monthlyExpense = transactions.filter((transaction) => transaction.type === 'expense').reduce((sum, transaction) => sum + transaction.amount, 0);

  const accountBatch = writeBatch(db);
  accountBatch.set(accountRef(user.uid, primaryAccount.id), {
    name: primaryAccount.name, type: primaryAccount.type, currency, balance: primaryBalance,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
  accountBatch.set(accountRef(user.uid, cashAccount.id), {
    name: cashAccount.name, type: cashAccount.type, currency, balance: cashBalance,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
  accountBatch.set(accountRef(user.uid, savingsAccount.id), {
    name: savingsAccount.name, type: savingsAccount.type, currency, balance: savingsAccount.openingBalance,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
  await accountBatch.commit();

  const batch = writeBatch(db);
  transactions.forEach(({ id, ...transaction }) => {
    batch.set(transactionRef(user.uid, id), { ...transaction, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  });
  const categories = [
    ['groceries', 'Продукты', 'expense', '✳', '#6f91bd'],
    ['transport', 'Транспорт', 'expense', '↗', '#82a4c9'],
    ['home', 'Дом и быт', 'expense', '⌂', '#c39a7b'],
    ['health', 'Здоровье', 'expense', '＋', '#7eae9b'],
    ['leisure', 'Отдых', 'expense', '◌', '#a58fbd'],
    ['salary', 'Зарплата', 'income', '↙', '#70a68c'],
    ['freelance', 'Фриланс', 'income', '◇', '#6f91bd']
  ];
  categories.forEach(([id, name, type, icon, color]) => {
    batch.set(doc(moduleCollectionRef(user.uid, 'categories'), id), { name, type, icon, color, createdAt: serverTimestamp() });
  });
  [
    ['demo-budget-groceries', 'groceries', 90000],
    ['demo-budget-transport', 'transport', 35000],
    ['demo-budget-home', 'home', 50000],
    ['demo-budget-health', 'health', 25000]
  ].forEach(([id, category, limit]) => {
    batch.set(doc(moduleCollectionRef(user.uid, 'budgets'), id), {
      category, limit, period: 'month', currency, alertsEnabled: true, status: 'active', createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
  });
  const goalId = 'demo-travel-goal';
  batch.set(doc(moduleCollectionRef(user.uid, 'goals'), goalId), {
    name: 'Путешествие', targetAmount: 800000, savedAmount: savingsAccount.openingBalance,
    currency, dueDate: `${now.getFullYear() + 1}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
    status: 'active', createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
  batch.update(userRef(user.uid), {
    language: values.language,
    defaultCurrency: currency,
    categoryTemplate: values.categoryTemplate,
    onboardingCompleted: true,
    demoDataSeeded: true,
    totalBalance,
    monthlyIncome,
    monthlyExpense,
    savingsTotal: savingsAccount.openingBalance,
    activeGoalsCount: 1,
    activeBudgetsCount: 4,
    updatedAt: serverTimestamp()
  });
  await batch.commit();
}

export async function saveUserSettings(user, settings) {
  await updateDoc(userRef(user.uid), { ...settings, updatedAt: serverTimestamp() });
}

export async function updateDisplayName(user, displayName, photoURL = user.photoURL || '') {
  await updateProfile(user, { displayName, photoURL });
  await updateDoc(userRef(user.uid), { displayName, photoURL, updatedAt: serverTimestamp() });
}

export async function loadModuleItems(userId, collectionName) {
  const snapshot = await getDocs(moduleCollectionRef(userId, collectionName));
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
}

export async function saveModuleItem(userId, collectionName, item) {
  const id = item.id || crypto.randomUUID();
  const { id: itemId, ...data } = item;
  await setDoc(doc(moduleCollectionRef(userId, collectionName), id), { ...data, updatedAt: serverTimestamp(), createdAt: item.createdAt || serverTimestamp() });
  if (collectionName === 'budgets' || collectionName === 'goals') {
    const items = await loadModuleItems(userId, collectionName);
    const countKey = collectionName === 'budgets' ? 'activeBudgetsCount' : 'activeGoalsCount';
    await updateDoc(userRef(userId), { [countKey]: items.filter((entry) => entry.status !== 'completed').length, updatedAt: serverTimestamp() });
  }
  return { id, ...data };
}

export async function removeModuleItem(userId, collectionName, id) {
  await deleteDoc(doc(moduleCollectionRef(userId, collectionName), id));
  if (collectionName === 'budgets' || collectionName === 'goals') {
    const items = await loadModuleItems(userId, collectionName);
    const countKey = collectionName === 'budgets' ? 'activeBudgetsCount' : 'activeGoalsCount';
    await updateDoc(userRef(userId), { [countKey]: items.filter((entry) => entry.status !== 'completed').length, updatedAt: serverTimestamp() });
  }
}

export async function removeAccount(userId, account) {
  if (Number(account.balance || 0) !== 0) throw new Error('account/non-zero-balance');
  const linked = await getDocs(query(transactionsRef(userId), where('account', '==', account.id)));
  if (!linked.empty) throw new Error('account/has-transactions');
  await deleteDoc(accountRef(userId, account.id));
}

export async function listAdminUsers() {
  await requireAdmin();
  const snapshot = await getDocs(collection(db, 'users'));
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
}

export async function loadAdminData() {
  await requireAdmin();
  const [users, categories, plans, logs] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'globalCategories')),
    getDocs(collection(db, 'plans')),
    getDocs(query(collection(db, 'adminAudit'), orderBy('createdAt', 'desc')))
  ]);
  return {
    users: users.docs.map((entry) => ({ id: entry.id, ...entry.data() })),
    categories: categories.docs.map((entry) => ({ id: entry.id, ...entry.data() })),
    plans: plans.docs.map((entry) => ({ id: entry.id, ...entry.data() })),
    logs: logs.docs.map((entry) => ({ id: entry.id, ...entry.data() }))
  };
}

export async function saveAdminItem(collectionName, item) {
  const user = auth.currentUser;
  await requireAdmin();
  if (!['globalCategories', 'plans'].includes(collectionName)) throw new Error('admin/invalid-collection');
  const id = item.id || crypto.randomUUID();
  const { id: itemId, ...data } = item;
  await setDoc(doc(db, collectionName, id), { ...data, updatedAt: serverTimestamp(), createdAt: item.createdAt || serverTimestamp() });
  await setDoc(doc(collection(db, 'adminAudit')), { actorUid: user.uid, action: `save-${collectionName}`, targetId: id, createdAt: serverTimestamp() });
}

export async function removeAdminItem(collectionName, id) {
  const user = auth.currentUser;
  await requireAdmin();
  if (!['globalCategories', 'plans'].includes(collectionName)) throw new Error('admin/invalid-collection');
  await deleteDoc(doc(db, collectionName, id));
  await setDoc(doc(collection(db, 'adminAudit')), { actorUid: user.uid, action: `delete-${collectionName}`, targetId: id, createdAt: serverTimestamp() });
}

export async function updateAdminUser(userId, updates) {
  await requireAdmin();
  const allowedUpdates = {};
  if (['active', 'blocked'].includes(updates.status)) allowedUpdates.status = updates.status;
  if (['free', 'premium'].includes(updates.plan)) allowedUpdates.plan = updates.plan;
  if (Object.keys(allowedUpdates).length) {
    await updateDoc(userRef(userId), { ...allowedUpdates, updatedAt: serverTimestamp() });
    await setDoc(doc(collection(db, 'adminAudit')), { actorUid: auth.currentUser.uid, action: 'update-user', targetId: userId, changes: allowedUpdates, createdAt: serverTimestamp() });
  }
}

export async function saveTransaction(userId, transaction) {
  const reference = transactionRef(userId, transaction.id);
  const { isNew, ...transactionData } = transaction;
  await runTransaction(db, async (firestoreTransaction) => {
    const [profileSnapshot, transactionSnapshot] = await Promise.all([
      firestoreTransaction.get(userRef(userId)),
      firestoreTransaction.get(reference)
    ]);
    const previous = transactionSnapshot.exists() ? transactionSnapshot.data() : null;
    const accountIds = new Set([transaction.account]);
    if (previous?.account) accountIds.add(previous.account);
    const accountSnapshots = await Promise.all([...accountIds].map((id) => firestoreTransaction.get(accountRef(userId, id))));
    const accountBalances = new Map(accountSnapshots.map((snapshot) => [snapshot.id, Number(snapshot.data()?.balance || 0)]));
    const profile = profileSnapshot.data() || {};
    const defaultCurrency = profile.defaultCurrency || 'KZT';
    const currentInDefaultCurrency = (transaction.currency || defaultCurrency) === defaultCurrency;
    const previousInDefaultCurrency = previous && (previous.currency || defaultCurrency) === defaultCurrency;
    const amountDelta = (currentInDefaultCurrency ? signedAmount(transaction) : 0)
      - (previousInDefaultCurrency ? signedAmount(previous) : 0);
    const incomeDelta = (inCurrentMonth(transaction) && currentInDefaultCurrency && transaction.type === 'income' ? Number(transaction.amount) : 0)
      - (inCurrentMonth(previous) && previousInDefaultCurrency && previous.type === 'income' ? Number(previous.amount) : 0);
    const expenseDelta = (inCurrentMonth(transaction) && currentInDefaultCurrency && transaction.type === 'expense' ? Number(transaction.amount) : 0)
      - (inCurrentMonth(previous) && previousInDefaultCurrency && previous.type === 'expense' ? Number(previous.amount) : 0);

    for (const accountId of accountIds) {
      const accountSnapshot = accountSnapshots.find((snapshot) => snapshot.id === accountId);
      if (!accountSnapshot?.exists()) throw new Error('account/not-found');
      let delta = 0;
      if (transaction.account === accountId) delta += signedAmount(transaction);
      if (previous?.account === accountId) delta -= signedAmount(previous);
      if (delta) firestoreTransaction.update(accountRef(userId, accountId), { balance: accountBalances.get(accountId) + delta, updatedAt: serverTimestamp() });
    }

    firestoreTransaction.set(reference, { ...transactionData, createdAt: previous?.createdAt || serverTimestamp(), updatedAt: serverTimestamp() });
    firestoreTransaction.update(userRef(userId), {
      totalBalance: Number(profile.totalBalance || 0) + amountDelta,
      monthlyIncome: Number(profile.monthlyIncome || 0) + incomeDelta,
      monthlyExpense: Number(profile.monthlyExpense || 0) + expenseDelta,
      updatedAt: serverTimestamp()
    });
  });
  const saved = await getDoc(reference);
  return { id: saved.id, ...saved.data() };
}

export async function removeTransaction(userId, transaction) {
  await runTransaction(db, async (firestoreTransaction) => {
    const profileSnapshot = await firestoreTransaction.get(userRef(userId));
    const accountSnapshot = await firestoreTransaction.get(accountRef(userId, transaction.account));
    if (!accountSnapshot.exists()) throw new Error('account/not-found');
    const profile = profileSnapshot.data() || {};
    const balanceDelta = signedAmount(transaction);
    const defaultCurrency = profile.defaultCurrency || 'KZT';
    const inDefaultCurrency = (transaction.currency || defaultCurrency) === defaultCurrency;
    const incomeDelta = inCurrentMonth(transaction) && inDefaultCurrency && transaction.type === 'income' ? Number(transaction.amount) : 0;
    const expenseDelta = inCurrentMonth(transaction) && inDefaultCurrency && transaction.type === 'expense' ? Number(transaction.amount) : 0;
    const profileBalanceDelta = inDefaultCurrency ? balanceDelta : 0;
    firestoreTransaction.update(accountRef(userId, transaction.account), { balance: Number(accountSnapshot.data().balance || 0) - balanceDelta, updatedAt: serverTimestamp() });
    firestoreTransaction.update(userRef(userId), {
      totalBalance: Number(profile.totalBalance || 0) - profileBalanceDelta,
      monthlyIncome: Number(profile.monthlyIncome || 0) - incomeDelta,
      monthlyExpense: Number(profile.monthlyExpense || 0) - expenseDelta,
      updatedAt: serverTimestamp()
    });
    firestoreTransaction.delete(transactionRef(userId, transaction.id));
  });
}

export function observeAuth(callback, onError) {
  return onAuthStateChanged(auth, callback, onError);
}

export function logout() {
  return signOut(auth);
}

export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

export function toFirebaseErrorKey(error) {
  const code = error?.code || error?.message;
  return ({
    'auth/email-already-in-use': 'authErrorEmailExists',
    'auth/invalid-email': 'authErrorInvalidEmail',
    'auth/weak-password': 'authErrorWeakPassword',
    'auth/invalid-credential': 'authErrorInvalidCredentials',
    'auth/user-not-found': 'authErrorInvalidCredentials',
    'auth/wrong-password': 'authErrorInvalidCredentials',
    'auth/operation-not-allowed': 'authErrorProviderDisabled',
    'auth/too-many-requests': 'authErrorTryLater',
    'auth/network-request-failed': 'authErrorNetwork',
    'account/not-found': 'authErrorAccountMissing'
    , 'account/non-zero-balance': 'accountHasBalance'
    , 'account/has-transactions': 'accountHasTransactions'
    , 'admin/forbidden': 'adminForbidden'
    , 'admin/invalid-collection': 'authErrorGeneric'
  })[code] || 'authErrorGeneric';
}