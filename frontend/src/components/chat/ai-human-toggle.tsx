'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, User, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AIHumanToggleProps {
  isAIMode: boolean;
  onToggle: (isAI: boolean) => void;
  className?: string;
  disabled?: boolean;
}

export function AIHumanToggle({
  isAIMode,
  onToggle,
  className,
  disabled = false
}: AIHumanToggleProps) {
  const [isAnimating, setIsAnimating] = useState(false);

  const handleToggle = async () => {
    if (disabled || isAnimating) return;

    setIsAnimating(true);
    try {
      await onToggle(!isAIMode);
    } finally {
      setIsAnimating(false);
    }
  };

  return (
    <div className={cn('relative flex items-center space-x-2', className)}>
      {/* Human Label */}
      <motion.span
        className={cn(
          'text-xs font-medium transition-colors duration-200',
          !isAIMode ? 'text-blue-600' : 'text-gray-400'
        )}
        animate={{ scale: !isAIMode ? 1 : 0.9 }}
      >
        Human
      </motion.span>

      {/* Toggle Button */}
      <motion.button
        onClick={handleToggle}
        disabled={disabled || isAnimating}
        className={cn(
          'relative w-12 h-6 rounded-full p-0.5 transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2',
          isAIMode
            ? 'bg-green-500 focus:ring-green-500'
            : 'bg-blue-500 focus:ring-blue-500',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
        whileHover={!disabled ? { scale: 1.05 } : {}}
        whileTap={!disabled ? { scale: 0.95 } : {}}
      >
        {/* Toggle track background animation */}
        <motion.div
          className="absolute inset-0 rounded-full"
          initial={false}
          animate={{
            backgroundColor: isAIMode ? 'rgba(34, 197, 94, 0.2)' : 'rgba(59, 130, 246, 0.2)',
          }}
          transition={{ duration: 0.3 }}
        />

        {/* Sliding toggle button */}
        <motion.div
          className="relative w-5 h-5 bg-white rounded-full shadow-md flex items-center justify-center"
          animate={{
            x: isAIMode ? 24 : 0,
          }}
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 30
          }}
        >
          {/* Icon inside toggle button */}
          <AnimatePresence mode="wait">
            <motion.div
              key={isAIMode ? 'ai' : 'human'}
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: 180 }}
              transition={{ duration: 0.2 }}
              className="w-3 h-3"
            >
              {isAIMode ? (
                <Bot className={cn('w-3 h-3', isAIMode ? 'text-green-600' : 'text-blue-600')} />
              ) : (
                <User className={cn('w-3 h-3', isAIMode ? 'text-green-600' : 'text-blue-600')} />
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </motion.button>

      {/* AI Label */}
      <motion.span
        className={cn(
          'text-xs font-medium transition-colors duration-200',
          isAIMode ? 'text-green-600' : 'text-gray-400'
        )}
        animate={{ scale: isAIMode ? 1 : 0.9 }}
      >
        AI
      </motion.span>

      {/* Loading overlay */}
      {isAnimating && (
        <motion.div
          className="absolute inset-0 bg-black bg-opacity-20 rounded-full flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
          />
        </motion.div>
      )}
    </div>
  );
}

// Tooltip version for better UX
export function AIHumanToggleWithTooltip({
  isAIMode,
  onToggle,
  className,
  disabled = false
}: AIHumanToggleProps) {
  return (
    <div className="group relative inline-block">
      <AIHumanToggle
        isAIMode={isAIMode}
        onToggle={onToggle}
        className={className}
        disabled={disabled}
      />

      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap">
        {isAIMode ? 'Switch to Human Agent' : 'Switch to Bot AI'}
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
      </div>
    </div>
  );
}