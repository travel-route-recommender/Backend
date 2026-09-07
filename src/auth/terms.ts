import { BadRequestException } from '@nestjs/common';

export type TermsInput = {
  termsVersion?: string;
  privacyConsentVersion?: string;
  overFourteenConfirmed?: boolean;
};

export type TermsConsent = {
  termsVersion: string;
  privacyConsentVersion: string;
  overFourteenConfirmed: true;
  consentedAt: Date;
};

export function requireTermsConsent(input: TermsInput): TermsConsent {
  if (
    !input.termsVersion?.trim() ||
    !input.privacyConsentVersion?.trim() ||
    input.overFourteenConfirmed !== true
  ) {
    throw new BadRequestException({
      code: 'TERMS_REQUIRED',
      message:
        '약관 동의(termsVersion, privacyConsentVersion, overFourteenConfirmed=true)가 필요합니다.',
    });
  }
  return {
    termsVersion: input.termsVersion.trim(),
    privacyConsentVersion: input.privacyConsentVersion.trim(),
    overFourteenConfirmed: true,
    consentedAt: new Date(),
  };
}

export function termsToUserFields(consent: TermsConsent) {
  return {
    termsVersion: consent.termsVersion,
    privacyConsentVersion: consent.privacyConsentVersion,
    overFourteenConfirmed: true,
    termsConsentedAt: consent.consentedAt,
  };
}
