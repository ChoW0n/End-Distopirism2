//UI 수치 파일을 파일에서 읽어오는 어댑터
//node-manifest.ts 와 같은 자리다. UI 계층은 파일 시스템을 모른다

import { readFileSync } from 'node:fs';
import { parseUiData, type UiData } from '../ui/data.js';

//assets/ui/ui-data.json 을 읽는다. 키가 빠져 있으면 여기서 던진다
export function loadUiData(path: string): UiData {
  return parseUiData(JSON.parse(readFileSync(path, 'utf-8')));
}
