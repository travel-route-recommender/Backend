import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CompleteQuizSessionDto } from './quiz-session.dto';

function completeSurveyPayload() {
  return {
    responses: {
      surveyVersion: 9,
      algorithmVersion: 9,
      challengeStyle: {
        challengeStyleAnswers: {
          i18: 4,
          i48: 2,
          i22: 5,
          i52: 4,
          i90: 2,
          i120: 3,
        },
        itineraryMessageAnswers: {
          restaurant: 'like',
          cafe: 'neutral',
          shopping: 'dislike',
          attraction: 'like',
          local: 'like',
          experience: 'neutral',
          nature: 'like',
          rest: 'neutral',
          density: 'like',
        },
        type: 'cautious_explorer',
        scores: {
          opennessToVariety: 75,
          excitementSeeking: 63,
          cautiousness: 81,
          exploration: 69,
        },
        scheduleStyle: {
          type: 'packed',
          score: 72,
          components: { density: 85, activeRestPreference: 64, stamina: 67 },
        },
        itineraryPreference: {
          categoryScores: {
            restaurant: 100,
            cafe: 50,
            shopping: 0,
            attraction: 100,
            local: 100,
            experience: 50,
            nature: 100,
            rest: 50,
          },
          densityScore: 100,
        },
      },
      accommodation: {
        answers: { stayMeaning: 6, locationFacility: 4, comfortPrice: 3 },
        scores: {
          stayImportance: 71,
          facilityOverLocation: 43,
          comfortOverPrice: 71,
        },
      },
      stamina: { answer: 'medium', level: 'NORMAL', score: 50 },
      budget: { ranking: ['food', 'stay', 'activity', 'shopping', 'mobility'] },
      discovery: {
        answers: { landmarkImportance: 3, localInterest: 4 },
        scores: { landmarkImportance: 67, localInterest: 100 },
      },
    },
  };
}

describe('CompleteQuizSessionDto', () => {
  it('accepts every field sent by the current preference survey', async () => {
    const dto = plainToInstance(
      CompleteQuizSessionDto,
      completeSurveyPayload(),
    );
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors).toEqual([]);
  });

  it('still rejects unrelated response fields', async () => {
    const payload = completeSurveyPayload();
    const dto = plainToInstance(CompleteQuizSessionDto, {
      ...payload,
      responses: { ...payload.responses, unexpected: true },
    });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(JSON.stringify(errors)).toContain(
      'property unexpected should not exist',
    );
  });
});
