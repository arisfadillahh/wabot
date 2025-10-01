'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  BarChart3,
  TrendingUp,
  Users,
  MessageSquare,
  Download,
  RefreshCw,
  Clock
} from 'lucide-react';
import { motion } from 'framer-motion';
import { ActivityChart } from '@/components/dashboard/activity-chart';
import { StatsCard } from '@/components/dashboard/stats-card';
import { ResponseTypeChart } from '@/components/analytics/response-type-chart';
import { HourlyActivityChart } from '@/components/analytics/hourly-activity-chart';
import { WeeklyTrendChart } from '@/components/analytics/weekly-trend-chart';
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
  const [peakHoursData, setPeakHoursData] = useState<{ hour: string; messages: number }[]>([]);

  const [aiResponses, setAiResponses] = useState(0);
  const [humanResponses, setHumanResponses] = useState(0);
  const [weeklyData, setWeeklyData] = useState<{ date: string; messages: number }[]>([]);

  const fetchAnalyticsData = async (days: number = 30) => {
    try {
      setIsLoading(true);

      let response;

      // Try API client first, fallback to direct fetch
      try {
        response = await api.getOverview(days);
      } catch (apiError) {
        console.log('API client failed, trying direct fetch:', apiError);
        // Fallback to direct fetch with API key
        const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
        const fetchResponse = await fetch(`${API_BASE}/api/test/analytics/overview?days=${days}`, {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': '123'
          }
        });
        response = await fetchResponse.json();
      }

      const data = response;

      if (data.success) {
        const overview = data.data;

        // Update AI and Human response counts
        setAiResponses(overview.aiProcessed || 24);
        setHumanResponses(overview.humanProcessed || 22);

        const analytics: AnalyticsData = {
          overview: {
            totalMessages: overview.totalMessages || 0,
            sentMessages: overview.outgoingMessages || 0,
            receivedMessages: overview.incomingMessages || 0,
            failedMessages: 0,
            successRate: overview.totalMessages > 0 ? (overview.outgoingMessages / overview.totalMessages) : 0,
            avgResponseTime: 2.5,
            activeContacts: overview.totalChats || 0
          },
          dailyActivity: [], // Empty for now since we don't have this data
          topContacts: [], // Empty for now since we don't have this data
          messageTypes: [
            { type: 'text', count: overview.totalMessages || 0, percentage: 100 }
          ]
        };

        setAnalyticsData(analytics);
      }

      // Fetch peak hours data
      try {
        const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
        const peakHoursResponse = await fetch(`${API_BASE}/api/test/analytics/peak-hours?days=${days}`, {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': '123'
          }
        });

        if (peakHoursResponse.ok) {
          const peakHoursResult = await peakHoursResponse.json();
          if (peakHoursResult.data && peakHoursResult.data.hourlyData) {
            const formattedData = peakHoursResult.data.hourlyData.map((item: { hour: number; messages: number }) => ({
              hour: item.hour.toString().padStart(2, '0') + ':00',
              messages: item.messages
            }));
            setPeakHoursData(formattedData);
          }
        }
      } catch (peakHoursError) {
        console.log('Failed to fetch peak hours data:', peakHoursError);
        // Keep empty array if API fails
      }

      // Fetch daily activity data for weekly trend
      try {
        const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
        const dailyResponse = await fetch(`${API_BASE}/api/test/analytics/daily?days=7`, {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': '123'
          }
        });

        if (dailyResponse.ok) {
          const dailyResult = await dailyResponse.json();
          if (dailyResult.data && dailyResult.data.dailyActivity) {
            // Convert date to day name and format for WeeklyTrendChart
            const formattedWeeklyData = dailyResult.data.dailyActivity.map((item: { date: string; messages: number }) => {
              const date = new Date(item.date);
              const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
              return {
                day: dayName,
                messages: item.messages
              };
            });
            setWeeklyData(formattedWeeklyData);
          }
        }
      } catch (dailyError) {
        console.log('Failed to fetch daily activity data:', dailyError);
        // Keep empty array if API fails
      }
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
      const response = await api.getAnalytics();
      const blob = new Blob([JSON.stringify(response, null, 2)], { type: 'application/json' });
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
          description="All messages"
          trend="up"
          trendValue="+12.5%"
          icon={<MessageSquare className="w-5 h-5 text-blue-600" />}
        />
        <StatsCard
          title="AI Responses"
          value={aiResponses.toLocaleString()}
          description="AI handled messages"
          trend="up"
          trendValue="+8.2%"
          icon={<TrendingUp className="w-5 h-5 text-green-600" />}
        />
        <StatsCard
          title="Human Responses"
          value={humanResponses.toLocaleString()}
          description="Human handled messages"
          trend="down"
          trendValue="-3.1%"
          icon={<Users className="w-5 h-5 text-purple-600" />}
        />
      </div>

      {/* Charts Row 1: Response Distribution & Hourly Activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Response Type Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponseTypeChart aiResponses={aiResponses} humanResponses={humanResponses} />
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Peak Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <HourlyActivityChart data={peakHoursData} />
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2: Weekly Trend & Performance Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-6">
            <WeeklyTrendChart data={weeklyData} />
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Performance Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-gray-400">Sent Messages</span>
              <span className="font-semibold text-white">{analyticsData.overview.sentMessages.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Received Messages</span>
              <span className="font-semibold text-white">{analyticsData.overview.receivedMessages.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Success Rate</span>
              <span className="font-semibold text-green-400">{(analyticsData.overview.successRate * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Avg Response Time</span>
              <span className="font-semibold text-white">{analyticsData.overview.avgResponseTime.toFixed(1)}s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Active Contacts</span>
              <span className="font-semibold text-white">{analyticsData.overview.activeContacts.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}