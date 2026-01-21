import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import { Card, CardContent } from '@/components/Card';
import { CenteredSpinner } from '@/components/Spinner';
import { Badge } from '@/components/Badge';
import { formatDate } from '@/lib/utils';
import { Folder, ChevronRight } from 'lucide-react';

export function TestSuites() {
  const { data, isLoading } = useQuery({
    queryKey: ['suites'],
    queryFn: () => api.getTestSuites(),
  });

  const { data: runsData } = useQuery({
    queryKey: ['runs', 'all'],
    queryFn: () => api.getTestRuns({ take: 1000, skip: 0 }),
  });

  // Calculate stats per suite
  const getSuiteStats = (suiteId: string) => {
    const runs = runsData?.data.filter((r) => r.testSuiteId === suiteId) || [];
    const completed = runs.filter((r) => r.status === 'COMPLETED').length;
    const failed = runs.filter((r) => r.status === 'FAILED').length;
    const totalPassed = runs.reduce((sum, r) => sum + r.passedCount, 0);
    const totalFailed = runs.reduce((sum, r) => sum + r.failedCount, 0);
    const passRate = totalPassed + totalFailed > 0 ? (totalPassed / (totalPassed + totalFailed)) * 100 : 0;

    return { runs: runs.length, completed, failed, passRate };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Test Suites</h2>
      </div>

      {isLoading ? (
        <CenteredSpinner />
      ) : data && data.data.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {data.data.map((suite) => {
            const stats = getSuiteStats(suite.id);
            return (
              <Link key={suite.id} to={`/test-suites/${suite.id}`}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Folder className="h-5 w-5 text-gray-400" />
                          <h3 className="text-lg font-semibold text-gray-900">{suite.name}</h3>
                        </div>
                        {suite.description && (
                          <p className="mt-2 text-sm text-gray-600 line-clamp-2">{suite.description}</p>
                        )}

                        <div className="mt-4 flex flex-wrap gap-2">
                          {suite.tags.map((tag) => (
                            <Badge key={tag} variant="default">
                              {tag}
                            </Badge>
                          ))}
                        </div>

                        <div className="mt-4 grid grid-cols-3 gap-4 border-t border-gray-200 pt-4">
                          <div className="text-center">
                            <p className="text-2xl font-bold text-gray-900">{stats.runs}</p>
                            <p className="text-xs text-gray-600">Runs</p>
                          </div>
                          <div className="text-center">
                            <p className="text-2xl font-bold text-green-600">{stats.passRate.toFixed(0)}%</p>
                            <p className="text-xs text-gray-600">Pass Rate</p>
                          </div>
                          <div className="text-center">
                            <p className="text-2xl font-bold text-gray-900">{stats.completed}</p>
                            <p className="text-xs text-gray-600">Completed</p>
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-gray-400" />
                    </div>
                    <p className="mt-4 text-xs text-gray-500">
                      Created {formatDate(suite.createdAt)}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="p-12 text-center text-gray-500">No test suites found</CardContent>
        </Card>
      )}
    </div>
  );
}
