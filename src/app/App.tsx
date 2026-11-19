import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './Layout';
import { TraceStoreProvider } from './store';
import { Landing } from './pages/Landing';
import { Analyze } from './pages/Analyze';
import { Examples } from './pages/Examples';
import { TraceView } from './pages/TraceView';
import { Compare } from './pages/Compare';
import { Reports } from './pages/Reports';
import { Docs } from './pages/Docs';
import { About } from './pages/About';
import { NotFound } from './pages/NotFound';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Landing />} />
        <Route path="analyze" element={<Analyze />} />
        <Route path="analyze/:mode" element={<Analyze />} />
        <Route path="examples" element={<Examples />} />
        <Route path="trace/:id" element={<TraceView />} />
        <Route path="compare" element={<Compare />} />
        <Route path="reports" element={<Reports />} />
        <Route path="docs" element={<Docs />} />
        <Route path="about" element={<About />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <TraceStoreProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
        <AppRoutes />
      </BrowserRouter>
    </TraceStoreProvider>
  );
}
