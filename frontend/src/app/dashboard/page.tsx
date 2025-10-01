'use client';

import { useEffect, useState } from 'react';
import { StatsCard } from '@/components/dashboard/stats-card';
import { ActivityChart } from '@/components/dashboard/activity-chart';
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
import { QRScanner } from '@/components/auth/qr-scanner';
import { useSessionStore } from '@/store/session';
import { api } from '@/lib/api';

interface DashboardStats {
  totalMessages: number;
  totalContacts: number;
  messagesSent: number;
  messagesReceived: number;
  failedMessages: number;
  unreadMessages: number;
  aiMessages: number;
  humanMessages: number;
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
  const { status, fetchStatus } = useWhatsAppStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activityData, setActivityData] = useState<ActivityData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [showQRScanner, setShowQRScanner] = useState(false);

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true);

      // Use the same working analytics API endpoint
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      const response = await fetch(`${API_BASE}/api/test/analytics/overview?days=7`);
      const data = await response.json();

      if (data.success) {
        const overview = data.data;

        setStats({
          totalMessages: overview.totalMessages || 0,
          totalContacts: overview.totalChats || 0,
          messagesSent: overview.outgoingMessages || 0,
          messagesReceived: overview.incomingMessages || 0,
          failedMessages: 0, // WhatsApp doesn't track failed messages the same way
          unreadMessages: 0, // TODO: Implement unread message tracking
          aiMessages: overview.aiProcessed || 0,
          humanMessages: overview.humanProcessed || 0,
          connectionStatus: 'connected', // TODO: Get actual connection status
          lastActivity: new Date().toISOString(),
          messageTrend: overview.totalMessages > 0 ? 'up' : 'neutral',
          contactTrend: overview.totalChats > 0 ? 'up' : 'neutral',
        });

        // Empty activity data for now since we don't have trends
        setActivityData([]);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      // Don't show error to user, just use default stats
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Check WhatsApp status first
    fetchStatus();

    // Only fetch dashboard data if WhatsApp is connected
    if (status?.isReady) {
      fetchDashboardData();
    } else {
      setIsLoading(false);
    }

    // Auto-refresh untuk real-time dashboard updates
    const interval = setInterval(() => {
      fetchStatus();
      if (status?.isReady) {
        fetchDashboardData();
      }
    }, 5000); // Refresh setiap 5 detik

    return () => clearInterval(interval);
  }, [fetchStatus, status?.isReady]);

  const getConnectionStatus = () => {
    if (!status) return { icon: <WifiOff className="w-4 h-4" />, label: 'Unknown', color: 'bg-gray-100 text-gray-600' };

    if (status.isReady) {
      return { icon: <CheckCircle className="w-4 h-4" />, label: 'Connected', color: 'bg-green-100 text-green-600' };
    }

    if (status.qrCode) {
      return { icon: <RefreshCw className="w-4 h-4 animate-spin" />, label: 'Waiting for QR Scan...', color: 'bg-yellow-100 text-yellow-600' };
    }

    return { icon: <WifiOff className="w-4 h-4" />, label: 'Disconnected', color: 'bg-red-100 text-red-600' };
  };

  if (isLoading && !status) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // Show QR scanner if WhatsApp is not connected
  if (!status?.isReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              WhatsApp Connection Required
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Connect your WhatsApp account to access the dashboard
            </p>
          </div>
          <QRScanner />
        </div>
      </div>
    );
  }

  // Show default dashboard if no stats are available
  if (!stats) {
    const defaultStats: DashboardStats = {
      totalMessages: 0,
      totalContacts: 0,
      messagesSent: 0,
      messagesReceived: 0,
      failedMessages: 0,
      unreadMessages: 0,
      aiMessages: 0,
      humanMessages: 0,
      connectionStatus: 'disconnected',
      lastActivity: new Date().toISOString(),
      messageTrend: 'neutral',
      contactTrend: 'neutral'
    };

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
            <Badge variant="outline" className="bg-yellow-100 text-yellow-600">
              <AlertCircle className="w-4 h-4 mr-1" />
              <span className="ml-1">Limited Data</span>
            </Badge>
            <Button variant="outline" size="sm" onClick={fetchDashboardData}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
          <StatsCard
            title="Total Messages"
            value={defaultStats.totalMessages.toLocaleString()}
            description="All time messages"
            trend={defaultStats.messageTrend}
            trendValue="0%"
            icon={<MessageSquare className="w-5 h-5 text-blue-600" />}
          />
          <StatsCard
            title="Contacts"
            value={defaultStats.totalContacts.toLocaleString()}
            description="Active contacts"
            trend={defaultStats.contactTrend}
            trendValue="0%"
            icon={<Users className="w-5 h-5 text-green-600" />}
          />
          <StatsCard
            title="Messages Sent"
            value={defaultStats.messagesSent.toLocaleString()}
            description="Messages sent today"
            icon={<Send className="w-5 h-5 text-purple-600" />}
          />
          <StatsCard
            title="AI Handled"
            value={defaultStats.aiMessages.toLocaleString()}
            description="AI processed messages"
            icon={<TrendingUp className="w-5 h-5 text-indigo-600" />}
          />
          <StatsCard
            title="Human Handled"
            value={defaultStats.humanMessages.toLocaleString()}
            description="Human processed messages"
            icon={<Users className="w-5 h-5 text-teal-600" />}
          />
          <StatsCard
            title="Unread Messages"
            value={defaultStats.unreadMessages.toLocaleString()}
            description="Messages to read"
            icon={<AlertCircle className="w-5 h-5 text-orange-600" />}
          />
        </div>

        {/* Empty State */}
        <Card>
          <CardContent className="p-12 text-center">
            <AlertCircle className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <h3 className="text-xl font-semibold mb-2">No Data Available</h3>
            <p className="text-gray-600 mb-6">
              Connect your WhatsApp account and start sending messages to see dashboard analytics.
            </p>
            <Button onClick={fetchDashboardData}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Loading Data Again
            </Button>
          </CardContent>
        </Card>
      </motion.div>
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
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
          title="AI Handled"
          value={stats.aiMessages.toLocaleString()}
          description="AI processed messages"
          icon={<TrendingUp className="w-5 h-5 text-indigo-600" />}
        />
        <StatsCard
          title="Human Handled"
          value={stats.humanMessages.toLocaleString()}
          description="Human processed messages"
          icon={<Users className="w-5 h-5 text-teal-600" />}
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

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <Card className="lg:col-span-3">
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