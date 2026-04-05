import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Socket } from 'socket.io';
import { DocumentStatus, WsEvent } from '@afterlight/shared';
import { EventsGateway } from './events.gateway';

interface MockSocket {
  id: string;
  handshake: { auth: Record<string, string> };
  userId?: string;
  disconnect: jest.Mock;
  join: jest.Mock;
}

// Cast a MockSocket to the gateway's expected Socket type for test calls.
// We intentionally use `unknown` → target type to avoid repeating AWS SDK internals.
function asSocket(s: MockSocket): Socket {
  return s as unknown as Socket;
}

function makeSocket(token?: string): MockSocket {
  const auth: Record<string, string> = {};
  if (token !== undefined) auth['token'] = token;
  return {
    id: 'socket-id',
    handshake: { auth },
    disconnect: jest.fn(),
    join: jest.fn(),
  };
}

const mockJwtService = {
  verifyAsync: jest.fn(),
};

const mockConfigService = {
  getOrThrow: jest.fn().mockReturnValue('test-secret'),
};

describe('EventsGateway', () => {
  let gateway: EventsGateway;
  let roomEmit: jest.Mock;
  let mockServer: { to: jest.Mock; emit: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsGateway,
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    gateway = module.get<EventsGateway>(EventsGateway);

    // Inject a mock server — capture roomEmit directly so tests don't call `.emit` on `any`
    roomEmit = jest.fn();
    mockServer = {
      to: jest.fn().mockReturnValue({ emit: roomEmit }),
      emit: jest.fn(),
    };
    gateway.server = mockServer as unknown as typeof gateway.server;

    jest.clearAllMocks();
    mockConfigService.getOrThrow.mockReturnValue('test-secret');
  });

  // ── handleConnection ──────────────────────────────────────────────────────

  describe('handleConnection', () => {
    it('should set userId on socket when token is valid', async () => {
      const client = makeSocket('valid-token');
      mockJwtService.verifyAsync.mockResolvedValue({ sub: 'user-123' });

      await gateway.handleConnection(asSocket(client));

      expect(client.userId).toBe('user-123');
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('should disconnect when no token is provided', async () => {
      const client = makeSocket(undefined);

      await gateway.handleConnection(asSocket(client));

      expect(client.disconnect).toHaveBeenCalled();
    });

    it('should disconnect when token verification fails', async () => {
      const client = makeSocket('bad-token');
      mockJwtService.verifyAsync.mockRejectedValue(new UnauthorizedException('invalid token'));

      await gateway.handleConnection(asSocket(client));

      expect(client.disconnect).toHaveBeenCalled();
      expect(client.userId).toBeUndefined();
    });
  });

  // ── handleDisconnect ──────────────────────────────────────────────────────

  describe('handleDisconnect', () => {
    it('should not throw on disconnect', () => {
      const client = makeSocket();
      expect(() => gateway.handleDisconnect(asSocket(client))).not.toThrow();
    });
  });

  // ── handleJoinCase ────────────────────────────────────────────────────────

  describe('handleJoinCase', () => {
    it('should join the socket to the case room', () => {
      const client = makeSocket();

      gateway.handleJoinCase(asSocket(client), 'case-abc');

      expect(client.join).toHaveBeenCalledWith('case-abc');
    });
  });

  // ── emitDocumentStatus ────────────────────────────────────────────────────

  describe('emitDocumentStatus', () => {
    it('should emit DOCUMENT_PROCESSING_STARTED for PROCESSING status', () => {
      gateway.emitDocumentStatus('case-id', 'doc-id', DocumentStatus.PROCESSING);

      expect(mockServer.to).toHaveBeenCalledWith('case-id');
      expect(roomEmit).toHaveBeenCalledWith(
        WsEvent.DOCUMENT_PROCESSING_STARTED,
        expect.objectContaining({ documentId: 'doc-id', status: DocumentStatus.PROCESSING }),
      );
    });

    it('should emit DOCUMENT_PROCESSING_COMPLETE for PROCESSED status', () => {
      const extractedData = {
        full_name: 'Jane Smith',
      } as unknown as import('@afterlight/shared').ExtractedCertificateData;

      gateway.emitDocumentStatus('case-id', 'doc-id', DocumentStatus.PROCESSED, {
        extractedData,
      });

      expect(roomEmit).toHaveBeenCalledWith(
        WsEvent.DOCUMENT_PROCESSING_COMPLETE,
        expect.objectContaining({ documentId: 'doc-id', extractedData }),
      );
    });

    it('should emit DOCUMENT_PROCESSING_FAILED for FAILED status', () => {
      gateway.emitDocumentStatus('case-id', 'doc-id', DocumentStatus.FAILED, {
        errorMessage: 'Processing failed: ValueError',
      });

      expect(roomEmit).toHaveBeenCalledWith(
        WsEvent.DOCUMENT_PROCESSING_FAILED,
        expect.objectContaining({
          documentId: 'doc-id',
          errorMessage: 'Processing failed: ValueError',
        }),
      );
    });

    it('should not emit for PENDING status', () => {
      gateway.emitDocumentStatus('case-id', 'doc-id', DocumentStatus.PENDING);

      expect(mockServer.to).not.toHaveBeenCalled();
    });

    it('should not include extractedData in payload when not provided', () => {
      gateway.emitDocumentStatus('case-id', 'doc-id', DocumentStatus.PROCESSED);

      const emitCall = roomEmit.mock.calls[0] as [string, object];
      expect(emitCall[1]).not.toHaveProperty('extractedData');
    });
  });
});
