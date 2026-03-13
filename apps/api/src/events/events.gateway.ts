import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { DocumentStatus, ExtractedCertificateData } from '@afterlight/shared';

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

@WebSocketGateway({ cors: true, namespace: '/events' })
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join-document')
  handleJoinDocument(client: Socket, documentId: string): void {
    void client.join(documentId);
    this.logger.log(`Client ${client.id} joined room for document: ${documentId}`);
  }

  emitDocumentStatus(
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

    this.server.to(documentId).emit('document:status', payload);
    this.logger.log(`Emitted document:status for document: ${documentId}, status: ${status}`);
  }
}
