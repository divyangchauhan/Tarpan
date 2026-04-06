import { Controller, Get, UseGuards, Version } from '@nestjs/common';
import { Template } from '@afterlight/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TemplatesService } from './templates.service';

@Controller()
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Version('1')
  @UseGuards(JwtAuthGuard)
  @Get('templates')
  findAll(): Template[] {
    return this.templatesService.findAll();
  }
}
