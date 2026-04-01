import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { SessionManager } from '../sessionManager';

// Mock logger
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
};

describe('WS message schema validation (Zod)', () => {
  const ConnectMsg = z.object({ type: z.literal('connect'), sessionId: z.string().optional() });
  const DataMsg = z.object({ type: z.literal('data'), payload: z.string() });
  const ResizeMsg = z.object({
    type: z.literal('resize'),
    payload: z.object({ cols: z.number(), rows: z.number() }),
  });
  const IncomingMsg = z.discriminatedUnion('type', [ConnectMsg, DataMsg, ResizeMsg]);

  it('should validate valid connect messages', () => {
    const valid = IncomingMsg.safeParse({ type: 'connect', sessionId: '123' });
    expect(valid.success).toBe(true);
  });

  it('should reject invalid data messages (payload must be string)', () => {
    const invalid = IncomingMsg.safeParse({ type: 'data', payload: 123 });
    expect(invalid.success).toBe(false);
  });

  it('should validate valid resize messages', () => {
    const valid = IncomingMsg.safeParse({ type: 'resize', payload: { cols: 80, rows: 24 } });
    expect(valid.success).toBe(true);
  });
});

// Mock node-pty
vi.mock('node-pty', () => ({
  spawn: vi.fn().mockReturnValue({
    onData: vi.fn(),
    onExit: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    pid: 1234,
  }),
}));

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SessionManager(mockLogger);
  });

  it('listActiveSessions() returns sessions in the correct format', () => {
    const fakeWs = { send: vi.fn(), readyState: 1 } as any;
    manager.getOrCreateSession('test-id-999', fakeWs);

    const active = manager.listActiveSessions();
    expect(active.length).toBe(1);
    expect(active[0]).toEqual({
      sessionId: 'test-id-999',
      pid: 1234,
    });
  });

  it('destroySession() removes session from tracking', () => {
    const fakeWs = { send: vi.fn(), readyState: 1 } as any;
    manager.getOrCreateSession('kill-me', fakeWs);
    
    expect(manager.listActiveSessions().length).toBe(1);
    
    manager.destroySession('kill-me');
    expect(manager.listActiveSessions().length).toBe(0);
  });
  
  it('shutdown() kills all active sessions', () => {
    const fakeWs = { send: vi.fn(), readyState: 1 } as any;
    manager.getOrCreateSession('s1', fakeWs);
    manager.getOrCreateSession('s2', fakeWs);
    
    expect(manager.listActiveSessions().length).toBe(2);
    
    manager.shutdown();
    expect(manager.listActiveSessions().length).toBe(0);
  });
});
