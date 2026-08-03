import { Model } from 'mongoose';
import { AppCacheService } from '../common/cache/app-cache.service';
import { PlaceDocument } from '../schemas/place.schema';
import { TourApiClient } from './tour-api.client';
import { TourService } from './tour.service';
import { PlaceCard } from './tour.util';

/** 분류명은 DB 저장 → 재조회(sort=popular) 경로에서 보존되어야 한다. */
describe('TourService 분류체계 매핑', () => {
  const service = new TourService(
    {} as TourApiClient,
    {} as AppCacheService,
    {} as Model<PlaceDocument>,
  );

  const card: PlaceCard = {
    id: '126508',
    source: 'TOUR_API',
    contentTypeId: 12,
    contentTypeLabel: '관광지',
    lclsSystm1: 'NA',
    lclsSystm1Name: '자연관광',
    lclsSystm2: 'NA02',
    lclsSystm2Name: '자연생태',
    lclsSystm3: 'NA020400',
    lclsSystm3Name: '숲',
    name: '성산일출봉',
    address: '제주특별자치도 서귀포시 성산읍',
    areaCode: '39',
    sigunguCode: '4',
    thumbnailUrl: null,
    latitude: 33.458,
    longitude: 126.942,
  };

  it('저장 payload에 분류 코드와 분류명을 함께 담는다', () => {
    const payload = service['toTourPlaceCardPayload'](card);

    expect(payload).toMatchObject({
      lclsSystm1: 'NA',
      lclsSystm1Name: '자연관광',
      lclsSystm2: 'NA02',
      lclsSystm2Name: '자연생태',
      lclsSystm3: 'NA020400',
      lclsSystm3Name: '숲',
    });
  });

  it('저장된 문서를 카드로 되읽을 때 분류명을 복원한다', () => {
    const stored = {
      _id: { toString: () => '665abc123def456789012345' },
      externalId: card.id,
      contentTypeId: card.contentTypeId,
      category: card.contentTypeLabel,
      name: card.name,
      address: card.address,
      areaCode: card.areaCode,
      sigunguCode: card.sigunguCode,
      images: [],
      lat: card.latitude,
      lng: card.longitude,
      ...service['toTourPlaceCardPayload'](card),
    } as unknown as PlaceDocument;

    expect(service['toStoredTourPlaceCard'](stored)).toMatchObject({
      lclsSystm1Name: '자연관광',
      lclsSystm2Name: '자연생태',
      lclsSystm3Name: '숲',
    });
  });

  it('분류명이 없는 문서는 null로 되읽는다', () => {
    const stored = {
      _id: { toString: () => '665abc123def456789012345' },
      externalId: card.id,
      name: card.name,
      address: '',
      images: [],
    } as unknown as PlaceDocument;

    expect(service['toStoredTourPlaceCard'](stored)).toMatchObject({
      lclsSystm1Name: null,
      lclsSystm2Name: null,
      lclsSystm3Name: null,
    });
  });
});
