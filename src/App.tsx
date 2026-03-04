import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import UploadInvoice from './pages/UploadInvoice';
import Vendors from './pages/Vendors';
import InvoiceTracker from './pages/InvoiceTracker';
import Assets from './pages/Assets';
import Categories from './pages/Categories';
import CategoryDetail from './pages/CategoryDetail';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import Team from './pages/Team';
import Reports from './pages/Reports';
import SpendMatrix from './pages/SpendMatrix';
import Subscriptions from './pages/Subscriptions';
import SubscriptionReceipts from './pages/SubscriptionReceipts';
import SubscriptionCalendar from './pages/SubscriptionCalendar';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="upload" element={<UploadInvoice />} />
          <Route path="vendors" element={<Vendors />} />
          <Route path="tracker" element={<InvoiceTracker />} />
          <Route path="subscriptions" element={<Subscriptions />} />
          <Route path="subscriptions/receipts" element={<SubscriptionReceipts />} />
          <Route path="subscriptions/calendar" element={<SubscriptionCalendar />} />
          <Route path="assets" element={<Assets />} />
          <Route path="categories" element={<Categories />} />
          <Route path="categories/:category" element={<CategoryDetail />} />
          <Route path="team" element={<Team />} />
          <Route path="reports" element={<Reports />} />
          <Route path="spend-matrix" element={<SpendMatrix />} />
          <Route path="settings" element={<Settings />} />
          <Route path="profile" element={<Profile />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
