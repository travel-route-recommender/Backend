import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { buildCorsOptions, parseCorsOrigins } from './config/cors';
import { TourDevModule } from './tour-dev.module';

async function bootstrap() {
  const app = await NestFactory.create(TourDevModule);

  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  const configService = app.get(ConfigService);
  app.enableCors(
    buildCorsOptions(
      parseCorsOrigins(configService.get<string>('WEB_AUTH_ORIGINS')),
    ),
  );

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
