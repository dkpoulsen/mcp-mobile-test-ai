import { Card, CardHeader, CardTitle, CardContent } from '@/components/Card';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Server, Database, Cpu } from 'lucide-react';

export function Settings() {
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.getHealth(),
    refetchInterval: 10000,
  });

  const { data: suites } = useQuery({
    queryKey: ['suites'],
    queryFn: () => api.getTestSuites(),
  });

  const { data: devices } = useQuery({
    queryKey: ['devices'],
    queryFn: () => api.getDevices(),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
        <p className="text-gray-600">System configuration and information</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* API Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              API Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Status:</span>
                <span className={`font-medium ${health?.status === 'running' ? 'text-green-600' : 'text-red-600'}`}>
                  {health?.status || 'Unknown'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Version:</span>
                <span className="font-medium">0.1.0</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Test Suites */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Test Suites
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-gray-900">{suites?.data.length || 0}</p>
            <p className="text-sm text-gray-600">Configured test suites</p>
          </CardContent>
        </Card>

        {/* Devices */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cpu className="h-5 w-5" />
              Devices
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-4">
              <p className="text-3xl font-bold text-gray-900">{devices?.data.length || 0}</p>
              <p className="text-sm text-gray-600">Total devices</p>
            </div>
            <div className="mt-2 text-sm">
              <span className="text-green-600">
                {devices?.data.filter((d) => d.status === 'AVAILABLE').length || 0} available
              </span>
              {' / '}
              <span className="text-yellow-600">
                {devices?.data.filter((d) => d.status === 'BUSY').length || 0} busy
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-medium text-gray-900">MCP Mobile Test AI Dashboard</h3>
            <p className="mt-1 text-sm text-gray-600">
              A comprehensive dashboard for viewing test results, browsing test suites, scheduling tests,
              and analyzing trends for mobile application testing.
            </p>
          </div>
          <div className="grid gap-4 text-sm md:grid-cols-2">
            <div>
              <p className="font-medium text-gray-900">Features</p>
              <ul className="mt-1 space-y-1 text-gray-600">
                <li>• Real-time test run monitoring</li>
                <li>• Test suite and case management</li>
                <li>• Device scheduling and management</li>
                <li>• Historical trend analysis</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-gray-900">Technologies</p>
              <ul className="mt-1 space-y-1 text-gray-600">
                <li>• React 19 + TypeScript</li>
                <li>• TanStack Query for data fetching</li>
                <li>• Recharts for visualization</li>
                <li>• Vite for fast development</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
