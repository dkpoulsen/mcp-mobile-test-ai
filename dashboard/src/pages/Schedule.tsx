import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/Card';
import { CenteredSpinner } from '@/components/Spinner';
import { Badge } from '@/components/Badge';
import { Play, Clock, CheckCircle2, XCircle } from 'lucide-react';

export function Schedule() {
  const [selectedSuite, setSelectedSuite] = useState<string>('');
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const queryClient = useQueryClient();

  const { data: suites, isLoading: suitesLoading } = useQuery({
    queryKey: ['suites'],
    queryFn: () => api.getTestSuites(),
  });

  const { data: devices } = useQuery({
    queryKey: ['devices'],
    queryFn: () => api.getDevices(),
    refetchInterval: 5000,
  });

  const { data: runs } = useQuery({
    queryKey: ['runs', 'pending'],
    queryFn: () => api.getTestRuns({ take: 20, skip: 0, status: 'PENDING' }),
    refetchInterval: 5000,
  });

  const createMutation = useMutation({
    mutationFn: (data: { testSuiteId: string; deviceId: string }) => api.createTestRun(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs'] });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['summary'] });
      setSelectedSuite('');
      setSelectedDevice('');
    },
  });

  const handleSchedule = () => {
    if (selectedSuite && selectedDevice) {
      createMutation.mutate({ testSuiteId: selectedSuite, deviceId: selectedDevice });
    }
  };

  if (suitesLoading) {
    return <CenteredSpinner />;
  }

  const availableDevices = devices?.data.filter((d) => d.status === 'AVAILABLE') || [];
  const busyDevices = devices?.data.filter((d) => d.status === 'BUSY') || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Schedule Test Runs</h2>
          <p className="text-gray-600">Configure and execute test runs on your devices</p>
        </div>
      </div>

      {/* Schedule Form */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="h-5 w-5" />
              Quick Run
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Test Suite</label>
              <select
                value={selectedSuite}
                onChange={(e) => setSelectedSuite(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Select a test suite...</option>
                {suites?.data.map((suite) => (
                  <option key={suite.id} value={suite.id}>
                    {suite.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Device</label>
              <select
                value={selectedDevice}
                onChange={(e) => setSelectedDevice(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Select a device...</option>
                {availableDevices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.platform === 'IOS' ? '🍎' : '🤖'} {device.name} ({device.osVersion})
                  </option>
                ))}
              </select>
            </div>

            <Button
              onClick={handleSchedule}
              disabled={!selectedSuite || !selectedDevice || createMutation.isPending}
              className="w-full"
            >
              {createMutation.isPending ? 'Scheduling...' : 'Start Test Run'}
            </Button>
          </CardContent>
        </Card>

        {/* Device Status */}
        <Card>
          <CardHeader>
            <CardTitle>Device Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h4 className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Available ({availableDevices.length})
                </h4>
                <div className="mt-2 space-y-2">
                  {availableDevices.length === 0 ? (
                    <p className="text-sm text-gray-500">No devices available</p>
                  ) : (
                    availableDevices.map((device) => (
                      <div
                        key={device.id}
                        className="flex items-center justify-between rounded-md border border-green-200 bg-green-50 px-3 py-2"
                      >
                        <span className="text-sm">
                          {device.platform === 'IOS' ? '🍎' : '🤖'} {device.name}
                        </span>
                        <Badge variant="status" status={device.status} className="text-xs">
                          {device.status}
                        </Badge>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <h4 className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <XCircle className="h-4 w-4 text-red-600" />
                  Busy ({busyDevices.length})
                </h4>
                <div className="mt-2 space-y-2">
                  {busyDevices.length === 0 ? (
                    <p className="text-sm text-gray-500">No devices busy</p>
                  ) : (
                    busyDevices.map((device) => (
                      <div
                        key={device.id}
                        className="flex items-center justify-between rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2"
                      >
                        <span className="text-sm">
                          {device.platform === 'IOS' ? '🍎' : '🤖'} {device.name}
                        </span>
                        <Badge variant="status" status={device.status} className="text-xs">
                          {device.status}
                        </Badge>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Runs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Pending & Running Tests
          </CardTitle>
        </CardHeader>
        <CardContent>
          {runs && runs.data.length > 0 ? (
            <div className="space-y-3">
              {runs.data.map((run) => (
                <div
                  key={run.id}
                  className="flex items-center justify-between rounded-md border border-gray-200 px-4 py-3"
                >
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{run.testSuite?.name}</p>
                    <p className="text-sm text-gray-600">
                      {run.device?.platform === 'IOS' ? '🍎' : '🤖'} {run.device?.name} • ID:{' '}
                      {run.id.slice(0, 8)}
                    </p>
                  </div>
                  <Badge variant="status" status={run.status}>
                    {run.status}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-gray-500">No pending or running tests</div>
          )}
        </CardContent>
      </Card>

      {/* All Devices List */}
      <Card>
        <CardHeader>
          <CardTitle>All Devices</CardTitle>
        </CardHeader>
        <CardContent>
          {devices && devices.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="pb-3 text-left text-sm font-medium text-gray-600">Platform</th>
                    <th className="pb-3 text-left text-sm font-medium text-gray-600">Name</th>
                    <th className="pb-3 text-left text-sm font-medium text-gray-600">OS Version</th>
                    <th className="pb-3 text-left text-sm font-medium text-gray-600">Type</th>
                    <th className="pb-3 text-left text-sm font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.data.map((device) => (
                    <tr key={device.id} className="border-b border-gray-100">
                      <td className="py-3 text-sm">
                        {device.platform === 'IOS' ? '🍎 iOS' : '🤖 Android'}
                      </td>
                      <td className="py-3 text-sm font-medium">{device.name}</td>
                      <td className="py-3 text-sm text-gray-600">{device.osVersion}</td>
                      <td className="py-3 text-sm text-gray-600">
                        {device.isEmulator ? 'Emulator' : 'Real Device'}
                      </td>
                      <td className="py-3">
                        <Badge variant="status" status={device.status}>
                          {device.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 text-center text-gray-500">No devices found</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
