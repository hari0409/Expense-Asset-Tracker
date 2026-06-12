import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/browser';

const BASE = '/api';

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...opts,
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!res.ok) {
    let message = res.statusText;
    try { message = JSON.parse(text).error || message; } catch {}
    throw new Error(message);
  }
  return JSON.parse(text) as T;
}

export const api = {
  // Categories
  getCategories: (month?: number, year?: number) =>
    req<Category[]>(`/categories${month != null ? `?month=${month}&year=${year}` : ''}`),
  createCategory: (body: Partial<Category>) =>
    req<Category>('/categories', { method: 'POST', body: JSON.stringify(body) }),
  updateCategory: (id: number, body: Partial<Category>) =>
    req<Category>(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteCategory: (id: number) =>
    req<void>(`/categories/${id}`, { method: 'DELETE' }),
  copyCategories: (fromMonth: number, fromYear: number, toMonth: number, toYear: number) =>
    req<{ copied: number }>('/categories/copy', { method: 'POST', body: JSON.stringify({ fromMonth, fromYear, toMonth, toYear }) }),
  deleteMonthCategories: (month: number, year: number) =>
    req<{ ok: boolean }>(`/categories/month?month=${month}&year=${year}`, { method: 'DELETE' }),
  reorderCategories: (ids: number[]) =>
    req<{ ok: boolean }>('/categories/reorder', { method: 'POST', body: JSON.stringify({ ids }) }),

  // Expenses
  getExpenses: (params: { category_id?: number; month?: number; year?: number }) => {
    const q = new URLSearchParams();
    if (params.category_id) q.set('category_id', String(params.category_id));
    if (params.month) q.set('month', String(params.month));
    if (params.year) q.set('year', String(params.year));
    return req<Expense[]>(`/expenses?${q}`);
  },
  getExpensesTimeline: () => req<ExpenseTimelinePoint[]>('/expenses/timeline'),
  getCategoryRangeSummary: (from: string, to: string) =>
    req<CategoryRangePoint[]>(`/expenses/category-range-summary?from=${from}&to=${to}`),
  getDailyExpenses: (month: number, year: number, category_id?: number) => {
    const q = new URLSearchParams({ month: String(month), year: String(year) });
    if (category_id) q.set('category_id', String(category_id));
    return req<DailyTotal[]>(`/expenses/daily?${q}`);
  },
  createExpense: (body: Partial<Expense>) =>
    req<Expense>('/expenses', { method: 'POST', body: JSON.stringify(body) }),
  updateExpense: (id: number, body: Partial<Expense>) =>
    req<Expense>(`/expenses/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteExpense: (id: number) =>
    req<void>(`/expenses/${id}`, { method: 'DELETE' }),
  clearMonthExpenses: (month: number, year: number) =>
    req<{ deleted: number }>(`/expenses/month?month=${month}&year=${year}`, { method: 'DELETE' }),

  // Unplanned (sudden) expenses
  getUnplannedExpenses: (params: { month?: number; year?: number }) => {
    const q = new URLSearchParams();
    if (params.month) q.set('month', String(params.month));
    if (params.year) q.set('year', String(params.year));
    return req<UnplannedExpense[]>(`/unplanned-expenses?${q}`);
  },
  createUnplannedExpense: (body: { amount: number; description?: string | null; date: string; adhoc_budget_id?: number | null }) =>
    req<UnplannedExpense | Expense>('/unplanned-expenses', { method: 'POST', body: JSON.stringify(body) }),
  updateUnplannedExpense: (id: number, body: { amount: number; description?: string | null; date: string }) =>
    req<UnplannedExpense>(`/unplanned-expenses/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteUnplannedExpense: (id: number) =>
    req<void>(`/unplanned-expenses/${id}`, { method: 'DELETE' }),

  // Adhoc budgets — non-monthly envelopes drawn from a source asset
  getAdhocBudgets: () => req<AdhocBudget[]>('/adhoc-budgets'),
  getArchivedAdhocBudgets: () => req<AdhocBudget[]>('/adhoc-budgets/archived'),
  getAdhocBudgetExpenses: (id: number) => req<UnplannedExpense[]>(`/adhoc-budgets/${id}/expenses`),
  createAdhocBudget: (body: { name: string; asset_id?: number | null; original_amount: number; color?: string; notes?: string | null }) =>
    req<AdhocBudget>('/adhoc-budgets', { method: 'POST', body: JSON.stringify(body) }),
  updateAdhocBudget: (id: number, body: Partial<AdhocBudget>) =>
    req<AdhocBudget>(`/adhoc-budgets/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  resetAdhocBudget: (id: number, body: { amount?: number; persist?: boolean } = {}) =>
    req<AdhocBudgetResetResult>(`/adhoc-budgets/${id}/reset`, { method: 'POST', body: JSON.stringify(body) }),
  deleteAdhocBudget: (id: number) =>
    req<void>(`/adhoc-budgets/${id}`, { method: 'DELETE' }),

  // Rent-out persons
  getRentOutPersons: () => req<RentOutPerson[]>('/rent-outs/persons'),
  createRentOutPerson: (body: Partial<RentOutPerson>) =>
    req<RentOutPerson>('/rent-outs/persons', { method: 'POST', body: JSON.stringify(body) }),
  updateRentOutPerson: (id: number, body: Partial<RentOutPerson>) =>
    req<RentOutPerson>(`/rent-outs/persons/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteRentOutPerson: (id: number) =>
    req<void>(`/rent-outs/persons/${id}`, { method: 'DELETE' }),
  settlePerson: (id: number, amount: number) =>
    req<{ settled: number; leftover: number }>(`/rent-outs/persons/${id}/settle`, { method: 'POST', body: JSON.stringify({ amount }) }),
  getSettlements: (personId: number) =>
    req<Settlement[]>(`/rent-outs/persons/${personId}/settlements`),
  logSettlement: (personId: number, amount: number, date?: string) =>
    req<Settlement>(`/rent-outs/persons/${personId}/log-settlement`, { method: 'POST', body: JSON.stringify({ amount, date }) }),
  deleteSettlement: (id: number) =>
    req<void>(`/rent-outs/settlements/${id}`, { method: 'DELETE' }),

  // Rent-out entries
  getRentOutEntries: (params?: { person_id?: number; status?: string }) => {
    const q = new URLSearchParams();
    if (params?.person_id) q.set('person_id', String(params.person_id));
    if (params?.status) q.set('status', params.status);
    return req<RentOutEntry[]>(`/rent-outs/entries?${q}`);
  },
  createRentOutEntry: (body: Partial<RentOutEntry>) =>
    req<RentOutEntry>('/rent-outs/entries', { method: 'POST', body: JSON.stringify(body) }),
  updateRentOutEntry: (id: number, body: Partial<RentOutEntry>) =>
    req<RentOutEntry>(`/rent-outs/entries/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  recordReturn: (id: number, amount_returned: number) =>
    req<RentOutEntry>(`/rent-outs/entries/${id}/return`, { method: 'PATCH', body: JSON.stringify({ amount_returned }) }),
  deleteRentOutEntry: (id: number) =>
    req<void>(`/rent-outs/entries/${id}`, { method: 'DELETE' }),

  // Savings instruments
  getInstruments: () => req<SavingsInstrument[]>('/savings/instruments'),
  createInstrument: (body: Partial<SavingsInstrument>) =>
    req<SavingsInstrument>('/savings/instruments', { method: 'POST', body: JSON.stringify(body) }),
  updateInstrument: (id: number, body: Partial<SavingsInstrument>) =>
    req<SavingsInstrument>(`/savings/instruments/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  setInstrumentAsset: (id: number, asset_id: number | null) =>
    req<SavingsInstrument>(`/savings/instruments/${id}/asset`, { method: 'PUT', body: JSON.stringify({ asset_id }) }),
  deleteInstrument: (id: number) =>
    req<void>(`/savings/instruments/${id}`, { method: 'DELETE' }),

  // Savings entries
  getSavingsEntries: (params: { month?: number; year?: number; instrument_id?: number }) => {
    const q = new URLSearchParams();
    if (params.month) q.set('month', String(params.month));
    if (params.year) q.set('year', String(params.year));
    if (params.instrument_id) q.set('instrument_id', String(params.instrument_id));
    return req<SavingsEntry[]>(`/savings/entries?${q}`);
  },
  createSavingsEntry: (body: Partial<SavingsEntry>) =>
    req<SavingsEntry>('/savings/entries', { method: 'POST', body: JSON.stringify(body) }),
  updateSavingsEntry: (id: number, body: Partial<SavingsEntry>) =>
    req<SavingsEntry>(`/savings/entries/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteSavingsEntry: (id: number) =>
    req<void>(`/savings/entries/${id}`, { method: 'DELETE' }),
  getSavingsSummary: () => req<SavingsSummary[]>('/savings/summary'),

  // Assets
  getAssets: () => req<Asset[]>('/assets'),
  createAsset: (body: Partial<Asset>) =>
    req<Asset>('/assets', { method: 'POST', body: JSON.stringify(body) }),
  updateAsset: (id: number, body: Partial<Asset>) =>
    req<Asset>(`/assets/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteAsset: (id: number) =>
    req<void>(`/assets/${id}`, { method: 'DELETE' }),
  getAssetsSummary: () => req<AssetSummary>('/assets/summary'),
  snapshotAllAssets: (month: number, year: number) => req<{ ok: boolean; count: number }>('/assets/snapshot-all', { method: 'POST', body: JSON.stringify({ month, year }) }),
  getSnapshotStatus: (month: number, year: number) => req<{ exists: boolean; count: number; total: number; stale: boolean }>(`/assets/snapshot-status?month=${month}&year=${year}`),
  deleteSnapshot: (month: number, year: number) => req<{ ok: boolean }>(`/assets/snapshot?month=${month}&year=${year}`, { method: 'DELETE' }),
  getAssetsTimeline: () => req<AssetTimelinePoint[]>('/assets/timeline'),
  getAssetsTimelineMonth: (year: number, month: number) => req<AssetSnapshotRow[]>(`/assets/timeline/${year}/${month}`),
  getAssetEntries: (assetId: number) => req<AssetManualEntry[]>(`/assets/${assetId}/entries`),
  createAssetEntry: (assetId: number, body: { amount: number; note?: string; date?: string; targets?: { asset_id: number; amount: number; note?: string }[] }) =>
    req<AssetManualEntry>(`/assets/${assetId}/entries`, { method: 'POST', body: JSON.stringify(body) }),
  updateAssetEntry: (assetId: number, entryId: number, body: { amount: number; note?: string; date?: string }) =>
    req<AssetManualEntry>(`/assets/${assetId}/entries/${entryId}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteAssetEntry: (assetId: number, entryId: number) =>
    req<void>(`/assets/${assetId}/entries/${entryId}`, { method: 'DELETE' }),

  // Loans
  getLoans: () => req<Loan[]>('/loans'),
  createLoan: (body: Partial<Loan> & { emi_amount?: number }) =>
    req<Loan>('/loans', { method: 'POST', body: JSON.stringify(body) }),
  updateLoan: (id: number, body: Partial<Loan>) =>
    req<Loan>(`/loans/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteLoan: (id: number) =>
    req<void>(`/loans/${id}`, { method: 'DELETE' }),
  changeLoanEmi: (id: number, body: { amount: number; from_month: number; from_year: number }) =>
    req<{ ok: boolean }>(`/loans/${id}/change-emi`, { method: 'POST', body: JSON.stringify(body) }),
  getEmiForMonth: (month: number, year: number) =>
    req<EmiForMonth[]>(`/loans/emi-for-month?month=${month}&year=${year}`),
  getEmiPayments: (params: { month?: number; year?: number; loan_id?: number }) => {
    const q = new URLSearchParams();
    if (params.month != null) q.set('month', String(params.month));
    if (params.year != null) q.set('year', String(params.year));
    if (params.loan_id != null) q.set('loan_id', String(params.loan_id));
    return req<EmiPayment[]>(`/loans/payments?${q}`);
  },
  createEmiPayment: (body: Partial<EmiPayment>) =>
    req<EmiPayment>('/loans/payments', { method: 'POST', body: JSON.stringify(body) }),
  updateEmiPayment: (id: number, body: { amount: number; notes?: string }) =>
    req<EmiPayment>(`/loans/payments/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteEmiPayment: (id: number) =>
    req<void>(`/loans/payments/${id}`, { method: 'DELETE' }),

  // Income
  getIncome: (month: number, year: number) =>
    req<MonthlyIncome | null>(`/income?month=${month}&year=${year}`),
  setIncome: (body: { month: number; year: number; amount: number; notes?: string }) =>
    req<MonthlyIncome>('/income', { method: 'POST', body: JSON.stringify(body) }),
  getIncomeHistory: () => req<MonthlyIncome[]>('/income/history'),

  // Auth
  getAuthStatus: () => req<AuthStatus>('/auth/status'),
  getMe: () => req<AuthUser>('/auth/me'),
  setup: (username: string, password: string) =>
    req<AuthUser>('/auth/setup', { method: 'POST', body: JSON.stringify({ username, password }) }),
  login: (username: string, password: string) =>
    req<AuthUser>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => req<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  changePassword: (currentPassword: string, newPassword: string) =>
    req<{ ok: boolean }>('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  getCredentials: () => req<WebauthnSettings>('/auth/webauthn/credentials'),
  deleteCredential: (id: number) =>
    req<void>(`/auth/webauthn/credentials/${id}`, { method: 'DELETE' }),
  setFingerprintEnabled: (enabled: boolean) =>
    req<{ enabled: boolean }>('/auth/webauthn/toggle', { method: 'POST', body: JSON.stringify({ enabled }) }),
  getFingerprintAvailability: (username: string) =>
    req<{ available: boolean }>(`/auth/webauthn/availability?username=${encodeURIComponent(username)}`),
  webauthnRegisterOptions: () =>
    req<PublicKeyCredentialCreationOptionsJSON>('/auth/webauthn/register-options', { method: 'POST' }),
  webauthnRegisterVerify: (response: RegistrationResponseJSON, deviceName: string) =>
    req<{ ok: boolean }>('/auth/webauthn/register-verify', { method: 'POST', body: JSON.stringify({ response, deviceName }) }),
  webauthnLoginOptions: (username: string) =>
    req<PublicKeyCredentialRequestOptionsJSON>('/auth/webauthn/login-options', { method: 'POST', body: JSON.stringify({ username }) }),
  webauthnLoginVerify: (username: string, response: AuthenticationResponseJSON) =>
    req<AuthUser>('/auth/webauthn/login-verify', { method: 'POST', body: JSON.stringify({ username, response }) }),
};

// Types
export interface Category {
  id: number;
  name: string;
  color: string;
  budget: number;
  month: number;
  year: number;
  spent: number;
  kind: 'normal' | 'unplanned';
}

export interface Expense {
  id: number;
  category_id: number;
  category_name: string;
  category_color: string;
  category_kind?: 'normal' | 'unplanned';
  budget: number;
  amount: number;
  formula: string | null;
  description: string | null;
  date: string;
  created_at: string;
  updated_at: string;
}

export interface UnplannedExpense {
  id: number;
  amount: number;
  description: string | null;
  date: string;
  month: number;
  year: number;
  source_asset_id?: number | null;
  source_asset_name?: string | null;
  adhoc_budget_id?: number | null;
  adhoc_budget_name?: string | null;
  created_at: string;
}

export interface AdhocBudget {
  id: number;
  name: string;
  asset_id: number | null;
  asset_name?: string | null;
  original_amount: number;
  balance: number;
  color: string;
  notes: string | null;
  archived: number;
  archived_at: string | null;
  created_at: string;
}

export interface AdhocBudgetResetResult extends AdhocBudget {
  archivedBudget: { id: number; name: string } | null;
}

export interface DailyTotal {
  day: string;
  total: number;
  category_id: number;
}

export interface Settlement {
  id: number;
  person_id: number;
  amount: number;
  date: string;
  notes: string | null;
  created_at: string;
}

export interface RentOutPerson {
  id: number;
  name: string;
  color: string;
  notes: string | null;
  outstanding: number;
  total_lent: number;
  entry_count: number;
  created_at: string;
}

export interface RentOutEntry {
  id: number;
  person_id: number;
  person_name: string;
  person_color: string;
  amount: number;
  description: string | null;
  date_given: string;
  status: 'pending' | 'partial' | 'paid';
  amount_returned: number;
  notes: string | null;
  created_at: string;
}

export interface SavingsInstrument {
  id: number;
  name: string;
  type: string;
  color: string;
  monthly_target: number;
  notes: string | null;
  asset_name: string | null;
  include_in_assets: number; // 0 or 1
  asset_id: number | null;   // mapped asset; null = unmapped
}

export interface SavingsEntry {
  id: number;
  instrument_id: number;
  instrument_name: string;
  type: string;
  color: string;
  monthly_target: number;
  amount: number;
  month: number;
  year: number;
  notes: string | null;
}

export interface SavingsSummary {
  id: number;
  name: string;
  type: string;
  color: string;
  monthly_target: number;
  total_saved: number;
  months_count: number;
}

export interface Asset {
  include_in_total: number; // 0 or 1
  id: number;
  name: string;
  type: string;
  current_value: number; // derived = base_value + SUM(mapped instrument entries)
  base_value: number;    // manual base / market value
  color: string;
  notes: string | null;
  last_updated: string;
}

export interface AssetTimelinePoint {
  month: number;
  year: number;
  total: number;
}

export interface ExpenseTimelinePoint {
  month: number;
  year: number;
  planned: number;
  emi: number;
  unplanned: number;
  total: number;
}

export interface CategoryRangePoint {
  period: string; // 'YYYY-MM'
  category_name: string;
  category_color: string;
  total: number;
}

export interface AssetSnapshotRow {
  asset_id: number;
  name: string;
  type: string;
  color: string;
  value: number;
  prev_value: number | null;
  delta: number | null;
}

export interface AssetSummary {
  byType: { type: string; total: number; count: number }[];
  total: number;
}

export interface AssetManualEntry {
  id: number;
  asset_id: number;
  amount: number;
  note: string | null;
  date: string;
  linked_unplanned_expense_id: number | null;
  transfer_group: string | null;
  transfer_counterparty: string | null;
  adhoc_budget_id: number | null;
  adhoc_budget_name: string | null;
  created_at: string;
}

export interface Loan {
  id: number;
  name: string;
  lender: string | null;
  principal: number | null;
  has_emi: number; // 0 or 1
  color: string;
  notes: string | null;
  status: 'active' | 'closed';
  start_month: number;
  start_year: number;
  end_month: number | null;
  end_year: number | null;
  current_emi_amount: number | null;
  total_paid: number;
  created_at: string;
}

export interface EmiPayment {
  id: number;
  loan_id: number;
  loan_name: string;
  loan_color: string;
  amount: number;
  month: number;
  year: number;
  notes: string | null;
  created_at: string;
}

export interface EmiForMonth {
  loan_id: number;
  loan_name: string;
  loan_color: string;
  emi_amount: number;
}

export interface MonthlyIncome {
  id: number;
  month: number;
  year: number;
  amount: number;
  notes: string | null;
  created_at: string;
}

export interface AuthStatus {
  setupRequired: boolean;
}

export interface AuthUser {
  id: number;
  username: string;
}

export interface WebauthnCredentialInfo {
  id: number;
  device_name: string | null;
  transports: string[];
  created_at: string;
}

export interface WebauthnSettings {
  enabled: boolean;
  credentials: WebauthnCredentialInfo[];
}
