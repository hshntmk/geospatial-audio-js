import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from '../../src/utils/EventEmitter.js';

describe('EventEmitter', () => {
  it('calls registered handler with emitted arguments', () => {
    const emitter = new EventEmitter();
    const handler = vi.fn();
    emitter.on('test', handler);
    emitter.emit('test', 'a', 42);
    expect(handler).toHaveBeenCalledWith('a', 42);
  });

  it('calls multiple handlers for the same event', () => {
    const emitter = new EventEmitter();
    const h1 = vi.fn();
    const h2 = vi.fn();
    emitter.on('evt', h1);
    emitter.on('evt', h2);
    emitter.emit('evt');
    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  it('does not call handler after off()', () => {
    const emitter = new EventEmitter();
    const handler = vi.fn();
    emitter.on('test', handler);
    emitter.off('test', handler);
    emitter.emit('test');
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not throw when emitting with no listeners', () => {
    const emitter = new EventEmitter();
    expect(() => emitter.emit('no-listeners')).not.toThrow();
  });

  it('removeAllListeners() clears all events', () => {
    const emitter = new EventEmitter();
    const h = vi.fn();
    emitter.on('a', h);
    emitter.on('b', h);
    emitter.removeAllListeners();
    emitter.emit('a');
    emitter.emit('b');
    expect(h).not.toHaveBeenCalled();
  });

  it('removeAllListeners(event) only clears the specified event', () => {
    const emitter = new EventEmitter();
    const h = vi.fn();
    emitter.on('a', h);
    emitter.on('b', h);
    emitter.removeAllListeners('a');
    emitter.emit('a');
    emitter.emit('b');
    expect(h).toHaveBeenCalledOnce(); // only 'b' fired
  });

  it('does not call the same handler twice if registered twice', () => {
    const emitter = new EventEmitter();
    const h = vi.fn();
    emitter.on('evt', h);
    emitter.on('evt', h); // duplicate — Set deduplicates
    emitter.emit('evt');
    expect(h).toHaveBeenCalledOnce();
  });
});
