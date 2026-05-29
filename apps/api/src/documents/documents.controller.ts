import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Request,
  UseGuards,
  Version,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { DocumentEntity } from '../entities/document.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtValidatedUser } from '../auth/strategies/jwt.strategy';
import { DocumentsService, InitiateUploadResult } from './documents.service';
import { InitiateUploadDto } from './dto/initiate-upload.dto';
import { ProcessingResultDto } from './dto/processing-result.dto';
import { InternalSecretGuard } from './guards/internal-secret.guard';

interface AuthenticatedRequest extends ExpressRequest {
  user: JwtValidatedUser;
}

@Controller()
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Version('1')
  @UseGuards(JwtAuthGuard)
  @Get('cases/:caseId/documents')
  findAll(
    @Request() req: AuthenticatedRequest,
    @Param('caseId', ParseUUIDPipe) caseId: string,
  ): Promise<DocumentEntity[]> {
    return this.documentsService.findAll(req.user.userId, caseId);
  }

  @Version('1')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @UseGuards(JwtAuthGuard)
  @Post('cases/:caseId/documents/initiate-upload')
  initiateUpload(
    @Request() req: AuthenticatedRequest,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: InitiateUploadDto,
  ): Promise<InitiateUploadResult> {
    return this.documentsService.initiateUpload(req.user.userId, caseId, dto);
  }

  @Version('1')
  @UseGuards(JwtAuthGuard)
  @Get('cases/:caseId/documents/:id')
  findOne(
    @Request() req: AuthenticatedRequest,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DocumentEntity> {
    return this.documentsService.findOne(req.user.userId, caseId, id);
  }

  @Version('1')
  @UseGuards(JwtAuthGuard)
  @Post('cases/:caseId/documents/:id/process')
  @HttpCode(HttpStatus.ACCEPTED)
  enqueueProcessing(
    @Request() req: AuthenticatedRequest,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DocumentEntity> {
    return this.documentsService.enqueueProcessing(req.user.userId, caseId, id);
  }

  @Version('1')
  @SkipThrottle()
  @UseGuards(InternalSecretGuard)
  @Patch('documents/:id/processing-result')
  @HttpCode(HttpStatus.OK)
  handleProcessingResult(@Body() dto: ProcessingResultDto): Promise<DocumentEntity> {
    return this.documentsService.handleProcessingResult(dto);
  }
}
