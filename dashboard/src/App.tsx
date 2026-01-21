import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Dashboard } from '@/pages/Dashboard';
import { TestRuns } from '@/pages/TestRuns';
import { TestRunDetail } from '@/pages/TestRunDetail';
import { TestSuites } from '@/pages/TestSuites';
import { TestSuiteDetail } from '@/pages/TestSuiteDetail';
import { Schedule } from '@/pages/Schedule';
import { Settings } from '@/pages/Settings';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="test-runs" element={<TestRuns />} />
            <Route path="test-runs/:id" element={<TestRunDetail />} />
            <Route path="test-suites" element={<TestSuites />} />
            <Route path="test-suites/:id" element={<TestSuiteDetail />} />
            <Route path="schedule" element={<Schedule />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
