import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  APP_LINK_ROUTE_EXCLUSIONS,
  AppLinksController,
} from './app-links.controller';

const FINGERPRINT = Array.from({ length: 32 }, () => 'AA').join(':');

describe('AppLinksController routes', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const values: Record<string, string> = {
      DURI_ANDROID_PACKAGE: 'com.tripmatch.app',
      DURI_ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS: FINGERPRINT,
      DURI_IOS_APP_LINK_APP_IDS: 'ABCDE12345.com.tripmatch.app',
    };
    const module = await Test.createTestingModule({
      controllers: [AppLinksController],
      providers: [
        {
          provide: ConfigService,
          useValue: { get: (key: string) => values[key] },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1', {
      exclude: [...APP_LINK_ROUTE_EXCLUSIONS],
    });
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  it('serves Android verification at the HTTPS origin root', async () => {
    const response = await fetch(`${baseUrl}/.well-known/assetlinks.json`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    const body = (await response.json()) as Array<{
      target?: { package_name?: string };
    }>;
    expect(body[0]?.target?.package_name).toBe('com.tripmatch.app');
  });

  it('serves iOS verification at the HTTPS origin root', async () => {
    const response = await fetch(
      `${baseUrl}/.well-known/apple-app-site-association`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    const body = (await response.json()) as {
      applinks?: { details?: Array<{ appID?: string }> };
    };
    expect(body.applinks?.details?.[0]?.appID).toBe(
      'ABCDE12345.com.tripmatch.app',
    );
  });

  it('does not accidentally publish association files below the API prefix', async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/.well-known/assetlinks.json`,
    );
    expect(response.status).toBe(404);
  });

  afterAll(async () => {
    await app.close();
  });
});
