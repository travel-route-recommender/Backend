import { detectFileKind } from './local-upload.service';

describe('detectFileKind', () => {
  it.each([
    ['jpeg', Buffer.from([0xff, 0xd8, 0xff, 0x00])],
    ['png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ['webp', Buffer.from('RIFF0000WEBP', 'ascii')],
    ['heif', Buffer.from([0, 0, 0, 0, ...Buffer.from('ftypheic', 'ascii')])],
    ['pdf', Buffer.from('%PDF-1.7', 'ascii')],
  ] as const)('%s magic signature를 식별한다', (kind, buffer) => {
    expect(detectFileKind(buffer)).toBe(kind);
  });

  it('확장자 문자열만 있는 파일은 허용하지 않는다', () => {
    expect(detectFileKind(Buffer.from('not really a png'))).toBeNull();
    expect(detectFileKind(Buffer.alloc(0))).toBeNull();
  });
});
