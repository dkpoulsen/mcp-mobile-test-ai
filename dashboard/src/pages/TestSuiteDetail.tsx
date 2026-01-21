import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import api from '@/lib/api';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/Card';
import { CenteredSpinner } from '@/components/Spinner';
import { formatDate } from '@/lib/utils';
import { ArrowLeft, Play, List, Clock } from 'lucide-react';
import { useState } from 'react';

export function TestSuiteDetail() {
  const { id } = useParams<{ id: string }>();
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  const { data: suite, isLoading: suiteLoading } = useQuery({
    queryKey: ['suite', id],
    queryFn: () => api.getTestSuite(id!),
    enabled: !!id,
  });

  const { data: cases } = useQuery({
    queryKey: ['cases', id],
    queryFn: () => api.getTestCases({ testSuiteId: id }),
    enabled: !!id,
  });

  const { data: devices } = useQuery({
    queryKey: ['devices'],
    queryFn: () => api.getDevices(),
  });

  const { data: runs } = useQuery({
    queryKey: ['runs', 'suite', id],
    queryFn: () => api.getTestRuns({ testSuiteId: id, take: 10, skip: 0 }),
    enabled: !!id,
  });

  if (suiteLoading || !suite) {
    return <CenteredSpinner />;
  }

  const testSuite = suite.data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/test-suites">
            <Button size="sm" variant="ghost">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{testSuite.name}</h2>
            <p className="text-sm text-gray-600">ID: {testSuite.id}</p>
          </div>
        </div>
        <Button onClick={() => setShowScheduleModal(true)}>
          <Play className="mr-2 h-4 w-4" />
          Run Tests
        </Button>
      </div>

      {/* Description */}
      {testSuite.description && (
        <Card>
          <CardContent className="p-6">
            <p className="text-gray-700">{testSuite.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <List className="h-10 w-10 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600">Test Cases</p>
                <p className="text-2xl font-bold text-gray-900">{cases?.data.length || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <Play className="h-10 w-10 text-green-600" />
              <div>
                <p className="text-sm text-gray-600">Total Runs</p>
                <p className="text-2xl font-bold text-gray-900">{runs?.data.length || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <Clock className="h-10 w-10 text-purple-600" />
              <div>
                <p className="text-sm text-gray-600">Created</p>
                <p className="text-sm font-medium text-gray-900">{formatDate(testSuite.createdAt)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Test Cases */}
      <Card>
        <CardHeader>
          <CardTitle>Test Cases</CardTitle>
        </CardHeader>
        <CardContent>
          {cases && cases.data.length > 0 ? (
            <div className="space-y-4">
              {cases.data.map((testCase) => (
                <div key={testCase.id} className="border-b border-gray-200 pb-4 last:border-0">
                  <h4 className="font-medium text-gray-900">{testCase.name}</h4>
                  {testCase.description && (
                    <p className="mt-1 text-sm text-gray-600">{testCase.description}</p>
                  )}
                  {testCase.expectedOutcome && (
                    <div className="mt-2">
                      <p className="text-xs font-medium text-gray-700">Expected Outcome:</p>
                      <p className="text-sm text-gray-600">{testCase.expectedOutcome}</p>
                    </div>
                  )}
                  {testCase.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {testCase.tags.map((tag) => (
                        <Badge key={tag} variant="default" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {testCase.timeout && (
                    <p className="mt-2 text-xs text-gray-500">Timeout: {testCase.timeout}ms</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-gray-500">No test cases found</div>
          )}
        </CardContent>
      </Card>

      {/* Schedule Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Schedule Test Run</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const deviceId = formData.get('device') as string;
                  if (deviceId) {
                    await api.createTestRun({ testSuiteId: id!, deviceId });
                    setShowScheduleModal(false);
                    window.location.href = '/test-runs';
                  }
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700">Device</label>
                  <select
                    name="device"
                    required
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">Select a device...</option>
                    {devices?.data
                      .filter((d) => d.status === 'AVAILABLE')
                      .map((device) => (
                        <option key={device.id} value={device.id}>
                          {device.platform === 'IOS' ? '🍎' : '🤖'} {device.name} ({device.osVersion})
                        </option>
                      ))}
                  </select>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => setShowScheduleModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">Start Test Run</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
