import {
  Controller,
  Get,
  Header,
  NotFoundException,
  RequestMethod,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import {
  buildAndroidAssetLinks,
  buildAppleAppSiteAssociation,
} from './app-link-association';

export const APP_LINK_ROUTE_EXCLUSIONS = [
  { path: '.well-known/assetlinks.json', method: RequestMethod.GET },
  {
    path: '.well-known/apple-app-site-association',
    method: RequestMethod.GET,
  },
] as const;

@ApiExcludeController()
@Controller('.well-known')
export class AppLinksController {
  constructor(private readonly config: ConfigService) {}

  @Get('assetlinks.json')
  @Header('Content-Type', 'application/json; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  android() {
    const association = buildAndroidAssetLinks({
      packageName: this.config.get<string>('DURI_ANDROID_PACKAGE'),
      fingerprints: this.config.get<string>(
        'DURI_ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS',
      ),
    });
    if (!association) throw new NotFoundException();
    return association;
  }

  @Get('apple-app-site-association')
  @Header('Content-Type', 'application/json; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  apple() {
    const association = buildAppleAppSiteAssociation({
      appIds: this.config.get<string>('DURI_IOS_APP_LINK_APP_IDS'),
    });
    if (!association) throw new NotFoundException();
    return association;
  }
}
