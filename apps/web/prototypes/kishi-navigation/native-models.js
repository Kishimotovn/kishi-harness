function createNativeModelCatalogPrototype() {
  return {
    name: 'kishi-model-catalog-prototype',
    inject: ['llm'],
    apply(ctx) {
      ctx.effect(() => harness.handle('model-catalog', async () => {
        const models = [];
        const errors = [];
        for (const provider of ctx.llm.listProviders()) {
          try {
            const available = await ctx.llm.listModels(provider.id);
            for (const model of available) {
              models.push({ id: JSON.stringify([provider.id, model.id]), provider: provider.id, providerName: provider.name, name: model.name });
            }
          } catch {
            errors.push('Model catalog unavailable: ' + provider.name);
          }
        }
        let skills = [];
        const skillErrors = [];
        try {
          const registry = ctx.get('skills');
          if (registry === undefined) skillErrors.push('Installed skills are unavailable.');
          else {
            const catalog = await registry.snapshot();
            if (catalog.complete) skills = catalog.skills.map(skill => ({ name: skill.name }));
            else skillErrors.push('Skill discovery is incomplete.');
          }
        } catch {
          skillErrors.push('Installed skills are unavailable.');
        }
        return {
          models,
          errors,
          skills,
          skillErrors,
          namespaces: [...new Set(ctx.llm.listConfigurableProviders().map(provider => provider.settingsNs))],
        };
      }), 'kishi-prototype.model-catalog');
    },
  };
}
