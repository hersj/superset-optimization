import { ControlPanelConfig } from '@superset-ui/chart-controls';
import { t } from '@apache-superset/core/translation';
import { DEFAULT_PRESETS, TIME_GRAIN_OPTIONS } from './types';

const config: ControlPanelConfig = {
  controlPanelSections: [
    {
      label: t('UI Configuration'),
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'enablePresets',
            config: {
              type: 'CheckboxControl',
              label: t('Enable Preset Buttons'),
              default: true,
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'enableCustomRange',
            config: {
              type: 'CheckboxControl',
              label: t('Enable Custom Range Picker'),
              default: true,
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'enableTimeGrain',
            config: {
              type: 'CheckboxControl',
              label: t('Enable Time Grain Selector'),
              default: true,
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'defaultPreset',
            config: {
              type: 'SelectControl',
              label: t('Default Preset'),
              default: 'last_7d',
              choices: DEFAULT_PRESETS.map(p => [p.key, p.label]),
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'defaultGrain',
            config: {
              type: 'SelectControl',
              label: t('Default Time Grain'),
              default: 'day',
              choices: TIME_GRAIN_OPTIONS.map(g => [g.key, g.label]),
              renderTrigger: true,
            },
          },
        ],
      ],
    },
  ],
};

export default config;
