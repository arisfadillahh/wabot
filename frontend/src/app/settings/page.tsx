'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Settings,
  User,
  Bell,
  Shield,
  Database,
  Key,
  Save,
  RefreshCw,
  Trash2,
  Download,
  Upload,
  MessageSquare
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useSessionStore } from '@/store/session';

export default function SettingsPage() {
  const { session } = useSessionStore();
  const [isLoading, setIsLoading] = useState(false);
  const [settings, setSettings] = useState({
    notifications: {
      email: true,
      push: true,
      webhook: true,
      desktop: false
    },
    privacy: {
      readReceipts: true,
      onlineStatus: true,
      profilePhoto: true,
      lastSeen: true
    },
    chat: {
      aiMode: false,
      autoReply: false,
      typingIndicators: true,
      messagePreview: true
    },
    security: {
      twoFactor: false,
      sessionTimeout: 30,
      autoLogout: false,
      encryptedStorage: true
    },
    api: {
      rateLimit: 100,
      webhooks: true,
      retryAttempts: 3,
      cacheTTL: 300
    }
  });

  const handleSave = async () => {
    setIsLoading(true);
    // Simulate API call
    setTimeout(() => {
      setIsLoading(false);
    }, 1000);
  };

  const handleExportData = () => {
    // Export user data functionality
    console.log('Exporting data...');
  };

  const handleDeleteAccount = () => {
    // Delete account functionality
    console.log('Deleting account...');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-4xl mx-auto space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-gray-600">Configure your WhatsApp Bot preferences</p>
        </div>
        <Button onClick={handleSave} disabled={isLoading}>
          {isLoading ? (
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save Changes
        </Button>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="api">API</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <User className="w-5 h-5" />
                <span>Profile Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    defaultValue={session?.apiKey?.substring(0, 8) || 'user123'}
                    disabled
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    defaultValue="user@example.com"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  placeholder="Tell us about yourself..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Settings className="w-5 h-5" />
                <span>Application Settings</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Theme</Label>
                  <p className="text-sm text-gray-600">Choose your preferred theme</p>
                </div>
                <select className="px-3 py-2 border rounded-md">
                  <option>Light</option>
                  <option>Dark</option>
                  <option>System</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Language</Label>
                  <p className="text-sm text-gray-600">Select your language</p>
                </div>
                <select className="px-3 py-2 border rounded-md">
                  <option>English</option>
                  <option>Spanish</option>
                  <option>French</option>
                  <option>German</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Timezone</Label>
                  <p className="text-sm text-gray-600">Set your timezone</p>
                </div>
                <select className="px-3 py-2 border rounded-md">
                  <option>UTC</option>
                  <option>EST</option>
                  <option>PST</option>
                  <option>CST</option>
                </select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Bell className="w-5 h-5" />
                <span>Notification Preferences</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(settings.notifications).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <div>
                    <Label className="capitalize">{key}</Label>
                    <p className="text-sm text-gray-600">
                      Receive {key} notifications
                    </p>
                  </div>
                  <Switch
                    checked={value}
                    onCheckedChange={(checked) =>
                      setSettings(prev => ({
                        ...prev,
                        notifications: { ...prev.notifications, [key]: checked }
                      }))
                    }
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="chat" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <MessageSquare className="w-5 h-5" />
                <span>Chat Settings</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(settings.chat).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <div>
                    <Label className="capitalize">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </Label>
                    <p className="text-sm text-gray-600">
                      {key === 'aiMode' && 'Enable AI-powered responses'}
                      {key === 'autoReply' && 'Automatically reply to messages'}
                      {key === 'typingIndicators' && 'Show typing indicators'}
                      {key === 'messagePreview' && 'Show message previews'}
                    </p>
                  </div>
                  <Switch
                    checked={value}
                    onCheckedChange={(checked) =>
                      setSettings(prev => ({
                        ...prev,
                        chat: { ...prev.chat, [key]: checked }
                      }))
                    }
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Shield className="w-5 h-5" />
                <span>Security Settings</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Two-Factor Authentication</Label>
                  <p className="text-sm text-gray-600">Add an extra layer of security</p>
                </div>
                <Switch
                  checked={settings.security.twoFactor}
                  onCheckedChange={(checked) =>
                    setSettings(prev => ({
                      ...prev,
                      security: { ...prev.security, twoFactor: checked }
                    }))
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Session Timeout (minutes)</Label>
                  <p className="text-sm text-gray-600">Auto-logout after inactivity</p>
                </div>
                <Input
                  type="number"
                  value={settings.security.sessionTimeout}
                  onChange={(e) =>
                    setSettings(prev => ({
                      ...prev,
                      security: { ...prev.security, sessionTimeout: parseInt(e.target.value) }
                    }))
                  }
                  className="w-20"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Auto Logout</Label>
                  <p className="text-sm text-gray-600">Automatically logout on browser close</p>
                </div>
                <Switch
                  checked={settings.security.autoLogout}
                  onCheckedChange={(checked) =>
                    setSettings(prev => ({
                      ...prev,
                      security: { ...prev.security, autoLogout: checked }
                    }))
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Encrypted Storage</Label>
                  <p className="text-sm text-gray-600">Store data encrypted locally</p>
                </div>
                <Switch
                  checked={settings.security.encryptedStorage}
                  onCheckedChange={(checked) =>
                    setSettings(prev => ({
                      ...prev,
                      security: { ...prev.security, encryptedStorage: checked }
                    }))
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Key className="w-5 h-5" />
                <span>API Key Management</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Current API Key</Label>
                <div className="flex items-center space-x-2 mt-1">
                  <Input
                    value={session?.apiKey || ''}
                    type="password"
                    readOnly
                    className="flex-1"
                  />
                  <Button variant="outline" size="sm">
                    Copy
                  </Button>
                  <Button variant="outline" size="sm">
                    Regenerate
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Database className="w-5 h-5" />
                <span>API Configuration</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Rate Limit (requests/minute)</Label>
                  <p className="text-sm text-gray-600">Maximum requests per minute</p>
                </div>
                <Input
                  type="number"
                  value={settings.api.rateLimit}
                  onChange={(e) =>
                    setSettings(prev => ({
                      ...prev,
                      api: { ...prev.api, rateLimit: parseInt(e.target.value) }
                    }))
                  }
                  className="w-20"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Webhooks</Label>
                  <p className="text-sm text-gray-600">Enable webhook functionality</p>
                </div>
                <Switch
                  checked={settings.api.webhooks}
                  onCheckedChange={(checked) =>
                    setSettings(prev => ({
                      ...prev,
                      api: { ...prev.api, webhooks: checked }
                    }))
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Retry Attempts</Label>
                  <p className="text-sm text-gray-600">Number of retry attempts for failed requests</p>
                </div>
                <Input
                  type="number"
                  value={settings.api.retryAttempts}
                  onChange={(e) =>
                    setSettings(prev => ({
                      ...prev,
                      api: { ...prev.api, retryAttempts: parseInt(e.target.value) }
                    }))
                  }
                  className="w-20"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Cache TTL (seconds)</Label>
                  <p className="text-sm text-gray-600">Time to live for cached data</p>
                </div>
                <Input
                  type="number"
                  value={settings.api.cacheTTL}
                  onChange={(e) =>
                    setSettings(prev => ({
                      ...prev,
                      api: { ...prev.api, cacheTTL: parseInt(e.target.value) }
                    }))
                  }
                  className="w-20"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Danger Zone */}
      <Card>
        <CardHeader>
          <CardTitle className="text-red-600">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg">
            <div>
              <h4 className="font-medium text-red-900">Export Data</h4>
              <p className="text-sm text-red-700">Download all your data</p>
            </div>
            <Button variant="outline" onClick={handleExportData}>
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
          <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg">
            <div>
              <h4 className="font-medium text-red-900">Delete Account</h4>
              <p className="text-sm text-red-700">Permanently delete your account and all data</p>
            </div>
            <Button variant="destructive" onClick={handleDeleteAccount}>
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}