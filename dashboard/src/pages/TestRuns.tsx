import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card, CardContent } from '@/components/Card';
import { CenteredSpinner } from '@/components/Spinner';
import { getPlatformIcon, formatDuration, formatDate } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Eye, X } from 'lucide-react';

export function TestRuns() {
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['runs', page, statusFilter],
    queryFn: () =>
      api.getTestRuns({
        skip: page * pageSize,
        take: pageSize,
        ...(statusFilter !== 'all' && { status: statusFilter }),
      }),
    refetchInterval: 5000,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.cancelTestRun(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs'] });
      queryClient.invalidateQueries({ queryKey: ['summary'] });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Test Runs</h2>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            Status:
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(0);
              }}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            >
              <option value="all">All</option>
              <option value="PENDING">Pending</option>
              <option value="RUNNING">Running</option>
              <option value="COMPLETED">Completed</option>
              <option value="FAILED">Failed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </label>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex min-h-[400px] items-center justify-center">
              <CenteredSpinner />
            </div>
          ) : data && data.data.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-gray-200 bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">
                        Test Suite
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">
                        Device
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">
                        Status
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-600">
                        Results
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-600">
                        Duration
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-600">
                        Started
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-600">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {data.data.map((run) => (
                      <tr key={run.id} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">{run.testSuite?.name}</div>
                          <div className="text-xs text-gray-500">{run.id.slice(0, 8)}</div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="flex items-center gap-2 text-sm text-gray-900">
                            <span>{getPlatformIcon(run.device?.platform || 'ANDROID')}</span>
                            <span>{run.device?.name}</span>
                            <span className="text-xs text-gray-500">({run.device?.osVersion})</span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <Badge variant="status" status={run.status}>
                            {run.status}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                          <span className="font-medium text-green-600">{run.passedCount} passed</span>
                          <span className="mx-1 text-gray-400">/</span>
                          <span className="font-medium text-red-600">{run.failedCount} failed</span>
                          {run.skippedCount > 0 && (
                            <>
                              <span className="mx-1 text-gray-400">/</span>
                              <span className="text-gray-500">{run.skippedCount} skipped</span>
                            </>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-600">
                          {run.totalDuration ? formatDuration(run.totalDuration) : '-'}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-600">
                          {run.startedAt ? formatDate(run.startedAt) : '-'}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                          <div className="flex items-center justify-end gap-2">
                            <Link to={`/test-runs/${run.id}`}>
                              <Button size="sm" variant="ghost">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </Link>
                            {(run.status === 'PENDING' || run.status === 'RUNNING') && (
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => cancelMutation.mutate(run.id)}
                                disabled={cancelMutation.isPending}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {data.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4">
                  <div className="text-sm text-gray-600">
                    Showing {page * pageSize + 1} to {Math.min((page + 1) * pageSize, data.pagination.total)} of{' '}
                    {data.pagination.total} results
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <span className="text-sm text-gray-600">
                      Page {page + 1} of {data.pagination.totalPages}
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setPage((p) => Math.min(data.pagination.totalPages - 1, p + 1))}
                      disabled={page >= data.pagination.totalPages - 1}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="py-12 text-center text-gray-500">No test runs found</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
