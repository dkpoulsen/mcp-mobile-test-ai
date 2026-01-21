import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import api from '@/lib/api';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/Card';
import { CenteredSpinner } from '@/components/Spinner';
import { getPlatformIcon, formatDuration, formatDate } from '@/lib/utils';
import { ArrowLeft, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useState } from 'react';

export function TestRunDetail() {
  const { id } = useParams<{ id: string }>();
  const [resultsPage, setResultsPage] = useState(0);
  const resultsPageSize = 20;
  const queryClient = useQueryClient();

  const { data: run, isLoading: runLoading } = useQuery({
    queryKey: ['run', id],
    queryFn: () => api.getTestRun(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      // Refetch if still running
      const status = query.state.data?.data.status;
      return status === 'RUNNING' || status === 'PENDING' ? 3000 : false;
    },
  });

  const { data: resultsData, isLoading: resultsLoading } = useQuery({
    queryKey: ['run', id, 'results', resultsPage],
    queryFn: () => api.getTestRunResults(id!, { skip: resultsPage * resultsPageSize, take: resultsPageSize }),
    enabled: !!id,
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.cancelTestRun(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['run', id] });
      queryClient.invalidateQueries({ queryKey: ['runs'] });
    },
  });

  if (runLoading || !run) {
    return <CenteredSpinner />;
  }

  const testRun = run.data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/test-runs">
          <Button size="sm" variant="ghost">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Test Runs
          </Button>
        </Link>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-gray-900">{testRun.testSuite?.name}</h2>
          <p className="text-sm text-gray-600">ID: {testRun.id}</p>
        </div>
        {(testRun.status === 'PENDING' || testRun.status === 'RUNNING') && (
          <Button
            variant="danger"
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending}
          >
            <X className="mr-2 h-4 w-4" />
            Cancel Run
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-sm text-gray-600">Status</p>
              <Badge variant="status" status={testRun.status} className="mt-2">
                {testRun.status}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-sm text-gray-600">Passed</p>
              <p className="mt-2 text-3xl font-bold text-green-600">{testRun.passedCount}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-sm text-gray-600">Failed</p>
              <p className="mt-2 text-3xl font-bold text-red-600">{testRun.failedCount}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-sm text-gray-600">Skipped</p>
              <p className="mt-2 text-3xl font-bold text-gray-600">{testRun.skippedCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Run Details */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Device Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Device:</span>
              <span className="font-medium">
                {getPlatformIcon(testRun.device?.platform || 'ANDROID')} {testRun.device?.name}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">OS Version:</span>
              <span className="font-medium">{testRun.device?.osVersion}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Type:</span>
              <span className="font-medium">{testRun.device?.isEmulator ? 'Emulator' : 'Real Device'}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Timing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Created:</span>
              <span className="font-medium">{formatDate(testRun.createdAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Started:</span>
              <span className="font-medium">{testRun.startedAt ? formatDate(testRun.startedAt) : '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Completed:</span>
              <span className="font-medium">{testRun.completedAt ? formatDate(testRun.completedAt) : '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Duration:</span>
              <span className="font-medium">{testRun.totalDuration ? formatDuration(testRun.totalDuration) : '-'}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Test Results */}
      <Card>
        <CardHeader>
          <CardTitle>Test Results</CardTitle>
        </CardHeader>
        <CardContent>
          {resultsLoading ? (
            <div className="flex min-h-[200px] items-center justify-center">
              <div className="text-gray-500">Loading...</div>
            </div>
          ) : resultsData && resultsData.data.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-gray-200 bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">
                        Test Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">
                        Status
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-600">
                        Duration
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">
                        Error Message
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {resultsData.data.map((result) => (
                      <tr key={result.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">{result.testCase?.name}</div>
                          {result.testCase?.description && (
                            <div className="text-xs text-gray-500">{result.testCase.description}</div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant="status" status={result.status}>
                            {result.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-right text-sm text-gray-600">
                          {formatDuration(result.duration)}
                        </td>
                        <td className="max-w-md px-6 py-4">
                          {result.errorMessage ? (
                            <div className="text-sm text-red-600">{result.errorMessage}</div>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {resultsData.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4">
                  <div className="text-sm text-gray-600">
                    Showing {resultsPage * resultsPageSize + 1} to{' '}
                    {Math.min((resultsPage + 1) * resultsPageSize, resultsData.pagination.total)} of{' '}
                    {resultsData.pagination.total} results
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setResultsPage((p) => Math.max(0, p - 1))}
                      disabled={resultsPage === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <span className="text-sm text-gray-600">
                      Page {resultsPage + 1} of {resultsData.pagination.totalPages}
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        setResultsPage((p) => Math.min(resultsData.pagination.totalPages - 1, p + 1))
                      }
                      disabled={resultsPage >= resultsData.pagination.totalPages - 1}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="py-8 text-center text-gray-500">No test results found</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
