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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtValidatedUser } from '../auth/strategies/jwt.strategy';
import { InternalSecretGuard } from '../common/guards/internal-secret.guard';
import { GeneratedDocumentEntity } from '../entities/generated-document.entity';
import { GeneratedDocumentsService } from './generated-documents.service';
import { CreateGeneratedDocumentDto } from './dto/create-generated-document.dto';
import { GenerationResultDto } from './dto/generation-result.dto';

interface AuthenticatedRequest extends ExpressRequest {
  user: JwtValidatedUser;
}

@Controller()
export class GeneratedDocumentsController {
  constructor(private readonly generatedDocumentsService: GeneratedDocumentsService) {}

  @Version('1')
  @UseGuards(JwtAuthGuard)
  @Post('cases/:caseId/generated-documents')
  @HttpCode(HttpStatus.ACCEPTED)
  create(
    @Request() req: AuthenticatedRequest,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: CreateGeneratedDocumentDto,
  ): Promise<GeneratedDocumentEntity> {
    return this.generatedDocumentsService.create(req.user.userId, caseId, dto);
  }

  @Version('1')
  @UseGuards(JwtAuthGuard)
  @Get('cases/:caseId/generated-documents')
  findAll(
    @Request() req: AuthenticatedRequest,
    @Param('caseId', ParseUUIDPipe) caseId: string,
  ): Promise<GeneratedDocumentEntity[]> {
    return this.generatedDocumentsService.findAll(req.user.userId, caseId);
  }

  @Version('1')
  @UseGuards(InternalSecretGuard)
  @Patch('generated-documents/:id/result')
  @HttpCode(HttpStatus.OK)
  handleGenerationResult(
    @Body() dto: GenerationResultDto,
  ): Promise<GeneratedDocumentEntity> {
    return this.generatedDocumentsService.handleGenerationResult(dto);
  }
}
