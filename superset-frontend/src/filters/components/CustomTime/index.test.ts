import CustomTimeFilterPlugin from './index';

describe('CustomTimeFilterPlugin', () => {
  it('renders its controls when the bound dataset returns no option rows', () => {
    const plugin = new CustomTimeFilterPlugin();

    expect(plugin.metadata.enableNoResults).toBe(false);
    expect(plugin.metadata.datasourceCount).toBe(1);
  });
});
