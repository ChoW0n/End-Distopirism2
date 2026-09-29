//캐릭터 녹음 소리 묶음 sounds.json 을 읽는다 (SPEC-005 §14)
//렌더러를 모른다. 어느 장·사건에 어느 소리를 낼지만 정한다. 파일은 읽지 않고 검증만 한다

export interface CharacterSounds {
  character: string;
  //소리 id → 캐릭터 폴더 안 파일
  files: Record<string, string>;
  //소리 id → 세기 (없으면 1)
  gain: Record<string, number>;
  //돌진 시작
  dash: string | null;
  //받아내기가 부딪힐 때
  parry: string | null;
  //장 id → 그 장이 보일 때 낼 소리
  frames: Record<string, string>;
  //궁극기 시간표의 사건 → 소리 (start · cutLine · sheathClick · water)
  ultimate: Record<string, string>;
}

export class CharacterSoundsError extends Error {
  constructor(message: string) {
    super(`sounds: ${message}`);
    this.name = 'CharacterSoundsError';
  }
}

type Json = Record<string, unknown>;

//문자열 값만 든 묶음. _ 로 시작하는 키는 설명이라 건너뛴다
function stringMap(value: unknown, path: string): Record<string, string> {
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new CharacterSoundsError(`${path} 가 객체가 아니다`);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Json)) {
    if (k.startsWith('_')) continue;
    if (typeof v !== 'string' || v.length === 0) throw new CharacterSoundsError(`${path}.${k} 가 문자열이 아니다`);
    out[k] = v;
  }
  return out;
}

//JSON.parse 결과를 검증된 소리 묶음으로 바꾼다. 가리키는 소리 id 는 files 에 있어야 한다
export function parseCharacterSounds(raw: unknown): CharacterSounds {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new CharacterSoundsError('root 가 객체가 아니다');
  const root = raw as Json;
  const character = root['character'];
  if (typeof character !== 'string' || character.length === 0) throw new CharacterSoundsError('character 가 없다');
  const files = stringMap(root['files'], 'files');
  const gainRaw = root['gain'] ?? {};
  const gain: Record<string, number> = {};
  for (const [k, v] of Object.entries(gainRaw as Json)) {
    if (typeof v !== 'number' || !(v >= 0)) throw new CharacterSoundsError(`gain.${k} 가 0 이상 숫자가 아니다`);
    gain[k] = v;
  }
  const optional = (key: string): string | null => {
    const v = root[key];
    if (v === undefined || v === null) return null;
    if (typeof v !== 'string') throw new CharacterSoundsError(`${key} 가 문자열이 아니다`);
    return v;
  };
  const sounds: CharacterSounds = {
    character,
    files,
    gain,
    dash: optional('dash'),
    parry: optional('parry'),
    frames: stringMap(root['frames'], 'frames'),
    ultimate: stringMap(root['ultimate'], 'ultimate'),
  };
  const used = [sounds.dash, sounds.parry, ...Object.values(sounds.frames), ...Object.values(sounds.ultimate), ...Object.keys(gain)];
  for (const id of used) if (id !== null && !(id in files)) throw new CharacterSoundsError(`소리 ${id} 의 파일이 없다`);
  return sounds;
}
