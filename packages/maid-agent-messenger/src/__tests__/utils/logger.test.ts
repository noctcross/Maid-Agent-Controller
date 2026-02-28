/**
 * ログユーティリティのテスト
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  logger,
  setLogLevel,
  getLogLevel,
  createPrefixedLogger,
  LOG_LEVELS,
  type LogLevel,
} from '../../utils/logger.js';

describe('logger', () => {
  let originalLogLevel: LogLevel;
  let consoleDebugSpy: jest.SpiedFunction<typeof console.debug>;
  let consoleInfoSpy: jest.SpiedFunction<typeof console.info>;
  let consoleWarnSpy: jest.SpiedFunction<typeof console.warn>;
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    originalLogLevel = getLogLevel();
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    setLogLevel(originalLogLevel);
    jest.restoreAllMocks();
  });

  describe('LOG_LEVELS', () => {
    it('should have correct level ordering', () => {
      expect(LOG_LEVELS.DEBUG).toBeLessThan(LOG_LEVELS.INFO);
      expect(LOG_LEVELS.INFO).toBeLessThan(LOG_LEVELS.WARN);
      expect(LOG_LEVELS.WARN).toBeLessThan(LOG_LEVELS.ERROR);
      expect(LOG_LEVELS.ERROR).toBeLessThan(LOG_LEVELS.SILENT);
    });
  });

  describe('setLogLevel / getLogLevel', () => {
    it('should change and retrieve log level', () => {
      setLogLevel('DEBUG');
      expect(getLogLevel()).toBe('DEBUG');

      setLogLevel('ERROR');
      expect(getLogLevel()).toBe('ERROR');
    });
  });

  describe('log level filtering', () => {
    it('should log DEBUG when level is DEBUG', () => {
      setLogLevel('DEBUG');
      logger.debug('test message');
      expect(consoleDebugSpy).toHaveBeenCalled();
    });

    it('should not log DEBUG when level is INFO', () => {
      setLogLevel('INFO');
      logger.debug('test message');
      expect(consoleDebugSpy).not.toHaveBeenCalled();
    });

    it('should log INFO when level is INFO', () => {
      setLogLevel('INFO');
      logger.info('test message');
      expect(consoleInfoSpy).toHaveBeenCalled();
    });

    it('should log WARN when level is WARN', () => {
      setLogLevel('WARN');
      logger.warn('test message');
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('should not log INFO when level is WARN', () => {
      setLogLevel('WARN');
      logger.info('test message');
      expect(consoleInfoSpy).not.toHaveBeenCalled();
    });

    it('should log ERROR when level is ERROR', () => {
      setLogLevel('ERROR');
      logger.error('test message');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should not log anything when level is SILENT', () => {
      setLogLevel('SILENT');
      logger.debug('test');
      logger.info('test');
      logger.warn('test');
      logger.error('test');
      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleInfoSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('message formatting', () => {
    it('should include timestamp in log message', () => {
      setLogLevel('INFO');
      logger.info('test message');
      const loggedMessage = consoleInfoSpy.mock.calls[0][0] as string;
      // ISO8601 timestamp pattern
      expect(loggedMessage).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should include log level in message', () => {
      setLogLevel('INFO');
      logger.info('test message');
      const loggedMessage = consoleInfoSpy.mock.calls[0][0] as string;
      expect(loggedMessage).toContain('[INFO]');
    });

    it('should include context as JSON', () => {
      setLogLevel('INFO');
      logger.info('test message', { key: 'value' });
      const loggedMessage = consoleInfoSpy.mock.calls[0][0] as string;
      expect(loggedMessage).toContain('{"key":"value"}');
    });
  });

  describe('error logging', () => {
    it('should include error details in context', () => {
      setLogLevel('ERROR');
      const error = new Error('Test error');
      logger.error('An error occurred', error);
      const loggedMessage = consoleErrorSpy.mock.calls[0][0] as string;
      expect(loggedMessage).toContain('Test error');
      expect(loggedMessage).toContain('Error');
    });

    it('should handle non-Error objects', () => {
      setLogLevel('ERROR');
      logger.error('An error occurred', { code: 500, reason: 'Server error' });
      const loggedMessage = consoleErrorSpy.mock.calls[0][0] as string;
      expect(loggedMessage).toContain('500');
      expect(loggedMessage).toContain('Server error');
    });
  });

  describe('createPrefixedLogger', () => {
    it('should add prefix to log messages', () => {
      setLogLevel('INFO');
      const wsLogger = createPrefixedLogger('WebSocket');
      wsLogger.info('Connected');
      const loggedMessage = consoleInfoSpy.mock.calls[0][0] as string;
      expect(loggedMessage).toContain('[WebSocket]');
      expect(loggedMessage).toContain('Connected');
    });

    it('should respect log level', () => {
      setLogLevel('WARN');
      const wsLogger = createPrefixedLogger('WebSocket');
      wsLogger.info('Connected');
      expect(consoleInfoSpy).not.toHaveBeenCalled();
    });
  });
});
