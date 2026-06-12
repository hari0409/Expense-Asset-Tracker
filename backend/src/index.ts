import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { initDb } from './db';
import { requireAuth } from './middleware/auth';
import authRouter from './routes/auth';
import categoriesRouter from './routes/categories';
import expensesRouter from './routes/expenses';
import unplannedExpensesRouter from './routes/unplannedExpenses';
import adhocBudgetsRouter from './routes/adhocBudgets';
import rentOutsRouter from './routes/rentOuts';
import savingsRouter from './routes/savings';
import assetsRouter from './routes/assets';
import loansRouter from './routes/loans';
import incomeRouter from './routes/income';

const app = express();
app.use(cors({ origin: process.env.ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRouter);

app.use('/api/categories', requireAuth);
app.use('/api/expenses', requireAuth);
app.use('/api/unplanned-expenses', requireAuth);
app.use('/api/adhoc-budgets', requireAuth);
app.use('/api/rent-outs', requireAuth);
app.use('/api/savings', requireAuth);
app.use('/api/assets', requireAuth);
app.use('/api/loans', requireAuth);
app.use('/api/income', requireAuth);

app.use('/api/categories', categoriesRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/unplanned-expenses', unplannedExpensesRouter);
app.use('/api/adhoc-budgets', adhocBudgetsRouter);
app.use('/api/rent-outs', rentOutsRouter);
app.use('/api/savings', savingsRouter);
app.use('/api/assets', assetsRouter);
app.use('/api/loans', loansRouter);
app.use('/api/income', incomeRouter);

const PORT = process.env.PORT || 3001;

initDb().then(() => {
  app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
}).catch(err => {
  console.error('DB init failed:', err);
  process.exit(1);
});
