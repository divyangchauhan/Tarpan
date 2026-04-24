import {
  Body,
  Controller,
  Delete,
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
import { CaseEntity } from '../entities/case.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtValidatedUser } from '../auth/strategies/jwt.strategy';
import { CasesService } from './cases.service';
import { CreateCaseDto } from './dto/create-case.dto';
import { UpdateCaseDto } from './dto/update-case.dto';

interface AuthenticatedRequest extends ExpressRequest {
  user: JwtValidatedUser;
}

@Controller('cases')
@UseGuards(JwtAuthGuard)
export class CasesController {
  constructor(private readonly casesService: CasesService) {}

  @Version('1')
  @Get()
  findAll(@Request() req: AuthenticatedRequest): Promise<CaseEntity[]> {
    return this.casesService.findAll(req.user.userId);
  }

  @Version('1')
  @Post()
  create(@Request() req: AuthenticatedRequest, @Body() dto: CreateCaseDto): Promise<CaseEntity> {
    return this.casesService.create(req.user.userId, dto);
  }

  @Version('1')
  @Get(':id')
  findOne(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CaseEntity> {
    return this.casesService.findOne(req.user.userId, id);
  }

  @Version('1')
  @Patch(':id')
  update(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCaseDto,
  ): Promise<CaseEntity> {
    return this.casesService.update(req.user.userId, id, dto);
  }

  @Version('1')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.casesService.remove(req.user.userId, id);
  }
}
