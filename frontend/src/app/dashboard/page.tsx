'use client';

import { useEffect, useState } from 'react';
import { StatsCard } from '@/components/dashboard/stats-card';
import { ActivityChart } from '@/components/dashboard/activity-chart';
import { RecentChats } from '@/components/dashboard/recent-chats';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  MessageSquare,
  Users,
  Send,
  TrendingUp,
  Clock,
  AlertCircle,
  CheckCircle,
  Wifi,
  WifiOff,
  RefreshCw,
  Settings
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useWhatsAppStore } from '@/store/whatsapp';
import { useSessionStore } from '@/store/session';
import { api } from '@/lib/api';

interface DashboardStats {
  totalMessages: number;
  totalContacts: number;
  messagesSent: number;
  messagesReceived: number;
  failedMessages: number;
  unreadMessages: number;
  connectionStatus: 'connected' | 'disconnected' | 'connecting';
  lastActivity: string;
  messageTrend: 'up' | 'down' | 'neutral';
  contactTrend: 'up' | 'down' | 'neutral';
}

interface ActivityData {
  date: string;
  sent: number;
  received: number;
  failed: number;
}

export default function DashboardPage() {
  const { session } = useSessionStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activityData, setActivityData] = useState<ActivityData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true);
      const response = await api.getDashboardData(7);

      const dashboard = (response as any).data.dashboard;

      setStats({
        totalMessages: dashboard.overview.totalMessages,
        totalContacts: dashboard.overview.totalContacts,
        messagesSent: dashboard.overview.messagesSent,
        messagesReceived: dashboard.overview.messagesReceived,
        failedMessages: dashboard.overview.failedMessages,
        unreadMessages: dashboard.overview.unreadMessages,
        connectionStatus: dashboard.connectionStatus,
        lastActivity: dashboard.lastActivity,
        messageTrend: dashboard.overview.messageTrend,
        contactTrend: dashboard.overview.contactTrend,
      });

      const formattedActivityData = dashboard.dailyActivity.map((item: any) => ({
        date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        sent: item.sent,
        received: item.received,
        failed: item.failed,
      }));

      setActivityData(formattedActivityData);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  const getConnectionStatus = () => {
    if (!stats) return { icon: <WifiOff className="w-4 h-4" />, label: 'Unknown', color: 'bg-gray-100 text-gray-600' };

    switch (stats.connectionStatus) {
      case 'connected':
        return { icon: <CheckCircle className="w-4 h-4" />, label: 'Connected', color: 'bg-green-100 text-green-600' };
      case 'connecting':
        return { icon: <RefreshCw className="w-4 h-4 animate-spin" />, label: 'Connecting...', color: 'bg-yellow-100 text-yellow-600' };
      default:
        return { icon: <WifiOff className="w-4 h-4" />, label: 'Disconnected', color: 'bg-red-100 text-red-600' };
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
          <h2 className="text-xl font-semibold mb-2">Failed to load dashboard</h2>
          <p className="text-gray-600 mb-4">Please check your connection and try again</p>
          <Button onClick={fetchDashboardData}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const connectionStatus = getConnectionStatus();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-gray-600">Welcome back, User!</p>
        </div>
        <div className="flex items-center space-x-4">
          <Badge variant="outline" className={connectionStatus.color}>
            {connectionStatus.icon}
            <span className="ml-1">{connectionStatus.label}</span>
          </Badge>
          <Badge variant="outline">
            <Clock className="w-4 h-4 mr-1" />
            Updated {lastUpdated.toLocaleTimeString()}
          </Badge>
          <Button variant="outline" size="sm" onClick={fetchDashboardData}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Total Messages"
          value={stats.totalMessages.toLocaleString()}
          description="All time messages"
          trend={stats.messageTrend}
          trendValue="+12.5%"
          icon={<MessageSquare className="w-5 h-5 text-blue-600" />}
        />
        <StatsCard
          title="Contacts"
          value={stats.totalContacts.toLocaleString()}
          description="Active contacts"
          trend={stats.contactTrend}
          trendValue="+8.3%"
          icon={<Users className="w-5 h-5 text-green-600" />}
        />
        <StatsCard
          title="Messages Sent"
          value={stats.messagesSent.toLocaleString()}
          description="Messages sent today"
          icon={<Send className="w-5 h-5 text-purple-600" />}
        />
        <StatsCard
          title="Unread Messages"
          value={stats.unreadMessages.toLocaleString()}
          description="Messages to read"
          icon={<AlertCircle className="w-5 h-5 text-orange-600" />}
        />
      </div>

      {/* Activity Chart */}
      <ActivityChart
        data={activityData}
        title="Message Activity (Last 7 Days)"
      />

      {/* Recent Chats and Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecentChats />
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Settings className="w-5 h-5" />
              <span>Quick Actions</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full" variant="outline">
              <Send className="w-4 h-4 mr-2" />
              Send New Message
            </Button>
            <Button className="w-full" variant="outline">
              <TrendingUp className="w-4 h-4 mr-2" />
              View Analytics
            </Button>
            <Button className="w-full" variant="outline">
              <MessageSquare className="w-4 h-4 mr-2" />
              Chat Settings
            </Button>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}