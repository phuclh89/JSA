import { describe, expect, it } from 'vitest';
import type { JsaDraftDetail, TranslationDetail } from '@jsams/shared-types';
import { translatedJsa } from './translation-print-page';

describe('translatedJsa', () => {
  it('places translated content into the normal JSA document and preserves reference data', () => {
    const source = {
      versionId: 'version-3',
      jobTitle: 'English job',
      languageCode: 'EN',
      languageName: 'English',
      matrix: { id: 'matrix-1' },
      prompts: [{ id: 'prompt-1', label: 'Hard hat', selected: true }],
      tasks: [
        {
          id: 'task-1',
          logicalKey: 'task-key',
          title: 'English task',
          hazards: [
            {
              id: 'hazard-1',
              logicalKey: 'hazard-key',
              text: 'English hazard',
              controls: [
                {
                  id: 'control-1',
                  logicalKey: 'control-key',
                  text: 'English control',
                },
              ],
            },
          ],
        },
      ],
      basicSteps: [
        {
          id: 'step-1',
          logicalKey: 'step-key',
          text: 'English step',
          performers: [{ id: 'role-1', name: 'Floorhand' }],
          supervisors: [{ id: 'role-2', name: 'Driller' }],
          tools: [{ id: 'tool-1', name: 'Hammer' }],
        },
      ],
    } as unknown as JsaDraftDetail;
    const translation = {
      targetLanguageCode: 'VI',
      targetLanguageName: 'Vietnamese',
      segments: [
        {
          entityType: 'HEADER',
          sourceLogicalKey: 'version-3',
          fieldCode: 'JOB_TITLE',
          translatedText: 'Công việc',
        },
        {
          entityType: 'TASK',
          sourceLogicalKey: 'task-key',
          fieldCode: 'TITLE',
          translatedText: 'Công việc số 1',
        },
        {
          entityType: 'HAZARD',
          sourceLogicalKey: 'hazard-key',
          fieldCode: 'TEXT',
          translatedText: 'Mối nguy',
        },
        {
          entityType: 'CONTROL',
          sourceLogicalKey: 'control-key',
          fieldCode: 'TEXT',
          translatedText: 'Biện pháp kiểm soát',
        },
        {
          entityType: 'BASIC_STEP',
          sourceLogicalKey: 'step-key',
          fieldCode: 'TEXT',
          translatedText: 'Bước công việc',
        },
      ],
    } as unknown as TranslationDetail;

    const result = translatedJsa(source, translation);

    expect(result.languageCode).toBe('VI');
    expect(result.languageName).toBe('Vietnamese');
    expect(result.jobTitle).toBe('Công việc');
    expect(result.tasks[0]?.title).toBe('Công việc số 1');
    expect(result.tasks[0]?.hazards[0]?.text).toBe('Mối nguy');
    expect(result.tasks[0]?.hazards[0]?.controls[0]?.text).toBe('Biện pháp kiểm soát');
    expect(result.basicSteps[0]?.text).toBe('Bước công việc');
    expect(result.basicSteps[0]?.performers[0]?.name).toBe('Floorhand');
    expect(result.basicSteps[0]?.supervisors[0]?.name).toBe('Driller');
    expect(result.basicSteps[0]?.tools[0]?.name).toBe('Hammer');
    expect(result.matrix).toBe(source.matrix);
    expect(result.prompts).toBe(source.prompts);
  });

  it('falls back to English when a translated segment is blank or absent', () => {
    const source = {
      versionId: 'version-3',
      jobTitle: 'English job',
      tasks: [],
      basicSteps: [],
    } as unknown as JsaDraftDetail;
    const translation = {
      targetLanguageCode: 'VI',
      targetLanguageName: 'Vietnamese',
      segments: [
        {
          entityType: 'HEADER',
          sourceLogicalKey: 'version-3',
          fieldCode: 'JOB_TITLE',
          translatedText: '   ',
        },
      ],
    } as unknown as TranslationDetail;

    expect(translatedJsa(source, translation).jobTitle).toBe('English job');
  });
});
