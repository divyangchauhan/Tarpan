import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Feature modules will be imported here in subsequent PRs:
    // TypeOrmModule.forRootAsync(...),
    // AuthModule,
    // CasesModule,
    // DocumentsModule,
    // GenerationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
