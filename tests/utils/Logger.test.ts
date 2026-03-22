import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger } from '../../src/utils/Logger.js';

describe('Logger', () => {
  let logger: Logger;
  let spies: { debug: ReturnType<typeof vi.spyOn>; info: ReturnType<typeof vi.spyOn>; warn: ReturnType<typeof vi.spyOn>; error: ReturnType<typeof vi.spyOn> };

  beforeEach(() => {
    logger = new Logger();
    spies = {
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
      info:  vi.spyOn(console, 'info').mockImplementation(() => {}),
      warn:  vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to warn level', () => {
    expect(logger.getLevel()).toBe('warn');
  });

  it('does not log debug/info below warn level', () => {
    logger.debug('d');
    logger.info('i');
    expect(spies.debug).not.toHaveBeenCalled();
    expect(spies.info).not.toHaveBeenCalled();
  });

  it('logs warn and error at warn level', () => {
    logger.warn('w');
    logger.error('e');
    expect(spies.warn).toHaveBeenCalled();
    expect(spies.error).toHaveBeenCalled();
  });

  it('logs everything at debug level', () => {
    logger.setLevel('debug');
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    expect(spies.debug).toHaveBeenCalled();
    expect(spies.info).toHaveBeenCalled();
    expect(spies.warn).toHaveBeenCalled();
    expect(spies.error).toHaveBeenCalled();
  });

  it('logs nothing at none level', () => {
    logger.setLevel('none');
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    expect(spies.debug).not.toHaveBeenCalled();
    expect(spies.info).not.toHaveBeenCalled();
    expect(spies.warn).not.toHaveBeenCalled();
    expect(spies.error).not.toHaveBeenCalled();
  });
});
