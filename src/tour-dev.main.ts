import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
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
  app.enableCors();

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
