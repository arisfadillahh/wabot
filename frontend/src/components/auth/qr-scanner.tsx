'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWhatsAppStore } from '@/store/whatsapp';
import { socketClient } from '@/lib/socket';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { QrCode, RefreshCw, Smartphone, CheckCircle, AlertCircle } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

export function QRScanner() {
  const { status, fetchStatus, setStatus } = useWhatsAppStore();
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  // Define callback functions with useCallback to avoid stale closures
  const handleQrReceived = useCallback((data: any) => {
    setQrCode(data.qrCode);
    setIsScanning(true);
    setStatus({
      ...(status || { isReady: false, isAuthenticated: false, isConnected: false }),
      qrCode: data.qrCode,
      isReady: false,
      isAuthenticated: false,
    });
  }, [setStatus, status]);

  const handleReady = useCallback((data: any) => {
    setQrCode(null);
    setIsScanning(false);
    setStatus({
      ...(status || { isReady: false, isAuthenticated: false, isConnected: false }),
      isReady: true,
      isAuthenticated: true,
      qrCode: undefined,
    });
    toast.success('WhatsApp connected successfully!');
  }, [setStatus, status]);

  const handleStatusChange = useCallback((data: any) => {
    setStatus(data.status);
  }, [setStatus]);

  useEffect(() => {
    fetchStatus();

    // Set up WebSocket listeners
    const sessionToken = localStorage.getItem('sessionToken');
    if (sessionToken && !socketClient.isConnected()) {
      socketClient.connect(sessionToken);
    }

    // Register event listeners
    socketClient.onQrReceived(handleQrReceived);
    socketClient.onReady(handleReady);
    socketClient.onStatusChange(handleStatusChange);

    return () => {
      // Remove event listeners with the same callback functions
      socketClient.offQrReceived(handleQrReceived);
      socketClient.offReady(handleReady);
      socketClient.offStatusChange(handleStatusChange);
    };
  }, [fetchStatus, handleQrReceived, handleReady, handleStatusChange]);

  const handleRefreshQR = async () => {
    try {
      await fetchStatus();
      toast.success('QR code refreshed');
    } catch (error) {
      toast.error('Failed to refresh QR code');
    }
  };

  const getStatusBadge = () => {
    if (!status) return <Badge variant="outline">Unknown</Badge>;

    if (status.isReady) {
      return (
        <Badge variant="success" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
          <CheckCircle className="w-3 h-3 mr-1" />
          Connected
        </Badge>
      );
    }

    if (status.error) {
      return (
        <Badge variant="error" className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
          <AlertCircle className="w-3 h-3 mr-1" />
          Error
        </Badge>
      );
    }

    return (
      <Badge variant="outline">
        <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
        Connecting...
      </Badge>
    );
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <div className="flex items-center justify-center space-x-2">
          <Smartphone className="w-5 h-5 text-whatsapp-600" />
          <CardTitle className="text-xl">WhatsApp Connection</CardTitle>
        </div>
        <div className="flex justify-center mt-2">
          {getStatusBadge()}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <AnimatePresence mode="wait">
          {status?.isReady ? (
            <motion.div
              key="connected"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="text-center py-8"
            >
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-lg font-semibold text-green-600 dark:text-green-400 mb-2">
                Successfully Connected!
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Your WhatsApp account is now linked and ready to use.
              </p>
              {status.lastActivity && (
                <p className="text-xs text-gray-500 mt-2">
                  Last activity: {formatRelativeTime(status.lastActivity)}
                </p>
              )}
            </motion.div>
          ) : qrCode ? (
            <motion.div
              key="qrcode"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center"
            >
              <div className="bg-white p-4 rounded-lg shadow-sm inline-block">
                <div
                  className="w-48 h-48 bg-gray-100 rounded-lg flex items-center justify-center"
                  dangerouslySetInnerHTML={{ __html: qrCode }}
                />
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-4 mb-4">
                Scan this QR code with your WhatsApp app to connect
              </p>
              <Button
                onClick={handleRefreshQR}
                variant="outline"
                size="sm"
                className="text-xs"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Refresh QR Code
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-8"
            >
              <LoadingSpinner size="lg" className="mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400">
                {isScanning ? 'Waiting for QR code...' : 'Connecting to WhatsApp...'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {status?.error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md"
          >
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-600 dark:text-red-400">
                {status.error}
              </p>
            </div>
          </motion.div>
        )}

        <div className="text-xs text-gray-500 dark:text-gray-400 text-center pt-4 border-t">
          <p>Keep this tab open while scanning the QR code</p>
          <p className="mt-1">The QR code will expire in a few minutes</p>
        </div>
      </CardContent>
    </Card>
  );
}