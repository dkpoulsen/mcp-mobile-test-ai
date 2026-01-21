import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/Card';
import { Badge as StatusBadge } from '@/components/Badge';
import { CenteredSpinner } from '@/components/Spinner';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { CheckCircle2, XCircle } from 'lucide-react';

const COLORS = {
  completed: '#22c55e',
  failed: '#ef4444',
  pending: '#eab308',
  running: '#3b82f6',
  cancelled: '#6b7280',
};

export function Dashboard() {
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['summary'],
    queryFn: () => api.getTestRunSummary(),
    refetchInterval: 5000,
  });

  const { data: historical, isLoading: historicalLoading } = useQuery({
    queryKey: ['historical'],
    queryFn: () => api.getHistoricalData({ days: 30 }),
  });

  const { data: recentRuns, isLoading: runsLoading } = useQuery({
    queryKey: ['runs', 'recent'],
    queryFn: () => api.getTestRuns({ take: 5, skip: 0 }),
    refetchInterval: 5000,
  });

  if (summaryLoading || !summary) {
    return <CenteredSpinner />;
  }

  const pieData = [
    { name: 'Completed', value: summary.data.byStatus.completed, color: COLORS.completed },
    { name: 'Failed', value: summary.data.byStatus.failed, color: COLORS.failed },
    { name: 'Pending', value: summary.data.byStatus.pending, color: COLORS.pending },
    { name: 'Running', value: summary.data.byStatus.running, color: COLORS.running },
    { name: 'Cancelled', value: summary.data.byStatus.cancelled, color: COLORS.cancelled },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Test Runs</p>
                <p className="text-3xl font-bold text-gray-900">{summary.data.total}</p>
              </div>
              <CheckCircle2 className="h-10 w-10 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Pass Rate</p>
                <p className="text-3xl font-bold text-gray-900">
                  {summary.data.aggregate.passRate.toFixed(1)}%
                </p>
              </div>
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Passed</p>
                <p className="text-3xl font-bold text-gray-900">{summary.data.aggregate.totalPassed}</p>
              </div>
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Failed</p>
                <p className="text-3xl font-bold text-gray-900">{summary.data.aggregate.totalFailed}</p>
              </div>
              <XCircle className="h-10 w-10 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Historical Trends */}
        <Card>
          <CardHeader>
            <CardTitle>Test Trends (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            {historicalLoading ? (
              <div className="flex h-[250px] items-center justify-center">
                <div className="text-gray-500">Loading...</div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={historical?.data || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} />
                  <YAxis />
                  <Tooltip labelFormatter={(v) => new Date(v).toLocaleDateString()} />
                  <Legend />
                  <Line type="monotone" dataKey="passed" stroke="#22c55e" name="Passed" strokeWidth={2} />
                  <Line type="monotone" dataKey="failed" stroke="#ef4444" name="Failed" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Daily Test Volume */}
      {historical && (
        <Card>
          <CardHeader>
            <CardTitle>Daily Test Volume</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={historical.data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} />
                <YAxis />
                <Tooltip labelFormatter={(v) => new Date(v).toLocaleDateString()} />
                <Legend />
                <Bar dataKey="total" fill="#3b82f6" name="Total Runs" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Recent Test Runs */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Test Runs</CardTitle>
        </CardHeader>
        <CardContent>
          {runsLoading ? (
            <div className="flex h-[200px] items-center justify-center">
              <div className="text-gray-500">Loading...</div>
            </div>
          ) : recentRuns && recentRuns.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="pb-3 text-left text-sm font-medium text-gray-600">Test Suite</th>
                    <th className="pb-3 text-left text-sm font-medium text-gray-600">Device</th>
                    <th className="pb-3 text-left text-sm font-medium text-gray-600">Status</th>
                    <th className="pb-3 text-right text-sm font-medium text-gray-600">Results</th>
                    <th className="pb-3 text-right text-sm font-medium text-gray-600">Duration</th>
                    <th className="pb-3 text-right text-sm font-medium text-gray-600">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRuns.data.map((run) => (
                    <tr key={run.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 text-sm">{run.testSuite?.name}</td>
                      <td className="py-3 text-sm">
                        {run.device?.platform === 'IOS' ? '🍎' : '🤖'} {run.device?.name}
                      </td>
                      <td className="py-3">
                        <StatusBadge variant="status" status={run.status}>
                          {run.status}
                        </StatusBadge>
                      </td>
                      <td className="py-3 text-right text-sm">
                        <span className="text-green-600">{run.passedCount}</span>
                        {' / '}
                        <span className="text-red-600">{run.failedCount}</span>
                        {run.skippedCount > 0 && (
                          <>
                            {' / '}
                            <span className="text-gray-500">{run.skippedCount}</span>
                          </>
                        )}
                      </td>
                      <td className="py-3 text-right text-sm">
                        {run.totalDuration ? `${(run.totalDuration / 1000).toFixed(1)}s` : '-'}
                      </td>
                      <td className="py-3 text-right text-sm text-gray-600">
                        {run.startedAt ? new Date(run.startedAt).toLocaleString() : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 text-center text-gray-500">No test runs found</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
