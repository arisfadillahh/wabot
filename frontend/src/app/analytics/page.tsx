'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Users,
  MessageSquare,
  Download,
  Calendar,
  Filter,
  RefreshCw,
  Clock,
  Target,
  Activity
} from 'lucide-react';
import { motion } from 'framer-motion';
import { ActivityChart } from '@/components/dashboard/activity-chart';
import { StatsCard } from '@/components/dashboard/stats-card';
import { api } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';

interface MessageStats {
  totalMessages: number;
  sentMessages: number;
  receivedMessages: number;
  failedMessages: number;
  successRate: number;
  avgResponseTime: number;
  activeContacts: number;
}

interface DailyActivity {
  date: string;
  sent: number;
  received: number;
  failed: number;
}

interface TopContact {
  chatId: string;
  name: string;
  messageCount: number;
  lastActivity: string;
}

interface MessageType {
  type: string;
  count: number;
  percentage: number;
}

interface AnalyticsData {
  overview: MessageStats;
  dailyActivity: DailyActivity[];
  topContacts: TopContact[];
  messageTypes: MessageType[];
}

export default function AnalyticsPage() {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDays, setSelectedDays] = useState(30);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  const fetchAnalyticsData = async (days: number = 30) => {
    try {
      setIsLoading(true);
      const response = await api.getDashboardData(days);

      const dashboard = (response as any).data.dashboard;

      const analytics: AnalyticsData = {
        overview: dashboard.overview,
        dailyActivity: dashboard.dailyActivity.map((item: any) => ({
          date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          sent: item.sent,
          received: item.received,
          failed: item.failed
        })),
        topContacts: dashboard.topContacts,
        messageTypes: dashboard.messageTypes
      };

      setAnalyticsData(analytics);
    } catch (error) {
      console.error('Failed to fetch analytics data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalyticsData(selectedDays);
  }, [selectedDays]);

  const handleExportReport = async () => {
    try {
      const response = await (api as any).get(`/api/analytics/export?days=${selectedDays}&format=json`);
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics-report-${selectedDays}days.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export report:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!analyticsData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <BarChart3 className="w-12 h-12 mx-auto mb-4 text-red-500" />
          <h2 className="text-xl font-semibold mb-2">Failed to load analytics</h2>
          <p className="text-gray-600 mb-4">Please check your connection and try again</p>
          <Button onClick={() => fetchAnalyticsData(selectedDays)}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-7xl mx-auto space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-gray-600">Detailed insights and performance metrics</p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Label>Time Range:</Label>
            <select
              value={selectedDays}
              onChange={(e) => setSelectedDays(parseInt(e.target.value))}
              className="px-3 py-2 border rounded-md"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last year</option>
            </select>
          </div>
          <Button onClick={handleExportReport}>
            <Download className="w-4 h-4 mr-2" />
            Export Report
          </Button>
          <Button variant="outline" onClick={() => fetchAnalyticsData(selectedDays)}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Total Messages"
          value={analyticsData.overview.totalMessages.toLocaleString()}
          description="All time messages"
          trend={analyticsData.overview.sentMessages > analyticsData.overview.receivedMessages ? 'up' : 'down'}
          trendValue="+12.5%"
          icon={<MessageSquare className="w-5 h-5 text-blue-600" />}
        />
        <StatsCard
          title="Success Rate"
          value={`${(analyticsData.overview.successRate * 100).toFixed(1)}%`}
          description="Message delivery success"
          trend={analyticsData.overview.successRate > 0.95 ? 'up' : 'down'}
          trendValue="+2.3%"
          icon={<Target className="w-5 h-5 text-green-600" />}
        />
        <StatsCard
          title="Active Contacts"
          value={analyticsData.overview.activeContacts.toLocaleString()}
          description="Engaged users"
          icon={<Users className="w-5 h-5 text-purple-600" />}
        />
        <StatsCard
          title="Avg Response Time"
          value={`${analyticsData.overview.avgResponseTime.toFixed(1)}s`}
          description="Average response time"
          icon={<Clock className="w-5 h-5 text-orange-600" />}
        />
      </div>

      <Tabs defaultValue="activity" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="messages">Message Types</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="activity" className="space-y-6">
          <ActivityChart
            data={analyticsData.dailyActivity}
            title="Message Activity Trends"
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                  <span>Peak Activity</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Math.max(...analyticsData.dailyActivity.map(d => d.sent + d.received))}
                </div>
                <p className="text-sm text-gray-600">Messages in busiest day</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Activity className="w-5 h-5 text-blue-600" />
                  <span>Daily Average</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Math.round(
                    analyticsData.dailyActivity.reduce((sum, d) => sum + d.sent + d.received, 0) / analyticsData.dailyActivity.length
                  )}
                </div>
                <p className="text-sm text-gray-600">Messages per day</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Calendar className="w-5 h-5 text-purple-600" />
                  <span>Activity Period</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{selectedDays}</div>
                <p className="text-sm text-gray-600">Days analyzed</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="contacts" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Top Contacts by Message Count</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analyticsData.topContacts.map((contact, index) => (
                  <motion.div
                    key={contact.chatId}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-whatsapp-100 text-whatsapp-600 rounded-full flex items-center justify-center text-sm font-semibold">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium">{contact.name}</p>
                        <p className="text-sm text-gray-600">
                          Last active {formatRelativeTime(contact.lastActivity)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{contact.messageCount.toLocaleString()}</p>
                      <p className="text-sm text-gray-600">messages</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="messages" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Message Type Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analyticsData.messageTypes.map((type, index) => (
                  <motion.div
                    key={type.type}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium capitalize">{type.type}</span>
                      <span className="text-sm text-gray-600">{type.count.toLocaleString()} ({type.percentage.toFixed(1)}%)</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-whatsapp-600 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${type.percentage}%` }}
                      />
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Message Delivery</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span>Sent Messages</span>
                  <span className="font-semibold">{analyticsData.overview.sentMessages.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Received Messages</span>
                  <span className="font-semibold">{analyticsData.overview.receivedMessages.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Failed Messages</span>
                  <span className="font-semibold text-red-600">{analyticsData.overview.failedMessages.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Success Rate</span>
                  <span className="font-semibold text-green-600">{(analyticsData.overview.successRate * 100).toFixed(1)}%</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Engagement Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span>Active Contacts</span>
                  <span className="font-semibold">{analyticsData.overview.activeContacts.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Avg Response Time</span>
                  <span className="font-semibold">{analyticsData.overview.avgResponseTime.toFixed(1)}s</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Interactions</span>
                  <span className="font-semibold">{analyticsData.overview.totalMessages.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Engagement Rate</span>
                  <span className="font-semibold text-blue-600">
                    {((analyticsData.overview.activeContacts / Math.max((analyticsData.overview as any).totalContacts, 1)) * 100).toFixed(1)}%
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}