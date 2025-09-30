'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWhatsAppStore } from '@/store/whatsapp';
import { websocketService } from '@/lib/websocket';
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
    console.log('🎯 QR received from backend:', data);
    console.log('🎯 QR data type:', data.qrDataUrl ? 'Data URL' : data.qrHtml ? 'HTML' : data.qrCode ? 'Raw QR' : 'Unknown');
    // Use the data URL if available, otherwise fall back to raw QR
    const qrImageData = data.qrDataUrl || data.qrHtml || data.qrCode;
    console.log('🎯 Setting QR code:', qrImageData ? 'QR data received' : 'No QR data');
    setQrCode(qrImageData);
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
    console.log('🚀 QRScanner: Initializing QR scanner...');

    // Force fetch status immediately
    fetchStatus();

    // Set up WebSocket listeners with faster connection
    if (!websocketService.isConnected()) {
      console.log('🔌 QRScanner: Connecting WebSocket...');
      websocketService.connect({
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 10
      });
    } else {
      console.log('🔌 QRScanner: WebSocket already connected');
    }

    // Register event listeners
    const unsubscribeQr = websocketService.on('whatsapp:qr', handleQrReceived);
    const unsubscribeReady = websocketService.on('whatsapp:ready', handleReady);
    const unsubscribeStatus = websocketService.on('whatsapp:status', handleStatusChange);

    // Auto-request QR if WhatsApp is not ready after 1 second
    const autoRequestTimeout = setTimeout(() => {
      if (!status?.isReady && !qrCode) {
        console.log('⚡ QRScanner: Auto-requesting QR generation...');
        if (websocketService.isConnected()) {
          websocketService.sendMessage('request-qr', {});
        }
      }
    }, 1000);

    // Set a timeout to request QR if not received within 3 seconds
    const qrTimeout = setTimeout(() => {
      if (!qrCode && !status?.isReady) {
        console.log('⏰ QRScanner: No QR received after 3 seconds, requesting status refresh...');
        fetchStatus();

        // Try to manually trigger QR generation by connecting to WebSocket again
        if (websocketService.isConnected()) {
          console.log('🔄 QRScanner: Manually requesting QR via WebSocket...');
          websocketService.sendMessage('request-qr', {});
        }
      }
    }, 3000);

    // Set another timeout for backup
    const backupTimeout = setTimeout(() => {
      if (!qrCode && !status?.isReady) {
        console.log('⏰ QRScanner: Still no QR after 6 seconds, showing loading state...');
        setIsScanning(true);
      }
    }, 6000);

    return () => {
      // Remove event listeners
      unsubscribeQr();
      unsubscribeReady();
      unsubscribeStatus();
      clearTimeout(autoRequestTimeout);
      clearTimeout(qrTimeout);
      clearTimeout(backupTimeout);
    };
  }, [fetchStatus, handleQrReceived, handleReady, handleStatusChange, qrCode, status?.isReady]);

  const handleRefreshQR = async () => {
    try {
      console.log('🔄 Manual QR refresh requested');
      setQrCode(null);
      setIsScanning(false);

      // Force WebSocket reconnection
      if (websocketService.isConnected()) {
        websocketService.disconnect();
      }

      // Wait a bit then reconnect
      setTimeout(() => {
        websocketService.connect({
          reconnection: true,
          reconnectionDelay: 500,
          reconnectionAttempts: 5
        });

        // Send manual QR request after connection
        setTimeout(() => {
          if (websocketService.isConnected()) {
            websocketService.sendMessage('request-qr', {});
          }
        }, 1000);
      }, 500);

      await fetchStatus();
      toast.success('QR code refresh requested');
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
                {qrCode.startsWith('data:image') ? (
                  <img
                    src={qrCode}
                    alt="WhatsApp QR Code"
                    className="w-48 h-48"
                  />
                ) : (
                  <div
                    className="w-48 h-48 bg-gray-100 rounded-lg flex items-center justify-center"
                    dangerouslySetInnerHTML={{ __html: qrCode }}
                  />
                )}
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