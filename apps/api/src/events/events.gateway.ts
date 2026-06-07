import { Logger, UnauthorizedException } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DocumentStatus, ExtractedCertificateData, WsEvent } from '@tarpan/shared';

export interface DocumentStatusPayload {
  documentId: string;
  status: DocumentStatus;
  extractedData?: ExtractedCertificateData;
  errorMessage?: string;
}

export interface DocumentStatusExtra {
  extractedData?: ExtractedCertificateData;
  errorMessage?: string;
}

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

@WebSocketGateway({
  cors: {
    origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:5173',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  namespace: '/',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  @WebSocketServer()
  server!: Server;

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const token = client.handshake.auth.token as string | undefined;
      if (!token) {
        throw new UnauthorizedException('No token provided');
      }

      const secret = this.config.getOrThrow<string>('JWT_SECRET');
      const payload = await this.jwtService.verifyAsync<{ sub: string }>(token, { secret });
      client.userId = payload.sub;

      this.logger.log(`Client connected: ${client.id} (user: ${client.userId})`);
    } catch (error) {
      this.logger.warn(
        `Connection rejected: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join-case')
  handleJoinCase(client: Socket, caseId: string): void {
    void client.join(caseId);
    this.logger.log(`Client ${client.id} joined room for case: ${caseId}`);
  }

  emitDocumentStatus(
    caseId: string,
    documentId: string,
    status: DocumentStatus,
    extra?: DocumentStatusExtra,
  ): void {
    const payload: DocumentStatusPayload = { documentId, status };

    if (extra?.extractedData !== undefined) {
      payload.extractedData = extra.extractedData;
    }

    if (extra?.errorMessage !== undefined) {
      payload.errorMessage = extra.errorMessage;
    }

    // Emit the appropriate event based on status
    let event: WsEvent;
    if (status === DocumentStatus.PROCESSING) {
      event = WsEvent.DOCUMENT_PROCESSING_STARTED;
    } else if (status === DocumentStatus.PROCESSED) {
      event = WsEvent.DOCUMENT_PROCESSING_COMPLETE;
    } else if (status === DocumentStatus.FAILED) {
      event = WsEvent.DOCUMENT_PROCESSING_FAILED;
    } else {
      // For PENDING or other statuses, don't emit
      return;
    }

    this.server.to(caseId).emit(event, payload);
    this.logger.log(`Emitted ${event} for document: ${documentId} in case: ${caseId}`);
  }
}
